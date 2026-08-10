-- Close the two gaps that still made crashes invisible.
--
-- 1. PORTAL CRASHES. A customer reading a proposal at /portal/:token is not
--    signed in, so the authenticated-only INSERT policy silently dropped their
--    crash. That is the most reputation-critical screen in the product and the
--    one place a failure was guaranteed to go unnoticed.
--
-- 2. DEDUPE WITH NO TENANT. The unique index is (company_id, message, route),
--    and Postgres treats NULLs as distinct — so a portal crash with no
--    company_id would insert a fresh row every single time and bury everything
--    else. Dedupe therefore moves into a trigger, which also frees the client
--    from needing ON CONFLICT at all.

-- Bound what a public endpoint can store. The client already truncates; this
-- binds anyone posting directly.
DO $$ BEGIN
  ALTER TABLE client_errors ADD CONSTRAINT client_errors_sane_sizes
    CHECK (length(message) <= 500 AND (stack IS NULL OR length(stack) <= 8000)
           AND (route IS NULL OR length(route) <= 300));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Dedupe + abuse cap, before the row is written.
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
    -- Touch last_seen_at and let the existing BEFORE UPDATE trigger do the
    -- counting and the reopen-if-resolved. Skip the insert.
    UPDATE client_errors
       SET last_seen_at = NEW.last_seen_at,
           app_build = COALESCE(NEW.app_build, app_build)
     WHERE id = existing_id;
    RETURN NULL;
  END IF;

  -- A public endpoint needs a ceiling. Fifty DISTINCT crashes in an hour for
  -- one tenant is already a catastrophe; past that we are being flooded, and
  -- dropping quietly is better than letting the table become the outage.
  SELECT count(*) INTO recent_count FROM client_errors
   WHERE company_id IS NOT DISTINCT FROM NEW.company_id
     AND first_seen_at > now() - interval '1 hour';
  IF recent_count >= 50 THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS client_errors_dedupe_trg ON client_errors;
CREATE TRIGGER client_errors_dedupe_trg
  BEFORE INSERT ON client_errors
  FOR EACH ROW EXECUTE FUNCTION client_errors_dedupe();

-- The unique index can now go: the trigger owns dedupe, and the index cannot
-- express "NULL company means the same tenant" anyway.
DROP INDEX IF EXISTS client_errors_dedupe_idx;
CREATE INDEX IF NOT EXISTS client_errors_lookup_idx
  ON client_errors (company_id, message, route);

-- Anonymous visitors may REPORT a crash and nothing else. No SELECT: stacks
-- and routes describe the app's internals.
DO $$ BEGIN
  CREATE POLICY client_errors_insert_anon ON client_errors
    FOR INSERT TO anon WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

GRANT INSERT ON client_errors TO anon;
GRANT USAGE, SELECT ON SEQUENCE client_errors_id_seq TO anon;
REVOKE SELECT, UPDATE, DELETE ON client_errors FROM anon;
