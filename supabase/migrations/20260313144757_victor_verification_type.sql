-- Add verification_type column to verification_reports
ALTER TABLE verification_reports
  ADD COLUMN IF NOT EXISTS verification_type text DEFAULT 'completion';

-- Make job_id nullable for daily checks (no specific job)
ALTER TABLE verification_reports
  ALTER COLUMN job_id DROP NOT NULL;
