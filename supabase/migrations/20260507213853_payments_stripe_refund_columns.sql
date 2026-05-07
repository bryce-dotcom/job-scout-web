-- Track Stripe refunds against payments. A payment can be partially or
-- fully refunded; if refunded_amount >= amount we treat it as a full
-- refund and the parent invoice's payment_status flips back to 'Sent'
-- or 'Partially Paid' depending on remaining balance.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS refunded_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refunded_amount  NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stripe_refund_id TEXT,
  ADD COLUMN IF NOT EXISTS refund_reason    TEXT;

COMMENT ON COLUMN public.payments.refunded_at      IS 'When the most recent refund was issued.';
COMMENT ON COLUMN public.payments.refunded_amount  IS 'Sum of all refunds against this payment (in dollars).';
COMMENT ON COLUMN public.payments.stripe_refund_id IS 'Stripe re_... refund object id, latest refund.';
COMMENT ON COLUMN public.payments.refund_reason    IS 'Free-text reason captured at refund time.';

NOTIFY pgrst, 'reload schema';
