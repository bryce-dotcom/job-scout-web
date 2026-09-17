-- A Stripe payout knows what it carried; the books should too.
--
-- When a customer pays by card the webhook records the payment on their
-- invoice at once. Days later Stripe pays the money out to the bank, net of
-- its fee, several customers' charges in one deposit — and nothing tied the
-- deposit to the payments inside it. HHH had 82 payouts since June with no
-- link, sitting in Books as "unmatched deposits" (Tracy, 2026-09-16,
-- b6e2f81d). stripe-sync-books now reads each payout's balance transactions
-- (_shared/stripePayoutLink.ts) and writes the link here:
--
--   payments.stripe_payout_id       the payout that carried this payment
--   payments.stripe_fee             what Stripe kept from it (the invoice's
--                                   credit_card_fee is the surcharge the
--                                   CUSTOMER paid — a different number)
--   payments.source_transaction_id  the bank deposit, once it has landed
--                                   (already existed; wallet-payout precedent)
--   plaid_transactions.stripe_payout_id  the bank deposit that is this payout
--
-- All nullable; nothing existing changes shape.

alter table public.payments add column if not exists stripe_payout_id text;
alter table public.payments add column if not exists stripe_fee numeric(12,2);
create index if not exists payments_stripe_payout_idx on public.payments (stripe_payout_id) where stripe_payout_id is not null;

alter table public.plaid_transactions add column if not exists stripe_payout_id text;
create index if not exists plaid_transactions_stripe_payout_idx on public.plaid_transactions (stripe_payout_id) where stripe_payout_id is not null;
