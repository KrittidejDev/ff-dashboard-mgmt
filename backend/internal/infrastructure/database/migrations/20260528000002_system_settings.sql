-- Create system_settings table to store centralized alert configurations
CREATE TABLE IF NOT EXISTS system_settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    value JSONB NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'Asia/Bangkok'),
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'Asia/Bangkok')
);

-- Seed default global warning email setting (empty array by default)
INSERT INTO system_settings (key, value)
VALUES ('warning_emails', '[]')
ON CONFLICT (key) DO NOTHING;



