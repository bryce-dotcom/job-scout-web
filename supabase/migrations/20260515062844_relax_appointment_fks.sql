-- Sweep all FKs that reference appointments(id) to ON DELETE SET NULL.
-- Tracy reported that deleting a meeting "didn't work even after refresh".
-- Suspect: lead_commissions.appointment_id (or similar) had a RESTRICT
-- rule blocking the delete silently. Mirror what we did for jobs FKs.

DO $$
DECLARE fk record;
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
      AND ccu.table_name = 'appointments'
      AND ccu.column_name = 'id'
      AND rc.delete_rule NOT IN ('SET NULL', 'CASCADE')
  LOOP
    RAISE NOTICE 'Relaxing % on %.%', fk.constraint_name, fk.table_name, fk.column_name;
    EXECUTE format(
      'ALTER TABLE public.%I DROP CONSTRAINT %I',
      fk.table_name, fk.constraint_name
    );
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.appointments(id) ON DELETE SET NULL',
      fk.table_name, fk.constraint_name, fk.column_name
    );
  END LOOP;
END $$;
