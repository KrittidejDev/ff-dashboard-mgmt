-- Create system_users table
CREATE TABLE IF NOT EXISTS system_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'user' CHECK (role IN ('SuperAdmin', 'Admin', 'user')),
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'Asia/Bangkok'),
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'Asia/Bangkok')
);

-- Index for fast user searches
CREATE INDEX IF NOT EXISTS idx_users_username ON system_users(username);

-- Insert default SuperAdmin user (password: admin1234)
INSERT INTO system_users (id, username, email, password_hash, role)
VALUES (
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    'superadmin',
    'superadmin@fahfon.io',
    '$2a$10$XIyB0QOUgyNs1zL7BtvXUOcy/VkPK5/k4bJNu1JG5RspEsajf3gk2',
    'SuperAdmin'
) ON CONFLICT (username) DO NOTHING;

-- Create system_audit_logs table
CREATE TABLE IF NOT EXISTS system_audit_logs (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID REFERENCES system_users(id) ON DELETE SET NULL,
    username VARCHAR(100),
    action VARCHAR(100) NOT NULL,
    resource VARCHAR(100) NOT NULL,
    details JSONB NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    user_agent TEXT NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT (NOW() AT TIME ZONE 'Asia/Bangkok')
);

-- Index for fast log retrieval sorted by time descending
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON system_audit_logs(created_at DESC);
