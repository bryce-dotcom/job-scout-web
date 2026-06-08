-- Service-visit fields on jobs — lets jobs link to a parent (original
-- install, contract, etc.) and carry coverage info so warranty / annual
-- check-up / repair / upsell visits work without a parallel "services"
-- table. A service visit IS a job; only difference is parent_job_id is set
-- (or service_kind = the type of visit) and coverage may be split with a
-- manufacturer.
--
-- Service-only businesses (no parent installs) just don't set parent_job_id
-- and everything keeps working.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS parent_job_id   bigint REFERENCES jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS service_kind    text,
  ADD COLUMN IF NOT EXISTS service_due_date date,
  ADD COLUMN IF NOT EXISTS parts_coverage  text,
  ADD COLUMN IF NOT EXISTS labor_coverage  text,
  ADD COLUMN IF NOT EXISTS coverage_notes  text,
  ADD COLUMN IF NOT EXISTS prepaid_revenue numeric(12,2);

-- Allowed values for service_kind / coverage. Open enum so tenants can
-- extend with their own values (e.g., HVAC tune-up) without a migration.
-- Documented in comments rather than CHECK so old data doesn't reject.
COMMENT ON COLUMN jobs.parent_job_id  IS 'When set, this job is a service visit linked to the original install / contract. Null for standalone jobs (including service-only tenants who never have a parent install).';
COMMENT ON COLUMN jobs.service_kind   IS 'install | warranty | annual | tune_up | repair | upsell | callback | one_off';
COMMENT ON COLUMN jobs.service_due_date IS 'When the visit is scheduled (for future-dated services from upsells / contracts). Distinct from start_date which is when it actually runs.';
COMMENT ON COLUMN jobs.parts_coverage IS 'customer | manufacturer | company | split | na — who pays for materials on this visit';
COMMENT ON COLUMN jobs.labor_coverage IS 'customer | manufacturer | company | split | na — who pays for labor on this visit';
COMMENT ON COLUMN jobs.coverage_notes IS 'Free text: warranty claim #, RMA #, plan reference, etc.';
COMMENT ON COLUMN jobs.prepaid_revenue IS 'Amount allocated from a prepaid plan (annual check-ups sold upfront with an install). Counts as revenue for job costing without an invoice on the child visit. Recurring services where the customer is billed per visit leave this null.';

-- Index for fast parent → children lookups on Job Detail + Job Costing
-- report rollups.
CREATE INDEX IF NOT EXISTS idx_jobs_parent_job_id ON jobs (parent_job_id) WHERE parent_job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_service_due_date ON jobs (service_due_date) WHERE service_due_date IS NOT NULL;
