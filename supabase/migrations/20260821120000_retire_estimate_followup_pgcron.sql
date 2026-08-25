-- Retire the pg_cron job that ran estimate follow-ups, and say why.
--
-- It POSTed the edge function with no Authorization header:
--
--   net.http_post(
--     url := '.../functions/v1/estimate-followup',
--     headers := '{"Content-Type": "application/json"}'::jsonb,   -- no auth
--     body := '{}'::jsonb)
--
-- That worked only while verify_jwt was false on the function. A
-- `supabase functions deploy` without --no-verify-jwt resets verify_jwt to
-- true, and from that moment every call returned 401. pg_net does not surface
-- a non-2xx anywhere a person looks, so it failed silently: the last follow-up
-- went out 2026-06-12, and in the 30 days before this was found 39 estimates
-- were sent and not one was chased. 835 open estimates worth $6.39M had never
-- received a first follow-up.
--
-- The trigger now lives in vercel.json as /api/cron/estimate-followup, which
-- calls the function WITH the service role key. That fixes the class of bug,
-- not just this instance: verify_jwt becomes irrelevant, the schedule is
-- visible beside the other crons, and a non-2xx shows up in the Vercel log.
--
-- Removing the job here is what stops it double-sending once Vercel takes over.
DO $$
BEGIN
  PERFORM cron.unschedule('estimate-followup-daily');
EXCEPTION
  WHEN OTHERS THEN
    -- Already gone, or pg_cron absent on this instance. Either is fine — the
    -- point is that it is not scheduled after this migration runs.
    NULL;
END $$;
