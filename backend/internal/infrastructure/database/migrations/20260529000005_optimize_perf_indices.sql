-- Create high-performance index for retrieving the latest telemetry from fahfon_current
CREATE INDEX IF NOT EXISTS idx_fahfon_current_imei_time_onsite ON fahfon_current (imei, time_onsite DESC);

-- Create index on device_master imei to speed up joins
CREATE INDEX IF NOT EXISTS idx_device_master_imei ON device_master (imei);

-- Create index on device_master email to speed up official pages query and filtering
CREATE INDEX IF NOT EXISTS idx_device_master_email ON device_master (email);
