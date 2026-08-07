-- Make seen_count actually count.
--
-- The reporter upserts on (company_id, message, route). ON CONFLICT DO UPDATE
-- only assigns the columns supplied, and seen_count is not one of them, so it
-- sat at 1 forever while the admin page claimed to show how many people hit a
-- crash. A count that never moves is worse than no count: it says one person
-- saw this when 189 products were broken.
--
-- Incrementing in a trigger keeps the client dumb — the reporter runs inside a
-- crashed app and must not be made to read-then-write.

CREATE OR REPLACE FUNCTION client_errors_bump_seen()
RETURNS trigger AS $$
BEGIN
  NEW.seen_count := COALESCE(OLD.seen_count, 0) + 1;
  NEW.first_seen_at := COALESCE(OLD.first_seen_at, NEW.first_seen_at);
  -- Reopen automatically: a crash recurring after someone ticked it off is
  -- not resolved, and silently leaving it hidden is how it gets missed twice.
  IF NEW.last_seen_at IS DISTINCT FROM OLD.last_seen_at THEN
    NEW.resolved := false;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS client_errors_bump_seen_trg ON client_errors;
CREATE TRIGGER client_errors_bump_seen_trg
  BEFORE UPDATE ON client_errors
  FOR EACH ROW
  -- Only when the reporter touches it, never when an admin ticks resolved.
  WHEN (NEW.last_seen_at IS DISTINCT FROM OLD.last_seen_at)
  EXECUTE FUNCTION client_errors_bump_seen();
