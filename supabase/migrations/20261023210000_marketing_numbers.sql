-- =====================================================================
-- Numbers for the Marketing page that did not exist anywhere (2026-10-23).
--
--   site_hits               first-party website visits. A one-line snippet
--                           on the tenant's site posts a beacon to
--                           marketing-hit; every link JobScout publishes or
--                           emails carries utm tags, so "this post sent 40
--                           people to the site" is a GROUP BY, not Google.
--   marketing_metrics_daily one row per company per source per day: the
--                           Google listing (rating, review count) today,
--                           anything else later. Month-over-month is a
--                           read of two rows.
--
-- Hits are written by the server only (the beacon has no user); companies
-- read their own. The Google snapshot runs nightly through marketing-google
-- with the marketing Vault key.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.site_hits (
  id            bigserial PRIMARY KEY,
  company_id    integer NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  at            timestamptz NOT NULL DEFAULT now(),
  event         text NOT NULL DEFAULT 'view',           -- view | quote | form
  host          text,
  path          text,
  referrer_host text,
  utm_source    text,
  utm_medium    text,
  utm_campaign  text,
  utm_content   text,
  visitor       text,                                   -- a random id the snippet keeps in the browser; not a person
  user_agent    text
);
CREATE INDEX IF NOT EXISTS site_hits_company_at_idx ON public.site_hits (company_id, at DESC);

CREATE TABLE IF NOT EXISTS public.marketing_metrics_daily (
  id            bigserial PRIMARY KEY,
  company_id    integer NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  day           date NOT NULL,
  source        text NOT NULL,                          -- google | social | website
  metrics       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, day, source)
);

ALTER TABLE public.site_hits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_metrics_daily ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY site_hits_select ON public.site_hits FOR SELECT
    USING (company_id IN (SELECT public.current_user_company_ids()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY marketing_metrics_daily_select ON public.marketing_metrics_daily FOR SELECT
    USING (company_id IN (SELECT public.current_user_company_ids()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Hits older than 13 months are no longer a trend; the nightly snapshot trims them.
-- Nightly Google snapshot, 11:00 UTC (5am Mountain), same Vault key as the suggester.
DO $$ BEGIN
  PERFORM cron.unschedule('marketing-google-daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
SELECT cron.schedule(
  'marketing-google-daily',
  '0 11 * * *',
  $$
  SELECT net.http_post(
    url := 'https://tzrhfhisdeahrrmeksif.supabase.co/functions/v1/marketing-google',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-key', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'marketing_internal_key' LIMIT 1)
    ),
    body := '{"cron": true}'::jsonb
  );
  $$
);
