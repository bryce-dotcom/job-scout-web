-- Junction table: split a single plaid transaction across multiple jobs with specific amounts
CREATE TABLE IF NOT EXISTS transaction_job_allocations (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  transaction_id INTEGER NOT NULL REFERENCES plaid_transactions(id) ON DELETE CASCADE,
  job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tja_company ON transaction_job_allocations(company_id);
CREATE INDEX IF NOT EXISTS idx_tja_transaction ON transaction_job_allocations(transaction_id);
CREATE INDEX IF NOT EXISTS idx_tja_job ON transaction_job_allocations(job_id);

-- RLS (matches plaid_transactions pattern)
ALTER TABLE transaction_job_allocations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "tja_all" ON transaction_job_allocations USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
