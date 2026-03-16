-- Add deposit photo and linking columns to quotes
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS deposit_amount numeric DEFAULT 0;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS deposit_method text;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS deposit_date date;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS deposit_notes text;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS deposit_photo text;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS job_id integer REFERENCES jobs(id);

-- Add deposit tracking to payments table for invoice linking
ALTER TABLE payments ADD COLUMN IF NOT EXISTS is_deposit boolean DEFAULT false;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS quote_id integer REFERENCES quotes(id);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS receipt_photo text;
