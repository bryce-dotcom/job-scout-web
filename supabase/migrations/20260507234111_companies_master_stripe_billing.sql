-- JobScout-side billing of the tenant.
--
-- This is DIFFERENT from the per-tenant Stripe keys used to charge their
-- own customers. These columns track JobScout's master Stripe account
-- (used to bill the tenant for their subscription).
--
-- Naming: master_* to avoid confusion with the tenant's customer-facing
-- stripe_* columns elsewhere on companies.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS master_stripe_customer_id     TEXT,
  ADD COLUMN IF NOT EXISTS master_stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS billing_status                TEXT DEFAULT 'unbilled',
    -- unbilled | trialing | active | past_due | canceled | suspended
  ADD COLUMN IF NOT EXISTS trial_ends_at                 TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS billing_payment_method_brand  TEXT,
  ADD COLUMN IF NOT EXISTS billing_payment_method_last4  TEXT,
  ADD COLUMN IF NOT EXISTS billing_email                 TEXT,
  ADD COLUMN IF NOT EXISTS billing_notes                 TEXT;

COMMENT ON COLUMN public.companies.master_stripe_customer_id     IS 'Stripe Customer ID on JobScout''s master Stripe account (NOT the tenant''s own Stripe account).';
COMMENT ON COLUMN public.companies.master_stripe_subscription_id IS 'Active Stripe Subscription ID on JobScout''s master account.';
COMMENT ON COLUMN public.companies.billing_status                IS 'Current JobScout-side billing state: unbilled | trialing | active | past_due | canceled | suspended.';
COMMENT ON COLUMN public.companies.trial_ends_at                 IS 'When the JobScout free trial ends (drives the in-app banner).';

CREATE INDEX IF NOT EXISTS idx_companies_billing_status ON public.companies(billing_status);
CREATE INDEX IF NOT EXISTS idx_companies_master_stripe ON public.companies(master_stripe_customer_id) WHERE master_stripe_customer_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
