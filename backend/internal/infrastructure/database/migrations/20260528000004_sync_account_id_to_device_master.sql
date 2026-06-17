-- 1. Add account_id to device_registrations if it does not exist
ALTER TABLE device_registrations ADD COLUMN IF NOT EXISTS account_id VARCHAR(100);

-- 2. Add account_id to device_master if it does not exist
ALTER TABLE device_master ADD COLUMN IF NOT EXISTS account_id VARCHAR(100);

-- 3. Create indices for fast filtering by account_id and email
CREATE INDEX IF NOT EXISTS idx_registrations_account_id ON device_registrations(account_id);
CREATE INDEX IF NOT EXISTS idx_master_account_id ON device_master(account_id);

-- 4. Update the sync trigger function to include account_id
CREATE OR REPLACE FUNCTION sync_device_registration_to_master()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'DELETE') THEN
        DELETE FROM device_master WHERE mongo_id = OLD.mongo_id;
        RETURN OLD;
    ELSE
        INSERT INTO device_master (
            mongo_id, station, imei, owner, email, site, lat, lng, interval, updated_at, account_id
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
            (NOW() AT TIME ZONE 'Asia/Bangkok'),
            NEW.account_id
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
            updated_at = (NOW() AT TIME ZONE 'Asia/Bangkok'),
            account_id = EXCLUDED.account_id;
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- 5. Backfill existing records from account_uuid and sync to device_master
UPDATE device_registrations SET account_id = account_uuid::text WHERE account_id IS NULL AND account_uuid IS NOT NULL;
UPDATE device_master dm SET account_id = dr.account_id FROM device_registrations dr WHERE dm.mongo_id = dr.mongo_id;
