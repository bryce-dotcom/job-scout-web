-- Persist Stripe Payment Link URLs on invoices so we can re-display
-- the same link on subsequent visits without recreating it on Stripe.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS stripe_payment_link_url TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payment_link_id  TEXT;

COMMENT ON COLUMN public.invoices.stripe_payment_link_url IS
  'Hosted Stripe Payment Link URL — generated on demand for one-click customer payment.';
COMMENT ON COLUMN public.invoices.stripe_payment_link_id IS
  'Stripe payment_link object id (so we can deactivate it after payment if needed).';

NOTIFY pgrst, 'reload schema';
