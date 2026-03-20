-- Drop the old cron job and recreate with hardcoded Supabase URL
-- The service_role_key is available via supabase_functions.get_secret on hosted Supabase
SELECT cron.unschedule('estimate-followup-daily');

-- Use vault to store and retrieve the service role key for cron
-- On Supabase hosted, we can use pg_net with the anon key since the edge function
-- doesn't require auth (it uses its own service role key internally)
SELECT cron.schedule(
  'estimate-followup-daily',
  '0 15 * * *',  -- 9am MST = 3pm UTC (during daylight saving) / adjust as needed
  $$
  SELECT net.http_post(
    url := 'https://tzrhfhisdeahrrmeksif.supabase.co/functions/v1/estimate-followup'::text,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
