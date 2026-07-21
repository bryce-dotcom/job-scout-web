-- Frozen rep (%) commission ledger.
--
-- Rep commissions (services/goods percentage) are currently RECOMPUTED live
-- from invoices + payments + rates on every Payroll and My Pay render, with
-- each screen fetching its own inputs — so the two can disagree, and a later
-- edit to an invoice silently changes an already-earned commission. That's the
-- "numbers keep changing / payroll is always breaking" complaint.
--
-- This table makes a rep commission a REAL, FROZEN record, one row per
-- triggering payment: when a payment lands on an invoice whose job the rep
-- owns, the rep earns rate × payment, snapshotted here and never recomputed.
-- Mirrors job_bonuses (bonuses) and lead_commissions (setter) so a later
-- unified reader can pay all three the same way, in-app or outside the app.
--
-- Rolled out SHADOW-FIRST: this migration + a backfill populate the rows and
-- verify they match today's live totals BEFORE anything reads from them.

CREATE TABLE IF NOT EXISTS rep_commissions (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  invoice_id BIGINT,                 -- source invoice (no FK: invoices get hard-deleted/migrated)
  job_id BIGINT,                     -- source job
  payment_id BIGINT,                 -- the triggering payment — freezes the earning per payment
  kind TEXT NOT NULL DEFAULT 'services'
    CHECK (kind IN ('services','goods','processor')),
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,   -- FROZEN at earn time (rate × basis), never recomputed
  rate NUMERIC(10,4),                -- snapshot of the rate used
  rate_type TEXT,                    -- 'percent' | 'flat'
  basis_amount NUMERIC(12,2),        -- what the rate applied to (the payment amount)
  earned_at TIMESTAMPTZ,             -- when earned (the payment date)
  payment_status TEXT NOT NULL DEFAULT 'earned'
    CHECK (payment_status IN ('pending','earned','paid','void')),
  paid_at TIMESTAMPTZ,
  paid_pay_period_end DATE,
  paid_by BIGINT REFERENCES employees(id),
  source TEXT,                       -- 'backfill' | 'live'
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One row per (payment, rep, kind) so the backfill is idempotent / re-runnable.
  UNIQUE (payment_id, employee_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_rep_commissions_company_emp_status
  ON rep_commissions (company_id, employee_id, payment_status);
CREATE INDEX IF NOT EXISTS idx_rep_commissions_earned_at ON rep_commissions (earned_at);

ALTER TABLE rep_commissions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "rep_commissions_company" ON rep_commissions
    FOR ALL
    USING (company_id = get_user_company_id())
    WITH CHECK (company_id = get_user_company_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';
