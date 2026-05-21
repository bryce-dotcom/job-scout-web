-- ====================================================================
-- Stripe wiring for AI Prospecting Pro subscription.
--
-- companies already has prospecting_stripe_sub_id from the prospecting
-- quotas migration. Rename for clarity + add the timestamp + cancel
-- intent fields the webhook needs to track subscription lifecycle.
--
-- We intentionally keep the JobScout-tier subscription separate from
-- the Prospecting Pro subscription. They're two Stripe subscriptions
-- on the same customer. Easier to cancel one without losing the other.
-- ====================================================================

-- prospecting_stripe_sub_id is the existing column from the quotas
-- migration. Keeping the name; just adding companion fields.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS prospecting_subscription_cancel_at timestamptz,
  ADD COLUMN IF NOT EXISTS prospecting_subscription_canceled_at timestamptz,
  ADD COLUMN IF NOT EXISTS prospecting_subscription_interval   text  -- 'month' | 'year'
    CHECK (prospecting_subscription_interval IS NULL OR prospecting_subscription_interval IN ('month','year'));

CREATE INDEX IF NOT EXISTS idx_companies_prospecting_sub
  ON public.companies (prospecting_stripe_sub_id)
  WHERE prospecting_stripe_sub_id IS NOT NULL;

COMMENT ON COLUMN public.companies.prospecting_stripe_sub_id IS
  'Stripe subscription ID for the Prospecting Pro $49/mo add-on. Separate from master_stripe_subscription_id which tracks the main JobScout tier. NULL = on the free tier or comp Field Boss tier.';

NOTIFY pgrst, 'reload schema';
