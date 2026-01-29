-- Data Console Setup - Developer Admin Panel Tables
-- Run this in Supabase SQL Editor

-- Add developer/admin flags to employees
ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_developer BOOLEAN DEFAULT false;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;

-- Set Bryce as developer (adjust email as needed)
UPDATE employees SET is_developer = true, is_admin = true WHERE email ILIKE '%bryce%';

-- Feedback table for user submissions
CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id),
  user_email TEXT,
  page_url TEXT,
  feedback_type TEXT, -- bug, feature, question
  message TEXT,
  screenshot_url TEXT,
  status TEXT DEFAULT 'new', -- new, reviewed, resolved
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  notes TEXT
);

-- Audit log for tracking data changes
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID,
  user_email TEXT,
  action TEXT, -- create, update, delete
  table_name TEXT,
  record_id UUID,
  old_values JSONB,
  new_values JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- System settings key-value store
CREATE TABLE IF NOT EXISTS system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT
);

-- Enable RLS
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- Policies (allow all for now - developer only access controlled at app level)
DROP POLICY IF EXISTS "feedback_all" ON feedback;
DROP POLICY IF EXISTS "audit_log_all" ON audit_log;
DROP POLICY IF EXISTS "system_settings_all" ON system_settings;

CREATE POLICY "feedback_all" ON feedback FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "audit_log_all" ON audit_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "system_settings_all" ON system_settings FOR ALL USING (true) WITH CHECK (true);

-- Insert some default system settings
INSERT INTO system_settings (key, value, description) VALUES
  ('app_version', '"1.0.0"', 'Current application version'),
  ('maintenance_mode', 'false', 'Enable maintenance mode'),
  ('feature_flags', '{"ai_agents": true, "bulk_import": true}', 'Feature toggles'),
  ('default_electric_rate', '0.12', 'Default electric rate for new audits')
ON CONFLICT (key) DO NOTHING;
