-- =====================================================================
-- customer_owes is DERIVED, not stored.
--
-- The previous migration added it as a plain numeric to be backfilled. That
-- was a mistake, caught before anything read it.
--
-- What the customer owes is not an independent fact — it is exactly
-- `amount` minus `discount_applied`, which is what arHelpers.invoiceCustomerTotal
-- already computes and what every receivables surface already believes. A
-- stored copy of a derived value is the single most repeated bug in this
-- codebase: the same rule written down twice, then drifting. invoice_lines
-- was written five separate times and one of the five wrote nothing at all.
-- A stored customer_owes would need every invoice-edit path to remember to
-- update it, and there are many.
--
-- A generated column removes the possibility rather than discouraging it.
-- Postgres maintains the value on every insert and update, and the column is
-- read-only, so a write that tries to set it fails loudly instead of storing
-- a wrong number quietly.
--
-- THE EXPRESSION IS A TRANSLITERATION, NOT A REDESIGN
--
--   export function invoiceCustomerTotal(inv) {
--     const gross = Number(inv?.amount) || 0
--     const disc  = Number(inv?.discount_applied) || 0
--     return isLegacyNetShape(gross, disc) ? gross : Math.max(0, gross - disc)
--   }
--   export function isLegacyNetShape(gross, disc) { return disc > 0 && disc > gross }
--
-- Number(null) || 0 is 0, hence coalesce(...,0). Math.max(0, x) is greatest(0, x).
-- The legacy branch handles invoices whose `amount` is ALREADY net of the
-- incentive (job 12814), where subtracting the discount again would bill the
-- customer below zero. Strictly greater, never >=: an invoice the incentive
-- covers exactly has disc = gross and the customer owes nothing.
--
-- scripts/backfill-payer-split.mjs asserts this column equals the JavaScript
-- for every invoice in the database, so the two cannot silently diverge.
--
-- utility_owes stays STORED. It is a real independent fact: what we billed
-- the utility. It is not derivable from the invoice, and after the separate
-- utility_invoices document retires there is nowhere else for it to live.
-- =====================================================================

alter table public.invoices drop column if exists customer_owes;

alter table public.invoices
  add column customer_owes numeric
  generated always as (
    case
      when coalesce(discount_applied, 0) > 0
       and coalesce(discount_applied, 0) > coalesce(amount, 0)
      then coalesce(amount, 0)
      else greatest(0, coalesce(amount, 0) - coalesce(discount_applied, 0))
    end
  ) stored;

comment on column public.invoices.customer_owes is
  'DERIVED, read-only. What the customer owes after credits. Generated from amount and discount_applied so it cannot drift from arHelpers.invoiceCustomerTotal. To change it, change those.';
