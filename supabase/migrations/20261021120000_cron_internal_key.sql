-- =====================================================================
-- The five remaining pg_cron jobs prove themselves (2026-10-21).
--
-- Each carried the public anon key and the function checked nothing, so any
-- JWT the gateway accepted could run collections for every tenant, text
-- their customers, mail their managers, or fire the payroll reminders.
-- marketing-suggest closed this on 10-15 with a key pg_cron reads from
-- Vault; this does the same for the rest with its own key
-- (vault cron_internal_key ↔ edge secret CRON_INTERNAL_KEY, created by hand,
-- never in git). The anon bearer stays on the four verify_jwt=true jobs so
-- the gateway admits the request; it proves nothing on its own.
-- The functions read the key through _shared/cronAuth.ts.
-- =====================================================================

DO $$ BEGIN
  PERFORM cron.unschedule('collections-autopilot-daily');
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
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6cmhmaGlzZGVhaHJybWVrc2lmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxODU2NDIsImV4cCI6MjA4NDc2MTY0Mn0.61DuMOn7IPbp9F20ZZlm6ngRCDzNPjFbIfRxRCHD9RU',
      'x-internal-key', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_internal_key' LIMIT 1)
    ),
    body := '{"cron": true}'::jsonb
  );
  $$
);

DO $$ BEGIN
  PERFORM cron.unschedule('frankie-daily-brief-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
SELECT cron.schedule(
  'frankie-daily-brief-daily',
  '0 13 * * *',
  $$
  SELECT net.http_post(
    url := 'https://tzrhfhisdeahrrmeksif.supabase.co/functions/v1/frankie-daily-brief',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6cmhmaGlzZGVhaHJybWVrc2lmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxODU2NDIsImV4cCI6MjA4NDc2MTY0Mn0.61DuMOn7IPbp9F20ZZlm6ngRCDzNPjFbIfRxRCHD9RU',
      'x-internal-key', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_internal_key' LIMIT 1)
    ),
    body := '{"cron": true}'::jsonb
  );
  $$
);

DO $$ BEGIN
  PERFORM cron.unschedule('health-check-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
SELECT cron.schedule(
  'health-check-daily',
  '0 14 * * *',
  $$
  SELECT net.http_post(
    url := 'https://tzrhfhisdeahrrmeksif.supabase.co/functions/v1/health-check',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6cmhmaGlzZGVhaHJybWVrc2lmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxODU2NDIsImV4cCI6MjA4NDc2MTY0Mn0.61DuMOn7IPbp9F20ZZlm6ngRCDzNPjFbIfRxRCHD9RU',
      'x-internal-key', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_internal_key' LIMIT 1)
    ),
    body := '{"company_id": 3}'::jsonb
  );
  $$
);

DO $$ BEGIN
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
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6cmhmaGlzZGVhaHJybWVrc2lmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxODU2NDIsImV4cCI6MjA4NDc2MTY0Mn0.61DuMOn7IPbp9F20ZZlm6ngRCDzNPjFbIfRxRCHD9RU',
      'x-internal-key', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_internal_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);

DO $$ BEGIN
  PERFORM cron.unschedule('payroll-deadline-reminders');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
SELECT cron.schedule(
  'payroll-deadline-reminders',
  '0 13 * * *',
  $$
  SELECT net.http_post(
    url := 'https://tzrhfhisdeahrrmeksif.supabase.co/functions/v1/payroll-deadline-reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6cmhmaGlzZGVhaHJybWVrc2lmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxODU2NDIsImV4cCI6MjA4NDc2MTY0Mn0.61DuMOn7IPbp9F20ZZlm6ngRCDzNPjFbIfRxRCHD9RU',
      'x-internal-key', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_internal_key' LIMIT 1)
    ),
    body := '{}'::jsonb
  );
  $$
);
