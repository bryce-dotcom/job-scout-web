-- Add missing columns to lead_payments for full income/deposit tracking
ALTER TABLE lead_payments ADD COLUMN IF NOT EXISTS business text;
ALTER TABLE lead_payments ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE lead_payments ADD COLUMN IF NOT EXISTS account text;
ALTER TABLE lead_payments ADD COLUMN IF NOT EXISTS receipt text;
