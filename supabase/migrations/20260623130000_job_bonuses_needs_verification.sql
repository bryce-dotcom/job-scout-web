-- Verification is a FLAG on a bonus, not a gate that hides it.
--
-- Bryce's call (2026-06-23): a bonus should ALWAYS show in My Pay until it's
-- paid out, but it should be visibly flagged when the job hasn't passed Victor
-- completion verification — and payroll can override that flag to release it.
--
-- So job_bonuses now stores the REAL earned amount for every job that clears
-- the saved-hours floor, even unverified ones. `needs_verification = true`
-- means "earned, shown, but Victor hasn't confirmed the work" → the UI shows a
-- badge and payroll decides. Overriding sets it false (release_reason records
-- who/why via admin_override).

ALTER TABLE job_bonuses
  ADD COLUMN IF NOT EXISTS needs_verification BOOLEAN NOT NULL DEFAULT false;

-- Who released a held bonus and when (payroll override of the verification flag).
ALTER TABLE job_bonuses
  ADD COLUMN IF NOT EXISTS verification_overridden_by BIGINT REFERENCES employees(id);
ALTER TABLE job_bonuses
  ADD COLUMN IF NOT EXISTS verification_overridden_at TIMESTAMPTZ;

-- Lets My Pay / Payroll quickly find what's owed-but-unverified.
CREATE INDEX IF NOT EXISTS idx_job_bonuses_needs_verification
  ON job_bonuses (company_id, needs_verification) WHERE needs_verification = true;

NOTIFY pgrst, 'reload schema';
