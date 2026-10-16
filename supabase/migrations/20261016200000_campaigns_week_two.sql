-- =====================================================================
-- Campaigns, week two: text touches and call cards (MARKETING_REVIEW.md §3).
--
-- A text touch goes only to someone who has said yes to texts. Customers
-- have carried sms_consent since the A2P work; leads never did, and a
-- prospect Prospect Scout found has certainly not consented. So leads get
-- the same three columns, set when the lead texts START (inbound-sms),
-- when the office ticks "Texting OK" on the Lead Setter card, or when a
-- form captures it. Nothing backfills them: no consent on record is no
-- consent.
-- =====================================================================

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS sms_consent boolean NOT NULL DEFAULT false;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS sms_consent_at timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS sms_consent_source text;
COMMENT ON COLUMN public.leads.sms_consent IS 'Express consent to marketing texts. False until the lead texts START, the office records it, or a form captures it. Campaign text touches check this.';
