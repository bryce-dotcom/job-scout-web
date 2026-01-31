-- Employee Multi Pay Types
-- Allow employees to have multiple pay types (hourly + salary + commission)

ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_hourly BOOLEAN DEFAULT false;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_salary BOOLEAN DEFAULT false;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS is_commission BOOLEAN DEFAULT false;
