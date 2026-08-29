-- =========================================================================
-- Migration: Anchor device_master uniquely on Factory Hardware Serial
-- =========================================================================

-- 1. Deduplicate device_master by Factory Serial (keep latest updated record with active station/email)
WITH ranked_serials AS (
    SELECT id, 
           serial,
           ROW_NUMBER() OVER (
               PARTITION BY serial 
               ORDER BY 
                   (email IS NOT NULL AND email != '') DESC,
                   (station IS NOT NULL AND station != '' AND station != serial) DESC,
                   updated_at DESC, 
                   id DESC
           ) as rn
    FROM device_master
    WHERE serial IS NOT NULL AND serial != ''
)
DELETE FROM device_master
WHERE id IN (
    SELECT id FROM ranked_serials WHERE rn > 1
);

-- Drop previous station-only index if exists and create Unique Index on serial
DROP INDEX IF EXISTS uq_device_master_station;
CREATE UNIQUE INDEX IF NOT EXISTS uq_device_master_serial 
ON device_master (serial) 
WHERE serial IS NOT NULL AND serial != '';

-- 2. Upgrade Trigger for device_registrations with Serial-First In-Place Update
CREATE OR REPLACE FUNCTION sync_device_registration_to_master()
RETURNS TRIGGER AS $$
DECLARE
    v_serial TEXT;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        DELETE FROM fahfon_current WHERE imei = OLD.imei OR device_id = OLD.station;
        DELETE FROM fahfon_current_stat WHERE imei = OLD.imei OR device_id = OLD.station;
        DELETE FROM device_master WHERE mongo_id = OLD.mongo_id;
        RETURN OLD;
    ELSE
        -- 1. Resolve true Factory Serial from device_specifications by IMEI or station code
        SELECT serial INTO v_serial FROM device_specifications WHERE imei = NEW.imei LIMIT 1;
        IF v_serial IS NULL OR v_serial = '' THEN
            IF NEW.station ~ '^S[0-9]-[0-9]+' THEN
                v_serial := NEW.station;
            END IF;
        END IF;

        -- 2. PRIMARY ANCHOR: If device with this true Hardware Serial already exists -> UPDATE IN-PLACE
        IF v_serial IS NOT NULL AND v_serial != '' AND EXISTS (SELECT 1 FROM device_master WHERE serial = v_serial) THEN
            UPDATE device_master
            SET mongo_id = NEW.mongo_id,
                station = NEW.station,
                imei = NEW.imei,
                owner = NEW.owner,
                email = NEW.email,
                site = NEW.site,
                lat = COALESCE(NULLIF(NEW.lat, 0), device_master.lat),
                lng = COALESCE(NULLIF(NEW.lng, 0), device_master.lng),
                interval = NEW.interval,
                account_id = NEW.account_id,
                updated_at = NOW() AT TIME ZONE 'Asia/Bangkok'
            WHERE serial = v_serial;
            RETURN NEW;
        END IF;

        -- 3. SECONDARY ANCHOR: If device with this IMEI already exists -> UPDATE IN-PLACE
        IF NEW.imei IS NOT NULL AND NEW.imei != '' AND EXISTS (SELECT 1 FROM device_master WHERE imei = NEW.imei) THEN
            UPDATE device_master
            SET mongo_id = NEW.mongo_id,
                station = NEW.station,
                serial = COALESCE(v_serial, device_master.serial),
                owner = NEW.owner,
                email = NEW.email,
                site = NEW.site,
                lat = COALESCE(NULLIF(NEW.lat, 0), device_master.lat),
                lng = COALESCE(NULLIF(NEW.lng, 0), device_master.lng),
                interval = NEW.interval,
                account_id = NEW.account_id,
                updated_at = NOW() AT TIME ZONE 'Asia/Bangkok'
            WHERE imei = NEW.imei;
            RETURN NEW;
        END IF;

        -- 4. TERTIARY ANCHOR: If mongo_id already exists -> UPDATE IN-PLACE
        IF NEW.mongo_id IS NOT NULL AND NEW.mongo_id != '' AND EXISTS (SELECT 1 FROM device_master WHERE mongo_id = NEW.mongo_id) THEN
            UPDATE device_master
            SET station = NEW.station,
                imei = NEW.imei,
                serial = COALESCE(v_serial, device_master.serial),
                owner = NEW.owner,
                email = NEW.email,
                site = NEW.site,
                lat = COALESCE(NULLIF(NEW.lat, 0), device_master.lat),
                lng = COALESCE(NULLIF(NEW.lng, 0), device_master.lng),
                interval = NEW.interval,
                account_id = NEW.account_id,
                updated_at = NOW() AT TIME ZONE 'Asia/Bangkok'
            WHERE mongo_id = NEW.mongo_id;
            RETURN NEW;
        END IF;

        -- 5. Brand new physical device -> INSERT
        INSERT INTO device_master (
            mongo_id, station, imei, owner, email, site, lat, lng, interval, updated_at, account_id, serial
        )
        VALUES (
            NEW.mongo_id,
            NEW.station, 
            NEW.imei, 
            NEW.owner, 
            NEW.email,
            NEW.site, 
            NEW.lat, 
            NEW.lng, 
            NEW.interval, 
            NOW() AT TIME ZONE 'Asia/Bangkok',
            NEW.account_id,
            COALESCE(v_serial, NEW.station)
        )
        ON CONFLICT (mongo_id) DO UPDATE SET
            station = EXCLUDED.station,
            imei = EXCLUDED.imei,
            owner = EXCLUDED.owner,
            email = EXCLUDED.email,
            site = EXCLUDED.site,
            lat = COALESCE(NULLIF(EXCLUDED.lat, 0), device_master.lat),
            lng = COALESCE(NULLIF(EXCLUDED.lng, 0), device_master.lng),
            interval = EXCLUDED.interval,
            account_id = EXCLUDED.account_id,
            serial = COALESCE(EXCLUDED.serial, device_master.serial),
            updated_at = NOW() AT TIME ZONE 'Asia/Bangkok';

        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 3. Upgrade Trigger for device_specifications with Serial-First In-Place Update
CREATE OR REPLACE FUNCTION sync_device_specification_to_master()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        IF NOT EXISTS (SELECT 1 FROM device_registrations WHERE mongo_id = OLD.mongo_id OR imei = OLD.imei) THEN
            DELETE FROM device_master WHERE imei = OLD.imei OR mongo_id = OLD.mongo_id OR (serial IS NOT NULL AND serial = OLD.serial);
        ELSE
            UPDATE device_master 
            SET secret_key = NULL, 
                updated_at = NOW() AT TIME ZONE 'Asia/Bangkok' 
            WHERE serial = OLD.serial OR imei = OLD.imei;
        END IF;
        RETURN OLD;
    ELSE
        -- 1. PRIMARY: Update in-place by Serial
        IF NEW.serial IS NOT NULL AND NEW.serial != '' AND EXISTS (SELECT 1 FROM device_master WHERE serial = NEW.serial) THEN
            UPDATE device_master 
            SET secret_key = NEW.secret_key,
                imei = COALESCE(NEW.imei, device_master.imei),
                updated_at = NOW() AT TIME ZONE 'Asia/Bangkok'
            WHERE serial = NEW.serial;
            RETURN NEW;
        END IF;

        -- 2. SECONDARY: Update in-place by IMEI
        IF NEW.imei IS NOT NULL AND NEW.imei != '' AND EXISTS (SELECT 1 FROM device_master WHERE imei = NEW.imei) THEN
            UPDATE device_master 
            SET secret_key = NEW.secret_key,
                serial = COALESCE(NEW.serial, device_master.serial),
                updated_at = NOW() AT TIME ZONE 'Asia/Bangkok'
            WHERE imei = NEW.imei;
            RETURN NEW;
        END IF;

        -- 3. Insert new specification if not present
        INSERT INTO device_master (mongo_id, station, imei, serial, secret_key, site, updated_at)
        VALUES (NEW.mongo_id, NEW.serial, NEW.imei, NEW.serial, NEW.secret_key, NEW.site, NOW() AT TIME ZONE 'Asia/Bangkok')
        ON CONFLICT (mongo_id) DO UPDATE SET
            serial = EXCLUDED.serial,
            secret_key = EXCLUDED.secret_key,
            updated_at = NOW() AT TIME ZONE 'Asia/Bangkok';

        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;
