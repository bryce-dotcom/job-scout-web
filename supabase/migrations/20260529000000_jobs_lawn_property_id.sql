-- ====================================================================
-- Bridge lawn-care into Job Scout's universal `jobs` currency.
--
-- WHY:
--   Lawn-care visits live in lawn_visits (a side-car log) and
--   lawn_properties (the master file). But every other feature —
--   Field Scout, Job Board, Time Clock, GPS pings, Photos, Victor
--   verification, Invoicing, Payroll bonuses, Reports — reads from
--   `jobs`. Until lawn jobs ARE jobs, the lawn-care crew can't clock
--   in, the PM can't dispatch them, and the owner can't bonus them.
--
-- WHAT:
--   1. Add jobs.lawn_property_id (nullable FK).
--   2. Add jobs_lawn_property_idx for fast lookup.
--   3. One-time backfill: link existing alc_import jobs to their
--      lawn_properties by joining on customer_id + company_id.
--
-- After this, the sync function (next migration) auto-upserts a jobs
-- row when a property is saved with mow_day + frequency, and the
-- Field Scout integration starts working without further schema work.
-- ====================================================================

-- 1. FK column
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS lawn_property_id INTEGER
  REFERENCES public.lawn_properties(id) ON DELETE SET NULL;

-- 2. Index for "show me all jobs for this property" queries (the
-- Field Scout / Property Detail surfaces will hit this hot).
CREATE INDEX IF NOT EXISTS jobs_lawn_property_idx
  ON public.jobs(lawn_property_id)
  WHERE lawn_property_id IS NOT NULL;

-- 3. One-time backfill — link existing alc_import jobs to their
-- matching lawn_properties record. Joins on (company_id, customer_id)
-- which is safe because a customer has at most one property at the
-- moment (lawn_properties is currently one-row-per-customer for
-- imported tenants).
--
-- NOTE: If a customer has multiple properties in the future, this
-- backfill would need a more specific join. For now (1:1), it works.
UPDATE public.jobs j
SET    lawn_property_id = lp.id
FROM   public.lawn_properties lp
WHERE  j.customer_id        = lp.customer_id
  AND  j.company_id         = lp.company_id
  AND  j.source_system      = 'alc_import'
  AND  j.lawn_property_id IS NULL;

-- 4. Make PostgREST notice the new column immediately.
NOTIFY pgrst, 'reload schema';
