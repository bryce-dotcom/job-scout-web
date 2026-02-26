-- Add lead_id to jobs for direct lead-to-job tracking through delivery pipeline
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS lead_id INTEGER REFERENCES leads(id);
CREATE INDEX IF NOT EXISTS idx_jobs_lead ON jobs(lead_id);
