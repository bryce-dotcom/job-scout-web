-- =====================================================================
-- When the utility pays less than claimed, someone covers the difference.
--
-- The short-pay rule has always overwritten the utility record with what
-- arrived — the books must show the money that exists. But the customer's
-- credit on the invoice stayed at what was CLAIMED, so the sections engine
-- found an unexplained gap and printed it on the customer's page one as a
-- "Project Discount" nobody gave. The money was right; the label lied.
--
-- shortfall_borne_by already exists to record the decision. These two
-- columns give it something to act on:
--
--   utility_billed     what was claimed from the utility, set the first time
--                      a payment is recorded and never overwritten. The
--                      utility record loses this figure on a short-pay (it
--                      is overwritten with what arrived, on purpose), so the
--                      invoice keeps it — it is what "reopen" restores to.
--   utility_shortfall  claimed minus received, when positive. Null when the
--                      utility paid in full or over.
--
-- With those, the decision has a definite effect (lib/utilitySettlement):
--
--   customer  the credit on the invoice is reduced by the shortfall — the
--             customer owes more, and page one shows the incentive the
--             utility actually paid with no phantom discount line.
--   company   the credit stays; the gap prints as "utility shortfall
--             absorbed", not as a discount.
--
-- Reopening a payment undoes the decision: the credit is restored, the
-- record goes back to the claimed figure, and the columns clear.
-- =====================================================================

alter table public.invoices
  add column if not exists utility_billed    numeric,
  add column if not exists utility_shortfall numeric;

comment on column public.invoices.utility_billed is
  'What was claimed from the utility. Set on the first recorded payment, never overwritten; reopen restores the utility record to it.';
comment on column public.invoices.utility_shortfall is
  'Claimed minus received when the utility paid short. Null when paid in full or over. shortfall_borne_by says who covered it.';
