-- Beta Signup: new tables, RLS fix, seed invite codes

-- ============================================
-- 1. beta_invite_codes table
-- ============================================
CREATE TABLE IF NOT EXISTS beta_invite_codes (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  max_uses INTEGER DEFAULT 1,
  times_used INTEGER DEFAULT 0,
  expires_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. employee_invitations table
-- ============================================
CREATE TABLE IF NOT EXISTS employee_invitations (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  email TEXT NOT NULL,
  role TEXT DEFAULT 'Field Tech',
  user_role TEXT DEFAULT 'User',
  invited_by INTEGER REFERENCES employees(id),
  status TEXT DEFAULT 'pending',
  token TEXT UNIQUE DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days')
);

-- ============================================
-- 3. Add setup_complete to companies
-- ============================================
ALTER TABLE companies ADD COLUMN IF NOT EXISTS setup_complete BOOLEAN DEFAULT false;

-- Mark existing companies as setup complete
UPDATE companies SET setup_complete = true WHERE setup_complete IS NULL OR setup_complete = false;

-- ============================================
-- 4. Fix get_user_company_id() — Critical RLS fix
-- ============================================
CREATE OR REPLACE FUNCTION get_user_company_id()
RETURNS INTEGER AS $$
  SELECT COALESCE(
    (SELECT id FROM companies WHERE owner_email = auth.jwt() ->> 'email' LIMIT 1),
    (SELECT company_id FROM employees WHERE email = auth.jwt() ->> 'email' AND active = true LIMIT 1)
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- ============================================
-- 5. RLS for beta_invite_codes
-- ============================================
ALTER TABLE beta_invite_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read invite codes" ON beta_invite_codes;
CREATE POLICY "Anyone can read invite codes" ON beta_invite_codes
  FOR SELECT USING (true);

-- ============================================
-- 6. RLS for employee_invitations
-- ============================================
ALTER TABLE employee_invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Company isolation" ON employee_invitations;
CREATE POLICY "Company isolation" ON employee_invitations
  FOR ALL USING (company_id = get_user_company_id());

-- ============================================
-- 7. Fix companies SELECT policy for non-owners
-- ============================================
DROP POLICY IF EXISTS "Users can view own company" ON companies;
CREATE POLICY "Users can view own company" ON companies
  FOR SELECT USING (
    owner_email = auth.jwt() ->> 'email'
    OR id IN (SELECT company_id FROM employees WHERE email = auth.jwt() ->> 'email' AND active = true)
  );

-- ============================================
-- 8. Seed initial invite codes
-- ============================================
INSERT INTO beta_invite_codes (code, max_uses, created_by) VALUES
  ('JOBSCOUT-BETA-2026', 100, 'system'),
  ('SCOUT-EARLY-ACCESS', 50, 'system')
ON CONFLICT (code) DO NOTHING;
