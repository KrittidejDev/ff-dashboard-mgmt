-- =========================================================================
-- Migration: Add serial column to device_master, update triggers, and add GIN trgm search indexes
-- =========================================================================

-- 1. Add serial column to device_master if not exists
ALTER TABLE device_master ADD COLUMN IF NOT EXISTS serial TEXT;

-- 2. Backfill serial data from device_specifications by imei
UPDATE device_master dm
SET serial = ds.serial
FROM device_specifications ds
WHERE (dm.serial IS NULL OR dm.serial = '')
  AND dm.imei = ds.imei
  AND ds.serial IS NOT NULL;

-- Also backfill where station matched serial if imei didn't match
UPDATE device_master dm
SET serial = ds.serial
FROM device_specifications ds
WHERE (dm.serial IS NULL OR dm.serial = '')
  AND dm.station = ds.serial
  AND ds.serial IS NOT NULL;

-- 3. Update Trigger for device_registrations to sync serial from device_specifications
CREATE OR REPLACE FUNCTION sync_device_registration_to_master()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        -- ลบข้อมูลดิบย้อนหลังและสถานะปัจจุบันของอุปกรณ์เครื่องที่ถูกลบเพื่อป้องกันข้อมูลขยะชนกับเครื่องใหม่
        DELETE FROM fahfon_current WHERE imei = OLD.imei OR device_id = OLD.station;
        DELETE FROM fahfon_current_stat WHERE imei = OLD.imei OR device_id = OLD.station;
        DELETE FROM device_master WHERE mongo_id = OLD.mongo_id;
        RETURN OLD;
    ELSE
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
            (SELECT serial FROM device_specifications WHERE imei = NEW.imei LIMIT 1)
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
            serial = COALESCE(EXCLUDED.serial, device_master.serial, (SELECT serial FROM device_specifications WHERE imei = EXCLUDED.imei LIMIT 1)),
            updated_at = NOW() AT TIME ZONE 'Asia/Bangkok';
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 4. Update Trigger for device_specifications to sync serial & secret_key to device_master
CREATE OR REPLACE FUNCTION sync_device_specification_to_master()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        -- หากไม่มีเครื่องนี้ในระบบทะเบียน (device_registrations) แล้ว ให้ลบจาก device_master ไปด้วย
        IF NOT EXISTS (SELECT 1 FROM device_registrations WHERE mongo_id = OLD.mongo_id OR imei = OLD.imei) THEN
            DELETE FROM device_master WHERE imei = OLD.imei OR mongo_id = OLD.mongo_id;
        ELSE
            UPDATE device_master 
            SET secret_key = NULL, 
                serial = NULL,
                updated_at = NOW() AT TIME ZONE 'Asia/Bangkok' 
            WHERE imei = OLD.imei;
        END IF;
        RETURN OLD;
    ELSE
        UPDATE device_master 
        SET secret_key = NEW.secret_key,
            serial = NEW.serial,
            updated_at = NOW() AT TIME ZONE 'Asia/Bangkok'
        WHERE imei = NEW.imei;
        
        IF NOT FOUND THEN
            INSERT INTO device_master (mongo_id, station, imei, serial, secret_key, site, updated_at)
            VALUES (NEW.mongo_id, NEW.serial, NEW.imei, NEW.serial, NEW.secret_key, NEW.site, NOW() AT TIME ZONE 'Asia/Bangkok')
            ON CONFLICT (mongo_id) DO UPDATE SET
                serial = EXCLUDED.serial,
                secret_key = EXCLUDED.secret_key,
                updated_at = NOW() AT TIME ZONE 'Asia/Bangkok';
        END IF;
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 5. Standard B-Tree Indexes
CREATE INDEX IF NOT EXISTS idx_device_master_serial ON device_master(serial);
CREATE INDEX IF NOT EXISTS idx_specifications_serial ON device_specifications(serial);

-- 6. GIN Trigram Search Indexes for ultra-fast Substring / ILIKE queries
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_device_master_serial_trgm ON device_master USING gin (serial gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_device_master_station_trgm ON device_master USING gin (station gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_device_master_imei_trgm ON device_master USING gin (imei gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_device_master_owner_trgm ON device_master USING gin (owner gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_device_master_site_trgm ON device_master USING gin (site gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_device_master_email_trgm ON device_master USING gin (email gin_trgm_ops);
