-- =====================================================================
-- Campaigns, week one (MARKETING_REVIEW.md §3).
--
-- ONE object. A campaign is: who (an audience), what (up to four touches,
-- email only this week), and where results land (the Lead Setter board).
-- No sequences, plays, lists or workflows — that is the Apollo trap.
--
--   marketing_campaigns  the campaign: audience + touches + status + stats
--   campaign_members     one row per person in it, with where they are in
--                        the touches and the token their unsubscribe link
--                        carries. Written by the server only.
--   campaign_events      sent / opened / clicked / replied / bounced /
--                        unsubscribed, one row each, keyed to Resend's id
--                        so the webhook and inbound mail can find the member.
--   email_suppressions   who must never be emailed again by this company.
--                        Every campaign send checks it; unsubscribe, bounce
--                        and complaint write it. (The other senders do not
--                        check it yet — reported in the review.)
--
-- The tick runs every 15 minutes through marketing-campaign {tick:true},
-- proving itself with the same Vault key the suggester uses.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
  id             bigserial PRIMARY KEY,
  company_id     integer NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  brand          text,
  name           text NOT NULL DEFAULT '',
  audience       jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {kind:'leads'|'prospects'|'lead_status'|'customers', ...}
  touches        jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{day, kind:'email', subject, body}]
  stop_on_reply  boolean NOT NULL DEFAULT true,
  status         text NOT NULL DEFAULT 'draft',         -- draft | running | paused | done
  stats          jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by     integer REFERENCES public.employees(id) ON DELETE SET NULL,
  started_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketing_campaigns_company_idx ON public.marketing_campaigns (company_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.campaign_members (
  id             bigserial PRIMARY KEY,
  company_id     integer NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  campaign_id    bigint NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  lead_id        integer REFERENCES public.leads(id) ON DELETE CASCADE,
  customer_id    integer REFERENCES public.customers(id) ON DELETE CASCADE,
  email          text NOT NULL,
  name           text,
  token          text NOT NULL UNIQUE,                  -- the unsubscribe link's token
  touch_index    integer NOT NULL DEFAULT 0,            -- the next touch to send
  next_at        timestamptz,
  state          text NOT NULL DEFAULT 'queued',        -- queued | sent | replied | stopped | bounced | unsubscribed | done
  replied_at     timestamptz,
  last_event_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, email)
);
CREATE INDEX IF NOT EXISTS campaign_members_due_idx ON public.campaign_members (next_at) WHERE state IN ('queued', 'sent');
CREATE INDEX IF NOT EXISTS campaign_members_campaign_idx ON public.campaign_members (campaign_id, state);

CREATE TABLE IF NOT EXISTS public.campaign_events (
  id             bigserial PRIMARY KEY,
  company_id     integer NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  campaign_id    bigint NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  member_id      bigint NOT NULL REFERENCES public.campaign_members(id) ON DELETE CASCADE,
  kind           text NOT NULL,                         -- sent | failed | delivered | opened | clicked | replied | bounced | complained | unsubscribed
  touch_index    integer,
  resend_id      text,
  meta           jsonb NOT NULL DEFAULT '{}'::jsonb,
  at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS campaign_events_resend_idx ON public.campaign_events (resend_id) WHERE resend_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS campaign_events_campaign_idx ON public.campaign_events (campaign_id, kind, at DESC);
CREATE INDEX IF NOT EXISTS campaign_events_company_day_idx ON public.campaign_events (company_id, at DESC) WHERE kind = 'sent';

CREATE TABLE IF NOT EXISTS public.email_suppressions (
  id             bigserial PRIMARY KEY,
  company_id     integer NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  email          text NOT NULL,
  reason         text NOT NULL,                         -- unsubscribed | bounced | complained | manual
  source         text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, email)
);

CREATE OR REPLACE FUNCTION public.marketing_campaigns_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  new.updated_at := now();
  RETURN new;
END;
$$;
DROP TRIGGER IF EXISTS marketing_campaigns_touch ON public.marketing_campaigns;
CREATE TRIGGER marketing_campaigns_touch BEFORE UPDATE ON public.marketing_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.marketing_campaigns_touch();

-- ---------------------------------------------------------------------
-- Who may do what. Managers run campaigns; everyone in the company may
-- see them. Members and events are the server's to write.
-- ---------------------------------------------------------------------
ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_members    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_suppressions  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY marketing_campaigns_select ON public.marketing_campaigns FOR SELECT
    USING (company_id IN (SELECT public.current_user_company_ids()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY marketing_campaigns_insert ON public.marketing_campaigns FOR INSERT
    WITH CHECK (company_id IN (SELECT public.current_user_company_ids()) AND public.current_user_access_level() >= 2);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY marketing_campaigns_update ON public.marketing_campaigns FOR UPDATE
    USING (company_id IN (SELECT public.current_user_company_ids()) AND public.current_user_access_level() >= 2);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY marketing_campaigns_delete ON public.marketing_campaigns FOR DELETE
    USING (company_id IN (SELECT public.current_user_company_ids()) AND public.current_user_access_level() >= 2);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY campaign_members_select ON public.campaign_members FOR SELECT
    USING (company_id IN (SELECT public.current_user_company_ids()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY campaign_events_select ON public.campaign_events FOR SELECT
    USING (company_id IN (SELECT public.current_user_company_ids()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY email_suppressions_select ON public.email_suppressions FOR SELECT
    USING (company_id IN (SELECT public.current_user_company_ids()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY email_suppressions_insert ON public.email_suppressions FOR INSERT
    WITH CHECK (company_id IN (SELECT public.current_user_company_ids()) AND public.current_user_access_level() >= 2);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY email_suppressions_delete ON public.email_suppressions FOR DELETE
    USING (company_id IN (SELECT public.current_user_company_ids()) AND public.current_user_access_level() >= 2);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------
-- The tick: every 15 minutes, send what is due. Same Vault key as the
-- nightly suggester (marketing_internal_key ↔ edge MARKETING_INTERNAL_KEY).
-- ---------------------------------------------------------------------
DO $$ BEGIN
  PERFORM cron.unschedule('marketing-campaign-tick');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'marketing-campaign-tick',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://tzrhfhisdeahrrmeksif.supabase.co/functions/v1/marketing-campaign',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-internal-key', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'marketing_internal_key' LIMIT 1)
    ),
    body := '{"tick": true}'::jsonb
  );
  $$
);
