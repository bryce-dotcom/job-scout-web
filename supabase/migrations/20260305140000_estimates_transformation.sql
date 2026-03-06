-- Estimates Transformation
-- Adds new columns to quotes/quote_lines tables for the Estimates feature.
-- UI renames Quotes -> Estimates, but DB tables stay as-is to preserve FK/RLS/offline sync.

-- New columns on quotes table
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS estimate_name TEXT,
  ADD COLUMN IF NOT EXISTS summary TEXT,
  ADD COLUMN IF NOT EXISTS expiration_date DATE,
  ADD COLUMN IF NOT EXISTS service_date DATE,
  ADD COLUMN IF NOT EXISTS technician_id INTEGER REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS estimate_message TEXT,
  ADD COLUMN IF NOT EXISTS deposit_amount DECIMAL(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deposit_method TEXT,
  ADD COLUMN IF NOT EXISTS deposit_date DATE,
  ADD COLUMN IF NOT EXISTS deposit_notes TEXT,
  ADD COLUMN IF NOT EXISTS job_id INTEGER REFERENCES jobs(id),
  ADD COLUMN IF NOT EXISTS pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS pdf_layout TEXT DEFAULT 'email',
  ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sent_to_email TEXT,
  ADD COLUMN IF NOT EXISTS settings_overrides JSONB;

-- New columns on quote_lines table
ALTER TABLE quote_lines
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- Allow file_attachments to be linked to estimates (quotes)
ALTER TABLE file_attachments
  ADD COLUMN IF NOT EXISTS quote_id BIGINT REFERENCES quotes(id) ON DELETE SET NULL;
