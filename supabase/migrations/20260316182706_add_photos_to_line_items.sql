-- Add photos array column to quote_lines and job_lines
ALTER TABLE quote_lines ADD COLUMN IF NOT EXISTS photos text[];
ALTER TABLE job_lines ADD COLUMN IF NOT EXISTS photos text[];
