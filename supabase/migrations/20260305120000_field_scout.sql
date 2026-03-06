-- Field Scout: Add job_id to time_clock so techs can clock in against a specific job
ALTER TABLE time_clock ADD COLUMN IF NOT EXISTS job_id INTEGER REFERENCES jobs(id);
CREATE INDEX IF NOT EXISTS idx_time_clock_job_id ON time_clock(job_id);
