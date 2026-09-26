-- A financing webhook that fires twice must not pay the invoice twice.
--
-- Wisetack, GreenSky and the rest retry a webhook until they get a 2xx, and
-- they re-send on their own schedule besides. recordFinancingPayment had
-- nothing to dedupe on: every delivery inserted another payments row, so a
-- single funded loan could read as two payments and mark an invoice Paid on
-- half the money. Stripe's webhook has dedupe (stripe_payment_intent_id);
-- financing had none.
--
-- external_payment_id is the provider's own id for the transaction — the loan
-- application id for Wisetack, the application id for GreenSky. The partial
-- unique index is what actually enforces it, in the database, where a retry
-- arriving while the first insert is still in flight cannot slip past a
-- read-then-write check in application code.

alter table public.payments add column if not exists external_payment_id text;

create unique index if not exists payments_external_payment_id_uniq
  on public.payments (company_id, external_payment_id)
  where external_payment_id is not null;
