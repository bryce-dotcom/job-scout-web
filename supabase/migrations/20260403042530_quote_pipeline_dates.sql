-- Add approved_date and rejected_date for estimate-based pipeline tracking
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS approved_date TIMESTAMPTZ;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS rejected_date TIMESTAMPTZ;
