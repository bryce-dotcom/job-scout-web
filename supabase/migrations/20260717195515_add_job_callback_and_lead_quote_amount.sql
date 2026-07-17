-- Two columns that the app already referenced but that never existed in the
-- database. Both surfaced via `npm run schema:check`.

-- 1) jobs.has_callback ---------------------------------------------------------
-- The bonus "quality gate" (bonusCalc.computeJobBonusRows) withholds a tech's
-- efficiency bonus on a job that had a callback, when payrollConfig
-- .bonus_quality_gate is on. It read job.has_callback, which did not exist, so
-- the gate was inert. Add it. Default false = existing jobs have no callback
-- and are unaffected.
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS has_callback boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN jobs.has_callback IS
  'Set when a customer called back for rework/warranty on this job. Withholds the efficiency bonus when payroll bonus_quality_gate is enabled.';

-- 2) leads.quote_amount --------------------------------------------------------
-- SalesPipeline reads lead.quote_amount as the fallback deal value, and an
-- admin backfill tried to sync it from the linked quote. The column did not
-- exist, so the read was always 0 and the sync 400'd. Add it, then seed it from
-- each lead's linked quote.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS quote_amount numeric;

COMMENT ON COLUMN leads.quote_amount IS
  'Denormalized amount of the lead''s linked quote (leads.quote_id -> quotes.quote_amount), for pipeline value display. Kept in sync when the quote amount changes.';

UPDATE leads l
   SET quote_amount = q.quote_amount
  FROM quotes q
 WHERE l.quote_id = q.id
   AND q.quote_amount IS NOT NULL
   AND l.quote_amount IS DISTINCT FROM q.quote_amount;
