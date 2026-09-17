-- The dedupe index was partial (WHERE dedupe_key IS NOT NULL). Postgres will
-- only infer a partial unique index for ON CONFLICT when the statement repeats
-- its predicate, and PostgREST's upsert cannot say that — so the PM cron's
-- upsert would have failed on its first run. A plain unique index behaves the
-- same for real keys (NULLs are distinct and never conflict) and is inferable.
DROP INDEX IF EXISTS public.employee_notifications_dedupe_idx;
CREATE UNIQUE INDEX IF NOT EXISTS employee_notifications_dedupe_idx
  ON public.employee_notifications (employee_id, dedupe_key);
