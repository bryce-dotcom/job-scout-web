-- Alerting for the crash log.
--
-- A log nobody opens is only marginally better than no log. Cameron's
-- clock-out failed for three days and the Products page was broken for all 189
-- products carrying specs; in both cases the signal was a person photographing
-- their screen, not the system saying anything.

ALTER TABLE client_errors
  ADD COLUMN IF NOT EXISTS alerted_at timestamptz;

-- A recurrence after someone marked it resolved must alert AGAIN — being wrong
-- about a fix is exactly what you want to hear. The existing bump trigger
-- reopens the row; clearing alerted_at alongside makes it eligible once more.
CREATE OR REPLACE FUNCTION client_errors_bump_seen()
RETURNS trigger AS $$
BEGIN
  NEW.seen_count := COALESCE(OLD.seen_count, 0) + 1;
  NEW.first_seen_at := COALESCE(OLD.first_seen_at, NEW.first_seen_at);
  IF NEW.last_seen_at IS DISTINCT FROM OLD.last_seen_at THEN
    IF OLD.resolved THEN
      NEW.resolved := false;
      NEW.alerted_at := NULL;   -- it came back; say so
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Find the not-yet-alerted rows cheaply.
CREATE INDEX IF NOT EXISTS client_errors_unalerted_idx
  ON client_errors (last_seen_at DESC)
  WHERE alerted_at IS NULL AND resolved = false;

-- Every 15 minutes. Fast enough that a broken deploy is caught while whoever
-- shipped it is still at the keyboard, slow enough to batch a burst into one
-- message.
DO $$
BEGIN
  PERFORM cron.unschedule('crash-alert');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'crash-alert',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://tzrhfhisdeahrrmeksif.supabase.co/functions/v1/crash-alert',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6cmhmaGlzZGVhaHJybWVrc2lmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxODU2NDIsImV4cCI6MjA4NDc2MTY0Mn0.61DuMOn7IPbp9F20ZZlm6ngRCDzNPjFbIfRxRCHD9RU'
    ),
    body := '{}'::jsonb
  );
  $$
);
