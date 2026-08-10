-- What the user did in the seconds before the crash.
--
-- The cheap half of session replay, and usually the half that finds the bug:
-- "on /products, clicked Edit, a request returned 400, then it crashed" beats
-- a video you have to sit through. Text only, clamped, and captured in memory
-- — nothing is stored unless something actually breaks.

ALTER TABLE client_errors
  ADD COLUMN IF NOT EXISTS breadcrumbs text;

DO $$ BEGIN
  ALTER TABLE client_errors ADD CONSTRAINT client_errors_breadcrumbs_size
    CHECK (breadcrumbs IS NULL OR length(breadcrumbs) <= 4000);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Keep the LATEST trail when a known crash recurs: the newest occurrence is
-- the one someone will try to reproduce.
CREATE OR REPLACE FUNCTION client_errors_dedupe()
RETURNS trigger AS $$
DECLARE
  existing_id bigint;
  recent_count integer;
BEGIN
  SELECT id INTO existing_id FROM client_errors
   WHERE company_id IS NOT DISTINCT FROM NEW.company_id
     AND message = NEW.message
     AND route IS NOT DISTINCT FROM NEW.route
   LIMIT 1;

  IF existing_id IS NOT NULL THEN
    UPDATE client_errors
       SET last_seen_at = NEW.last_seen_at,
           app_build    = COALESCE(NEW.app_build, app_build),
           breadcrumbs  = COALESCE(NEW.breadcrumbs, breadcrumbs),
           stack        = COALESCE(NEW.stack, stack)
     WHERE id = existing_id;
    RETURN NULL;
  END IF;

  SELECT count(*) INTO recent_count FROM client_errors
   WHERE company_id IS NOT DISTINCT FROM NEW.company_id
     AND first_seen_at > now() - interval '1 hour';
  IF recent_count >= 50 THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
