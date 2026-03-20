-- Add description column to quote_lines and job_lines for custom line item descriptions
ALTER TABLE quote_lines ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE job_lines ADD COLUMN IF NOT EXISTS description text;
