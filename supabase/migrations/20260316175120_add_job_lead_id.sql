-- Add job_lead_id column to jobs table for crew lead assignment
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_lead_id integer REFERENCES employees(id);
