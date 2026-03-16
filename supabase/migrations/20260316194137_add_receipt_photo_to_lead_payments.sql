-- Add receipt photo and invoice/job linking to lead_payments
ALTER TABLE lead_payments ADD COLUMN IF NOT EXISTS receipt_photo text;
ALTER TABLE lead_payments ADD COLUMN IF NOT EXISTS invoice_id integer REFERENCES invoices(id);
ALTER TABLE lead_payments ADD COLUMN IF NOT EXISTS job_id integer REFERENCES jobs(id);
ALTER TABLE lead_payments ADD COLUMN IF NOT EXISTS payment_method text;
