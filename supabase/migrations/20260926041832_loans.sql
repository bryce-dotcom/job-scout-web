-- Loans in Books (Bryce, 2026-09-25): "I want loans through Plaid and a
-- manual way to put in loans and the payments, then when a matching amount
-- goes through the bank it can be matched, verified and booked."
--
-- liabilities already holds hand-entered loans (name, lender, balance,
-- monthly_payment). It grows the fields a loan actually has, a link to the
-- Plaid account when the loan came through Link (Liabilities product), and
-- the payee text used to recognise the payment in the bank feed.
ALTER TABLE liabilities
  ADD COLUMN IF NOT EXISTS connected_account_id INTEGER REFERENCES connected_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS plaid_account_id TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS interest_rate NUMERIC,
  ADD COLUMN IF NOT EXISTS next_payment_due DATE,
  ADD COLUMN IF NOT EXISTS next_payment_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS last_payment_date DATE,
  ADD COLUMN IF NOT EXISTS last_payment_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS origination_date DATE,
  ADD COLUMN IF NOT EXISTS original_principal NUMERIC,
  ADD COLUMN IF NOT EXISTS term_months INTEGER,
  ADD COLUMN IF NOT EXISTS payment_day INTEGER,
  ADD COLUMN IF NOT EXISTS match_payee TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE UNIQUE INDEX IF NOT EXISTS idx_liabilities_plaid_account
  ON liabilities(company_id, plaid_account_id) WHERE plaid_account_id IS NOT NULL;

-- One row per payment made on a loan. A row linked to a bank transaction is
-- a VERIFIED payment (the money really left); a row without one was typed in.
CREATE TABLE IF NOT EXISTS loan_payments (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  liability_id INTEGER NOT NULL REFERENCES liabilities(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  amount NUMERIC NOT NULL,
  principal NUMERIC,
  interest NUMERIC,
  plaid_transaction_id INTEGER REFERENCES plaid_transactions(id) ON DELETE SET NULL,
  source TEXT DEFAULT 'manual',          -- manual | bank_match
  verified_at TIMESTAMPTZ,
  verified_by TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_loan_payments_txn
  ON loan_payments(plaid_transaction_id) WHERE plaid_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_loan_payments_company_date ON loan_payments(company_id, date);

-- The bank row knows it is a loan payment, so Money Out counts only the
-- interest as an expense (principal is a balance-sheet move).
ALTER TABLE plaid_transactions
  ADD COLUMN IF NOT EXISTS loan_payment_id INTEGER REFERENCES loan_payments(id) ON DELETE SET NULL;

ALTER TABLE loan_payments ENABLE ROW LEVEL SECURITY;
-- Same policies as every other tenant table (tenant_isolation on
-- current_user_company_ids(), plus the require_writable_* trial gate): copied
-- from liabilities so this table can never drift from the rollout.
DO $$
DECLARE r record; cmd text; sql text;
BEGIN
  FOR r IN SELECT polname, polcmd, polpermissive, pg_get_expr(polqual, polrelid) AS q, pg_get_expr(polwithcheck, polrelid) AS wc
           FROM pg_policy WHERE polrelid = 'public.liabilities'::regclass LOOP
    cmd := CASE r.polcmd WHEN '*' THEN 'ALL' WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT' WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' END;
    sql := format('CREATE POLICY %I ON public.loan_payments AS %s FOR %s', r.polname, CASE WHEN r.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END, cmd);
    IF r.q IS NOT NULL THEN sql := sql || format(' USING (%s)', r.q); END IF;
    IF r.wc IS NOT NULL THEN sql := sql || format(' WITH CHECK (%s)', r.wc); END IF;
    BEGIN EXECUTE sql; EXCEPTION WHEN duplicate_object THEN NULL; END;
  END LOOP;
END $$;
REVOKE ALL ON loan_payments FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON loan_payments TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE loan_payments_id_seq TO authenticated;
