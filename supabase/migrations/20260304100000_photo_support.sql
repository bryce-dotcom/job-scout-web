-- Add photo support columns to file_attachments
ALTER TABLE file_attachments ADD COLUMN IF NOT EXISTS job_line_id BIGINT REFERENCES job_lines(id) ON DELETE CASCADE;
ALTER TABLE file_attachments ADD COLUMN IF NOT EXISTS photo_context TEXT;
CREATE INDEX IF NOT EXISTS idx_file_attachments_job_line ON file_attachments(job_line_id);
