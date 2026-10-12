-- Frankie the bookkeeper: one verdict per bank row (books-deduce edge fn).
-- Review-only by design: a verdict is a PROPOSAL until a person accepts it
-- (or the books_autobook setting lets a sure one through). The ledger
-- (plaid_transactions, payments, utility_invoices…) is only touched when a
-- verdict is applied, through the same writers the Books page uses.
CREATE TABLE IF NOT EXISTS books_verdicts (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  plaid_transaction_id INTEGER NOT NULL REFERENCES plaid_transactions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,                      -- payroll | tax_deposit | stripe_payout | loan_payment | transfer | utility_incentive | customer_payment | refund | expense | income | unknown
  category TEXT,
  tax_category TEXT,
  is_transfer BOOLEAN DEFAULT FALSE,
  matches JSONB DEFAULT '[]'::jsonb,       -- [{type, id, amount, label}]
  job_id INTEGER,
  confidence NUMERIC NOT NULL DEFAULT 0,
  evidence JSONB DEFAULT '[]'::jsonb,      -- plain-English facts the verdict rests on
  reason TEXT,
  source TEXT DEFAULT 'rules',             -- rules | model
  candidates JSONB,                        -- what the model / reviewer can pick from
  status TEXT NOT NULL DEFAULT 'proposed', -- proposed | accepted | corrected | dismissed | auto
  correction JSONB,                        -- what the reviewer chose instead
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  run_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (plaid_transaction_id)
);
CREATE INDEX IF NOT EXISTS idx_books_verdicts_company_status ON books_verdicts(company_id, status, confidence DESC);

ALTER TABLE books_verdicts ENABLE ROW LEVEL SECURITY;
-- Same policies as plaid_transactions (tenant_isolation + the require_writable_* trial gate).
DO $$
DECLARE r record; cmd text; sql text;
BEGIN
  FOR r IN SELECT polname, polcmd, polpermissive, pg_get_expr(polqual, polrelid) AS q, pg_get_expr(polwithcheck, polrelid) AS wc
           FROM pg_policy WHERE polrelid = 'public.plaid_transactions'::regclass LOOP
    cmd := CASE r.polcmd WHEN '*' THEN 'ALL' WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT' WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' END;
    sql := format('CREATE POLICY %I ON public.books_verdicts AS %s FOR %s', r.polname, CASE WHEN r.polpermissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END, cmd);
    IF r.q IS NOT NULL THEN sql := sql || format(' USING (%s)', r.q); END IF;
    IF r.wc IS NOT NULL THEN sql := sql || format(' WITH CHECK (%s)', r.wc); END IF;
    BEGIN EXECUTE sql; EXCEPTION WHEN duplicate_object THEN NULL; END;
  END LOOP;
END $$;
REVOKE ALL ON books_verdicts FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON books_verdicts TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE books_verdicts_id_seq TO authenticated;
