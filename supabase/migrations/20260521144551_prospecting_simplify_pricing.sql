-- ====================================================================
-- Simplify AI Prospecting pricing:
--   - Drop the 3-tier model (free / pro / unlimited) in favor of two
--     real tiers + one comp tier:
--       free     : built into every JobScout subscription
--       pro      : $49/mo, one paid plan (no $99 Unlimited)
--       field_boss : free for life — auto-applied to anyone with
--                    companies.subscription_tier = 'field_boss'
--   - 'field_boss' as a prospecting_tier value lets us track who's
--     on the comp plan separately from paying Pro customers for
--     analytics, even though it's free for them.
--
-- Reason: JobScout customers already pay for JobScout. One simple
-- paid add-on at $49 lands easier than a two-paid-tier decision.
-- Field Boss subscribers get prospecting bundled in as a perk.
-- ====================================================================

-- Update the CHECK constraint: drop 'unlimited', add 'field_boss'
ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_prospecting_tier_check;

-- Migrate any companies currently sitting on 'unlimited' down to 'pro'
-- so they keep paid access without inheriting a no-longer-offered tier.
-- (Currently none exist, but future-proofing the migration.)
UPDATE public.companies
   SET prospecting_tier = 'pro'
 WHERE prospecting_tier = 'unlimited';

ALTER TABLE public.companies
  ADD CONSTRAINT companies_prospecting_tier_check
  CHECK (prospecting_tier IN ('free','pro','field_boss'));

-- Auto-grant Field Boss subscribers the comp prospecting tier.
-- This keeps them in sync today; the Stripe webhook (Sprint 2) will
-- also flip the flag on subscription change events going forward.
UPDATE public.companies
   SET prospecting_tier = 'field_boss'
 WHERE subscription_tier = 'field_boss'
   AND prospecting_tier <> 'field_boss';

NOTIFY pgrst, 'reload schema';
