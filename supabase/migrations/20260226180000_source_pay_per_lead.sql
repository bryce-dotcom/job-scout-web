-- Add company-level default rate for lead source commissions
ALTER TABLE companies ADD COLUMN IF NOT EXISTS source_pay_per_lead DECIMAL DEFAULT 0;
