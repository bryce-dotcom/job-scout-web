-- ====================================================================
-- Apollo.io Prospecting v1
--
-- Per-company integration with Apollo.io for B2B prospect search +
-- email/phone reveal. Setters use this from /lead-setter to find net-
-- new prospects, then bulk-import the ones they want into the leads
-- pipeline.
--
-- v1 scope:
--   - companies stores the Apollo API key + cached credit balance
--   - prospect_enrichments caches Apollo person/company reveals so we
--     don't burn credits on the same record twice
--   - leads gets apollo_person_id + enrichment_data for traceability
--
-- v2 (later): prospect_lists for saved searches, email_sequences for
-- automated outreach.
-- ====================================================================

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS apollo_api_key             text,
  ADD COLUMN IF NOT EXISTS apollo_api_key_last4       text,
  ADD COLUMN IF NOT EXISTS apollo_credits_remaining   integer,
  ADD COLUMN IF NOT EXISTS apollo_last_synced_at      timestamptz;

COMMENT ON COLUMN public.companies.apollo_api_key IS
  'Apollo.io API key. Protected by tenant_isolation RLS (only the owning company''s admins can read). Used server-side via edge functions only.';

-- Enrichment cache: Apollo records we''ve already revealed. Avoids
-- burning credits on the same person if a setter searches twice or
-- re-imports. Keyed by (company_id, apollo_person_id) so two
-- companies can each have their own cached copy.
CREATE TABLE IF NOT EXISTS public.prospect_enrichments (
  id                bigserial PRIMARY KEY,
  company_id        integer NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  apollo_person_id  text    NOT NULL,
  apollo_org_id     text,
  payload           jsonb   NOT NULL DEFAULT '{}'::jsonb,
  -- Quick-access columns extracted from payload for filtering/display
  full_name         text,
  title             text,
  email             text,
  phone             text,
  company_name      text,
  linkedin_url      text,
  revealed_at       timestamptz NOT NULL DEFAULT now(),
  imported_as_lead_id integer REFERENCES public.leads(id) ON DELETE SET NULL,
  imported_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, apollo_person_id)
);

CREATE INDEX IF NOT EXISTS idx_prospect_enrichments_company_revealed
  ON public.prospect_enrichments (company_id, revealed_at DESC);

REVOKE ALL ON public.prospect_enrichments FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospect_enrichments TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.prospect_enrichments_id_seq TO authenticated;

ALTER TABLE public.prospect_enrichments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prospect_enrichments FORCE  ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tenant_isolation ON public.prospect_enrichments
    AS PERMISSIVE FOR ALL TO authenticated
    USING      (company_id IN (SELECT public.current_user_company_ids()))
    WITH CHECK (company_id IN (SELECT public.current_user_company_ids()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- leads gains traceability columns so we can tell which leads came from
-- Apollo + drill into the original record.
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS apollo_person_id text,
  ADD COLUMN IF NOT EXISTS enrichment_data  jsonb;

CREATE INDEX IF NOT EXISTS idx_leads_apollo_person_id
  ON public.leads (apollo_person_id) WHERE apollo_person_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
