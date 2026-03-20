-- Enable pg_cron and pg_net extensions for scheduled HTTP calls
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Schedule the estimate-followup edge function to run daily at 9am UTC (3am MST)
SELECT cron.schedule(
  'estimate-followup-daily',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://tzrhfhisdeahrrmeksif.supabase.co/functions/v1/estimate-followup',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer ' || current_setting('supabase.service_role_key') || '"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
