-- Add item_name column to job_lines for custom line items (not linked to products catalog)
ALTER TABLE job_lines ADD COLUMN IF NOT EXISTS item_name TEXT;
