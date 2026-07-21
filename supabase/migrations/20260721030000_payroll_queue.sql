-- Per-item payroll staging: "Add to current Payroll".
--
-- Bryce wants explicit control — add a bonus or commission to the current
-- payroll run, then running the payroll pays exactly what was added (it moves
-- out of upcoming/owed to paid). This is a staging flag alongside each earning's
-- existing state, on all three earning tables so bonuses and both commission
-- types work identically.
--
--   owed/earned  --Add to Payroll-->  queued  --Run Payroll-->  paid
--   owed/earned  --------------------- Mark as Paid ----------->  paid (outside app)
--
-- Additive: nothing reads these columns until the app is updated to.

ALTER TABLE job_bonuses      ADD COLUMN IF NOT EXISTS queued_for_payroll BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE job_bonuses      ADD COLUMN IF NOT EXISTS queued_at TIMESTAMPTZ;
ALTER TABLE lead_commissions ADD COLUMN IF NOT EXISTS queued_for_payroll BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE lead_commissions ADD COLUMN IF NOT EXISTS queued_at TIMESTAMPTZ;
ALTER TABLE rep_commissions  ADD COLUMN IF NOT EXISTS queued_for_payroll BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE rep_commissions  ADD COLUMN IF NOT EXISTS queued_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
