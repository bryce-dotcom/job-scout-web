-- Marketing brands: one company, several voices, several sets of accounts.
--
-- HHH markets three things from one JobScout instance: HHH Building
-- Services (cleaning), Energy Scout (lighting) and JobScout itself. Each
-- has its own Facebook page, Instagram and Google Business listing, and
-- sounds different. A brand is NOT a business unit: JobScout has no jobs.
-- A brand MAY name the business unit whose finished jobs feed it, so the
-- nightly suggester drafts a cleaning job in the cleaning voice.
--
-- The list lives in settings key marketing_brands:
--   [{ id: 'energy-scout', name: 'Energy Scout', unit: 'Energy Scout', logo_url }]
-- and every brand-scoped setting is the base key suffixed with the id:
--   marketing_brand_kit:energy-scout, marketing_publisher:energy-scout.
-- No suffix = the company's single default brand, which is what every
-- single-brand tenant keeps using untouched.
--
-- Posts and captures carry the brand id. NULL on a capture means "not
-- decided yet" (a texted photo, a yard snap); the composer decides.

ALTER TABLE public.marketing_posts    ADD COLUMN IF NOT EXISTS brand text;
ALTER TABLE public.marketing_captures ADD COLUMN IF NOT EXISTS brand text;
COMMENT ON COLUMN public.marketing_posts.brand    IS 'Brand id from settings.marketing_brands; NULL = the company default brand.';
COMMENT ON COLUMN public.marketing_captures.brand IS 'Brand id the photo was filed under; NULL = undecided, the composer picks.';

CREATE INDEX IF NOT EXISTS marketing_posts_brand_idx ON public.marketing_posts (company_id, brand, status);
