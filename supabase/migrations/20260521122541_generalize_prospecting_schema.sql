-- ====================================================================
-- Generalize prospecting schema: drop Apollo branding, keep useful bones.
--
-- We pivoted away from the Apollo.io integration in favor of an in-house
-- AI-research agent (Gemini + Google Search grounding). The cache table
-- + lead-traceability columns from the prior migration are still useful
-- as long as they're vendor-neutral. This migration renames them.
--
-- Changes:
--   - prospect_enrichments.apollo_person_id → external_prospect_id
--   - prospect_enrichments.apollo_org_id → external_org_id
--   - Adds prospect_enrichments.source ('ai_agent'|'google_places'|...
--     |'manual') so the same row schema supports multiple data sources
--   - leads.apollo_person_id → external_prospect_id
--   - Drops companies.apollo_* columns entirely (Apollo-specific)
-- ====================================================================

-- 1) Drop Apollo-specific company columns
ALTER TABLE public.companies
  DROP COLUMN IF EXISTS apollo_api_key,
  DROP COLUMN IF EXISTS apollo_api_key_last4,
  DROP COLUMN IF EXISTS apollo_credits_remaining,
  DROP COLUMN IF EXISTS apollo_last_synced_at;

-- 2) Rename + extend prospect_enrichments
ALTER TABLE public.prospect_enrichments
  RENAME COLUMN apollo_person_id TO external_prospect_id;
ALTER TABLE public.prospect_enrichments
  RENAME COLUMN apollo_org_id TO external_org_id;

-- Add source column so we know where each enrichment came from
ALTER TABLE public.prospect_enrichments
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'ai_agent'
    CHECK (source IN ('ai_agent','google_places','opencorporates','public_registry','manual','imported'));

-- 3) Rename the leads column
ALTER TABLE public.leads
  RENAME COLUMN apollo_person_id TO external_prospect_id;

COMMENT ON COLUMN public.prospect_enrichments.external_prospect_id IS
  'Source-system ID for this prospect (e.g. AI-agent-generated UUID, Google Place ID, registry ID). UNIQUE per (company_id, external_prospect_id).';
COMMENT ON COLUMN public.prospect_enrichments.source IS
  'Where this prospect came from: ai_agent (Gemini research), google_places, opencorporates, public_registry, manual entry, or imported CSV.';

NOTIFY pgrst, 'reload schema';
