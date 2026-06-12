-- Editable ship-to address on purchase_orders. Overrides the job
-- address in the PDF when set; falls back to job.job_address otherwise.

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS ship_to_address text;
