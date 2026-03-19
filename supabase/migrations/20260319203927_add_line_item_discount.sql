-- Add per-line discount to quote_lines and job_lines
ALTER TABLE quote_lines ADD COLUMN IF NOT EXISTS discount numeric DEFAULT 0;
ALTER TABLE job_lines ADD COLUMN IF NOT EXISTS discount numeric DEFAULT 0;
