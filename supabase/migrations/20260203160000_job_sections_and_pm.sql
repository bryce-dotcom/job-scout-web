-- Create job_sections table for breaking jobs into trackable sections
CREATE TABLE IF NOT EXISTS job_sections (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id),
  job_id INTEGER REFERENCES jobs(id),
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  percent_of_job DECIMAL DEFAULT 0,
  status TEXT DEFAULT 'Not Started' CHECK (status IN ('Not Started', 'In Progress', 'Complete', 'Verified')),
  assigned_to INTEGER REFERENCES employees(id),
  scheduled_date DATE,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  estimated_hours DECIMAL,
  actual_hours DECIMAL,
  notes TEXT,
  verified_by INTEGER REFERENCES employees(id),
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_job_sections_job_id ON job_sections(job_id);
CREATE INDEX IF NOT EXISTS idx_job_sections_company_id ON job_sections(company_id);
CREATE INDEX IF NOT EXISTS idx_job_sections_assigned_to ON job_sections(assigned_to);

-- Enable RLS on job_sections
ALTER TABLE job_sections ENABLE ROW LEVEL SECURITY;

-- Open RLS policy for job_sections (drop if exists first to avoid duplicate error)
DROP POLICY IF EXISTS "Allow all access to job_sections" ON job_sections;
CREATE POLICY "Allow all access to job_sections" ON job_sections
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Add pm_id column to jobs table for Project Manager assignment
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS pm_id INTEGER REFERENCES employees(id);

-- Add employee_roles setting with Project Manager role (update if exists, insert if not)
INSERT INTO settings (company_id, key, value)
SELECT 3, 'employee_roles', '["Sales","Setter","Technician","Project Manager","Admin"]'
WHERE NOT EXISTS (
  SELECT 1 FROM settings WHERE company_id = 3 AND key = 'employee_roles'
);

-- Update existing employee_roles if it exists but doesn't have Project Manager
UPDATE settings
SET value = '["Sales","Setter","Technician","Project Manager","Admin"]'
WHERE company_id = 3
  AND key = 'employee_roles'
  AND value NOT LIKE '%Project Manager%';
