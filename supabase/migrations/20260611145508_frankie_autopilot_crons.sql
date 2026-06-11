-- Daily cron triggers for Frankie's two automations:
--
--   collections-autopilot  → 15:00 UTC (9am MDT) — escalating AR reminders
--   frankie-daily-brief    → 13:00 UTC (7am MDT) — morning cash digest
--
-- SAFE BY DEFAULT: both functions no-op for every company unless that
-- company's settings row ({key:'collections_autopilot'} /
-- {key:'frankie_daily_brief'}) has {"enabled": true}. No company is
-- enabled by this migration — flipping the switch happens in Frankie's
-- Settings tab per tenant. The cron just knocks on the door daily.
--
-- Uses pg_cron + pg_net (both available on Supabase). The Authorization
-- header carries the project's ANON key — public by design (it ships in
-- every browser bundle); the functions are deployed --no-verify-jwt and
-- use their own service-role env internally.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Unschedule old copies so re-running this migration can't double-schedule
DO $$
BEGIN
  PERFORM cron.unschedule('collections-autopilot-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
  PERFORM cron.unschedule('frankie-daily-brief-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'collections-autopilot-daily',
  '0 15 * * *',
  $$
  SELECT net.http_post(
    url := 'https://tzrhfhisdeahrrmeksif.supabase.co/functions/v1/collections-autopilot',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6cmhmaGlzZGVhaHJybWVrc2lmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxODU2NDIsImV4cCI6MjA4NDc2MTY0Mn0.61DuMOn7IPbp9F20ZZlm6ngRCDzNPjFbIfRxRCHD9RU'
    ),
    body := '{"cron": true}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'frankie-daily-brief-daily',
  '0 13 * * *',
  $$
  SELECT net.http_post(
    url := 'https://tzrhfhisdeahrrmeksif.supabase.co/functions/v1/frankie-daily-brief',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6cmhmaGlzZGVhaHJybWVrc2lmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxODU2NDIsImV4cCI6MjA4NDc2MTY0Mn0.61DuMOn7IPbp9F20ZZlm6ngRCDzNPjFbIfRxRCHD9RU'
    ),
    body := '{"cron": true}'::jsonb
  );
  $$
);
