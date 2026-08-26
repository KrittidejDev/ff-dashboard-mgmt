-- 1. Create table sense_official_pages if not exists
CREATE TABLE IF NOT EXISTS sense_official_pages (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    account_id VARCHAR(100) NOT NULL DEFAULT '',
    page_name VARCHAR(255),
    device_count INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    first_seen_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Bangkok'),
    updated_at TIMESTAMP DEFAULT (NOW() AT TIME ZONE 'Asia/Bangkok')
);

-- Clean up any existing duplicate records first before adding unique constraint
TRUNCATE TABLE sense_official_pages;

-- Drop old constraints and add unique constraint
ALTER TABLE sense_official_pages DROP CONSTRAINT IF EXISTS uq_sense_official_pages_email_account;
ALTER TABLE sense_official_pages DROP CONSTRAINT IF EXISTS uq_sense_official_pages_email;
ALTER TABLE sense_official_pages ADD CONSTRAINT uq_sense_official_pages_email UNIQUE (email);

-- 2. Indices for ultra-fast query performance
CREATE INDEX IF NOT EXISTS idx_sense_official_pages_email ON sense_official_pages(email);
CREATE INDEX IF NOT EXISTS idx_sense_official_pages_account ON sense_official_pages(account_id);
CREATE INDEX IF NOT EXISTS idx_sense_official_pages_active_count ON sense_official_pages(is_active, device_count DESC);

-- 3. Trigger function to sync from device_registrations to sense_official_pages
CREATE OR REPLACE FUNCTION sync_device_to_sense_official_pages()
RETURNS TRIGGER AS $$
BEGIN
    -- Handle OLD record on DELETE or UPDATE
    IF (TG_OP = 'DELETE' OR TG_OP = 'UPDATE') THEN
        IF OLD.email IS NOT NULL AND OLD.email != '' THEN
            UPDATE sense_official_pages
            SET device_count = (
                SELECT COUNT(*) FROM device_registrations 
                WHERE email = OLD.email
            ),
            updated_at = (NOW() AT TIME ZONE 'Asia/Bangkok')
            WHERE email = OLD.email;
        END IF;
    END IF;

    -- Handle NEW record on INSERT or UPDATE
    IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
        IF NEW.email IS NOT NULL AND NEW.email != '' THEN
            INSERT INTO sense_official_pages (email, account_id, device_count, updated_at)
            VALUES (
                NEW.email,
                COALESCE(NEW.account_id, ''),
                1,
                (NOW() AT TIME ZONE 'Asia/Bangkok')
            )
            ON CONFLICT (email) DO UPDATE SET
                account_id = COALESCE(NULLIF(EXCLUDED.account_id, ''), sense_official_pages.account_id),
                device_count = (
                    SELECT COUNT(*) FROM device_registrations 
                    WHERE email = EXCLUDED.email
                ),
                is_active = TRUE,
                updated_at = (NOW() AT TIME ZONE 'Asia/Bangkok');
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Attach trigger to device_registrations
DROP TRIGGER IF EXISTS trg_sync_sense_official_pages ON device_registrations;
CREATE TRIGGER trg_sync_sense_official_pages
AFTER INSERT OR UPDATE OR DELETE ON device_registrations
FOR EACH ROW EXECUTE FUNCTION sync_device_to_sense_official_pages();

-- 5. Backfill unique records
INSERT INTO sense_official_pages (email, account_id, device_count, first_seen_at, updated_at)
SELECT 
    email,
    COALESCE(MAX(account_id), '') AS account_id,
    COUNT(*) AS device_count,
    (NOW() AT TIME ZONE 'Asia/Bangkok'),
    (NOW() AT TIME ZONE 'Asia/Bangkok')
FROM (
    SELECT email, account_id FROM device_registrations WHERE email IS NOT NULL AND email != ''
    UNION ALL
    SELECT email, account_id FROM device_master WHERE email IS NOT NULL AND email != '' AND NOT EXISTS (SELECT 1 FROM device_registrations WHERE email IS NOT NULL AND email != '')
) src
GROUP BY email
ON CONFLICT (email) DO UPDATE SET
    account_id = EXCLUDED.account_id,
    device_count = EXCLUDED.device_count,
    is_active = TRUE,
    updated_at = (NOW() AT TIME ZONE 'Asia/Bangkok');
