-- Enable the uuid-ossp extension to allow generating random UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Add the uuid column to device_master if it doesn't exist yet
ALTER TABLE device_master ADD COLUMN IF NOT EXISTS uuid UUID DEFAULT uuid_generate_v4();

-- Seed UUID values for any pre-existing rows in device_master
UPDATE device_master SET uuid = uuid_generate_v4() WHERE uuid IS NULL;

-- Enforce NOT NULL and UNIQUE constraints on the uuid column
ALTER TABLE device_master ALTER COLUMN uuid SET NOT NULL;
ALTER TABLE device_master ADD CONSTRAINT device_master_uuid_unique UNIQUE (uuid);
