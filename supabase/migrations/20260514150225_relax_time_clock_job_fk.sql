-- Allow deleting jobs that have time_clock rows pointing at them.
--
-- Tracy ran into this when trying to clean up bogus job 21761 — the
-- delete failed with:
--   violates foreign key constraint "time_clock_job_id_fkey" on table "time_clock"
--
-- The right behavior is ON DELETE SET NULL: keep the historical time
-- punches (they still tie to the employee + payroll record) but null
-- out the job pointer so payroll history isn't lost when a job is
-- removed. CASCADE would destroy the time records, which we don't
-- want — those have already been paid out.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'time_clock_job_id_fkey'
      AND table_name = 'time_clock'
  ) THEN
    ALTER TABLE public.time_clock DROP CONSTRAINT time_clock_job_id_fkey;
  END IF;

  ALTER TABLE public.time_clock
    ADD CONSTRAINT time_clock_job_id_fkey
    FOREIGN KEY (job_id) REFERENCES public.jobs(id)
    ON DELETE SET NULL;
END $$;

-- Same treatment for job_time_logs (the other child table that's
-- caused similar delete-blocked complaints).
DO $$
DECLARE
  fk record;
BEGIN
  FOR fk IN
    SELECT
      tc.constraint_name,
      tc.table_name,
      kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON tc.constraint_name = ccu.constraint_name
     AND tc.table_schema = ccu.table_schema
    JOIN information_schema.referential_constraints rc
      ON tc.constraint_name = rc.constraint_name
     AND tc.table_schema = rc.constraint_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND ccu.table_name = 'jobs'
      AND ccu.column_name = 'id'
      AND tc.table_name = 'job_time_logs'
      AND rc.delete_rule <> 'SET NULL'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I DROP CONSTRAINT %I',
      fk.table_name, fk.constraint_name
    );
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.jobs(id) ON DELETE SET NULL',
      fk.table_name, fk.constraint_name, fk.column_name
    );
  END LOOP;
END $$;
