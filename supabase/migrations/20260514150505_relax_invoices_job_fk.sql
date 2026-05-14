-- Sweep: every FK that points at jobs.id and uses RESTRICT/NO ACTION
-- gets relaxed to ON DELETE SET NULL so legitimate job-cleanup never
-- gets blocked by stale child rows. Tracy + Christopher kept hitting
-- this trying to delete bogus jobs (invoices, time_clock, expenses,
-- quotes, etc). The history rows stay intact — they just lose the
-- pointer back to the deleted job.

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
      AND rc.delete_rule NOT IN ('SET NULL', 'CASCADE')
  LOOP
    RAISE NOTICE 'Relaxing % on %.%', fk.constraint_name, fk.table_name, fk.column_name;
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
