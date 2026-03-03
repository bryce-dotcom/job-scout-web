-- Add financial breakdown columns to utility_invoices
ALTER TABLE utility_invoices ADD COLUMN IF NOT EXISTS project_cost NUMERIC;
ALTER TABLE utility_invoices ADD COLUMN IF NOT EXISTS incentive_amount NUMERIC;
ALTER TABLE utility_invoices ADD COLUMN IF NOT EXISTS net_cost NUMERIC;
ALTER TABLE utility_invoices ADD COLUMN IF NOT EXISTS lead_id INTEGER;
ALTER TABLE utility_invoices ADD COLUMN IF NOT EXISTS customer_name TEXT;
