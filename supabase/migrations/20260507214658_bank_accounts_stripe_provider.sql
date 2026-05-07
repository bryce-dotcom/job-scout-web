-- Track which provider a bank_accounts row represents (Plaid vs Stripe
-- vs manual). Lets Books surface Stripe alongside real bank accounts
-- and lets the Stripe sync find/upsert the correct row per tenant.

ALTER TABLE public.bank_accounts
  ADD COLUMN IF NOT EXISTS provider             TEXT,
  ADD COLUMN IF NOT EXISTS provider_account_id  TEXT,
  ADD COLUMN IF NOT EXISTS pending_balance       NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS available_balance     NUMERIC(14,2) DEFAULT 0;

COMMENT ON COLUMN public.bank_accounts.provider IS
  'plaid | stripe | manual';
COMMENT ON COLUMN public.bank_accounts.provider_account_id IS
  'Provider-specific identifier (Plaid account_id, Stripe account id, etc.)';
COMMENT ON COLUMN public.bank_accounts.pending_balance IS
  'Funds in transit (Stripe charges that have not yet paid out, etc.)';
COMMENT ON COLUMN public.bank_accounts.available_balance IS
  'Funds available for payout / withdrawal.';

-- Backfill: any existing rows are Plaid-synced (the only source up to
-- now). Manual rows can be added going forward with provider='manual'.
UPDATE public.bank_accounts
   SET provider = 'plaid'
 WHERE provider IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS bank_accounts_company_provider_unique
  ON public.bank_accounts(company_id, provider, provider_account_id)
  WHERE provider IS NOT NULL;

NOTIFY pgrst, 'reload schema';
