-- Add business_unit to purchase_orders so the PDF header shows the
-- correct division (e.g. "Energy Scout") not always the top-level
-- company name. Populated from job.business_unit on job-linked POs;
-- set manually on multi-job procurement POs.

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS business_unit text;
