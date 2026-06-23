-- Persistent efficiency-bonus ledger.
--
-- Until now bonuses were RECOMPUTED live from time_clock + the job's current
-- allotted_time_hours on every Payroll/MyPay/FieldScout render. That's why a
-- bonus "showed on one pay period, then vanished, then read $0" (Bryce's
-- Western States ticket): correcting a job's hours later retroactively
-- changed or erased a bonus that had already been earned.
--
-- This table makes a bonus a REAL RECORD, snapshotted when it's earned:
--   pending  — earned by saved hours, but the job's money hasn't come in yet
--   accrued  — the job's invoice/utility incentive got PAID, so the bonus is
--              now OWED to the employee; this is what shows in My Pay
--   paid     — a payroll run paid it out; it drops off My Pay and is frozen
--   void     — superseded (e.g. employee no longer on the job before money in)
--
-- Bonuses are tied to WHEN THE MONEY COMES IN, not payday. Pre-payout the
-- amount can still be refreshed from live data (so genuine hour corrections
-- flow through); once `paid`, the row is frozen and never recomputed.

CREATE TABLE IF NOT EXISTS job_bonuses (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id BIGINT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- snapshot of the inputs that produced `amount`, for transparency on the job
  saved_hours NUMERIC(10,2),
  allotted_hours NUMERIC(10,2),
  actual_hours NUMERIC(10,2),
  crew_size INTEGER,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accrued', 'paid', 'void')),
  release_reason TEXT,                 -- victor_verified | admin_override | paid_threshold_met | gate_off
  accrued_at TIMESTAMPTZ,              -- when the job's money came in (bonus became owed)
  paid_at TIMESTAMPTZ,                 -- when a payroll run paid it out
  paid_pay_period_start DATE,
  paid_pay_period_end DATE,
  paid_by BIGINT REFERENCES employees(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_job_bonuses_company_emp_status ON job_bonuses (company_id, employee_id, status);
CREATE INDEX IF NOT EXISTS idx_job_bonuses_job ON job_bonuses (job_id);

ALTER TABLE job_bonuses ENABLE ROW LEVEL SECURITY;

-- Company isolation — authenticated client users read/write their own
-- company's bonus rows (the recompute runs client-side, reusing bonusCalc).
DO $$ BEGIN
  CREATE POLICY "job_bonuses_company" ON job_bonuses
    FOR ALL
    USING (company_id = get_user_company_id())
    WITH CHECK (company_id = get_user_company_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';
