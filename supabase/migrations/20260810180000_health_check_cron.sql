-- Daily health check.
--
-- Every outage this year was silent: the Gemini key went away in May and
-- categorization returned 200 "0 categorized" for 3.5 months; bank balances
-- had not refreshed since March and HHH checking was $27,920.78 stale; Plaid
-- sync last ran Jun 18 and then dumped 530 transactions on Aug 10; the Stripe
-- webhook was auto-disabled in July and dropped 8 payments; the Resend webhook
-- went dark in June. None were code regressions and none announced themselves.
--
-- health-check asks the DATA when each thing last actually produced a result,
-- so it cannot be forgotten to be wired into a new integration and a broken
-- integration cannot report itself healthy. A failure becomes a feedback
-- ticket (the queue that already gets read) plus an email, throttled to once
-- per 24h per combination of failures.
--
-- 14:00 UTC = 8am Mountain: before the crew starts, so a Books or payments
-- outage is known before anyone works a day around it.

DO $$
BEGIN
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
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR6cmhmaGlzZGVhaHJybWVrc2lmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkxODU2NDIsImV4cCI6MjA4NDc2MTY0Mn0.61DuMOn7IPbp9F20ZZlm6ngRCDzNPjFbIfRxRCHD9RU'
    ),
    body := '{"company_id": 3}'::jsonb
  );
  $$
);
