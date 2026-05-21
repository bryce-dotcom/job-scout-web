-- ====================================================================
-- AI Prospecting tiers + monthly usage quotas
--
-- Three-tier per-company pricing for the AI prospect researcher:
--   - free       : 3 searches + 10 enrichments per company per month
--   - pro        : 50 searches + 200 enrichments per company per month
--                  (~$39/mo, 20% off annual)
--   - unlimited  : 250 searches + 1000 enrichments per company per month
--                  (~$99/mo, 20% off annual)
--
-- Quotas are enforced in the prospect-research edge function. Usage is
-- tracked per-company-per-period in prospecting_usage. Period = calendar
-- month; rolls over at 00:00 UTC on the 1st.
--
-- Stripe integration ships in a follow-on commit. For now the tier
-- defaults to 'free' for every company and HR can manually flip it via
-- the Settings page until paid plans are wired up.
-- ====================================================================

-- 1) Add tier columns to companies
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS prospecting_tier text NOT NULL DEFAULT 'free'
    CHECK (prospecting_tier IN ('free','pro','unlimited')),
  ADD COLUMN IF NOT EXISTS prospecting_tier_renews_at  timestamptz,
  ADD COLUMN IF NOT EXISTS prospecting_tier_canceled   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS prospecting_stripe_sub_id   text;

COMMENT ON COLUMN public.companies.prospecting_tier IS
  'AI prospecting plan: free | pro | unlimited. Drives monthly quotas + which features show in the drawer.';

-- 2) Per-period usage tracking. One row per (company, period) so we
--    can look up + increment quickly. Period = YYYY-MM (UTC).
CREATE TABLE IF NOT EXISTS public.prospecting_usage (
  id            bigserial PRIMARY KEY,
  company_id    integer NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period        text    NOT NULL,   -- 'YYYY-MM' UTC
  searches      integer NOT NULL DEFAULT 0,
  enrichments   integer NOT NULL DEFAULT 0,
  -- Per-period overage counters (for billing later)
  searches_overage    integer NOT NULL DEFAULT 0,
  enrichments_overage integer NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, period)
);

CREATE INDEX IF NOT EXISTS idx_prospecting_usage_company_period
  ON public.prospecting_usage (company_id, period DESC);

REVOKE ALL ON public.prospecting_usage FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.prospecting_usage TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.prospecting_usage_id_seq TO authenticated;

ALTER TABLE public.prospecting_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospecting_usage FORCE  ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tenant_isolation ON public.prospecting_usage
    AS PERMISSIVE FOR ALL TO authenticated
    USING      (company_id IN (SELECT public.current_user_company_ids()))
    WITH CHECK (company_id IN (SELECT public.current_user_company_ids()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Helper RPC: atomic upsert + increment for usage tracking. Avoids
--    race conditions when two requests come in at the same moment.
CREATE OR REPLACE FUNCTION public.bump_prospecting_usage(
  p_company_id integer,
  p_period     text,
  p_searches   integer DEFAULT 0,
  p_enrichments integer DEFAULT 0
)
RETURNS public.prospecting_usage
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  result public.prospecting_usage;
BEGIN
  INSERT INTO public.prospecting_usage (company_id, period, searches, enrichments)
  VALUES (p_company_id, p_period, p_searches, p_enrichments)
  ON CONFLICT (company_id, period) DO UPDATE
    SET searches    = prospecting_usage.searches + EXCLUDED.searches,
        enrichments = prospecting_usage.enrichments + EXCLUDED.enrichments,
        updated_at  = now()
  RETURNING * INTO result;
  RETURN result;
END;
$$;
GRANT EXECUTE ON FUNCTION public.bump_prospecting_usage(integer, text, integer, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
