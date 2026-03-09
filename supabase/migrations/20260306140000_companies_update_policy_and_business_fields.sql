-- Add UPDATE policy for companies table
-- Fixes: company profile save silently failing due to RLS
CREATE POLICY "Users can update own company" ON companies
  FOR UPDATE USING (
    owner_email = auth.jwt() ->> 'email'
    OR id IN (SELECT company_id FROM employees WHERE email = auth.jwt() ->> 'email' AND active = true)
  );

-- Business information fields for admin section
ALTER TABLE companies ADD COLUMN IF NOT EXISTS ein TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS tax_exempt_number TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS license_number TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS insurance_policy_number TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS insurance_provider TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS insurance_expiration DATE;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS workers_comp_policy TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS workers_comp_expiration DATE;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS bonded BOOLEAN DEFAULT false;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS bond_amount DECIMAL;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS state_of_incorporation TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS fiscal_year_end TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS duns_number TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS naics_code TEXT;

-- Document storage references (paths into project-documents bucket)
ALTER TABLE companies ADD COLUMN IF NOT EXISTS insurance_cert_url TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS tax_exempt_cert_url TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS operating_agreement_url TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS w9_url TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS business_license_url TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS workers_comp_cert_url TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS bond_cert_url TEXT;
