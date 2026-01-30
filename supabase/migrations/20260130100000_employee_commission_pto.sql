-- Employee Commission and PTO System
-- Add pay settings, commission rates, and PTO tracking

-- Pay settings
ALTER TABLE employees ADD COLUMN IF NOT EXISTS pay_type TEXT DEFAULT 'hourly';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS hourly_rate DECIMAL DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS annual_salary DECIMAL DEFAULT 0;

-- Commission rates
ALTER TABLE employees ADD COLUMN IF NOT EXISTS commission_goods_rate DECIMAL DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS commission_goods_type TEXT DEFAULT 'percent';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS commission_services_rate DECIMAL DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS commission_services_type TEXT DEFAULT 'percent';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS commission_software_rate DECIMAL DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS commission_software_type TEXT DEFAULT 'percent';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS commission_leads_rate DECIMAL DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS commission_leads_type TEXT DEFAULT 'flat';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS commission_setter_rate DECIMAL DEFAULT 25;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS commission_setter_type TEXT DEFAULT 'flat';

-- PTO
ALTER TABLE employees ADD COLUMN IF NOT EXISTS pto_days_per_year DECIMAL DEFAULT 10;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS pto_accrued DECIMAL DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS pto_used DECIMAL DEFAULT 0;

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_employees_pay_type ON employees(pay_type);
