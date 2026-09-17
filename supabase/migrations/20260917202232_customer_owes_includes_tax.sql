-- customer_owes must include sales tax, exactly as lib/arHelpers.invoiceCustomerTotal
-- does since 2026-09-17: (legacy-net ? amount : max(0, amount − discount)) + tax_amount.
-- Generated columns cannot be altered in place, so drop and re-add (same
-- pattern as 20260910190000). tax_amount defaults to 0, so nothing moves for
-- an invoice that has no tax.
alter table public.invoices drop column if exists customer_owes;
alter table public.invoices
  add column customer_owes numeric
  generated always as (
    (
      case
        when coalesce(discount_applied, 0) > 0
         and coalesce(discount_applied, 0) > coalesce(amount, 0)
        then coalesce(amount, 0)
        else greatest(0, coalesce(amount, 0) - coalesce(discount_applied, 0))
      end
    ) + coalesce(tax_amount, 0)
  ) stored;
comment on column public.invoices.customer_owes is
  'DERIVED, read-only. What the customer owes after credits, plus sales tax. Generated from amount, discount_applied and tax_amount so it cannot drift from arHelpers.invoiceCustomerTotal. To change it, change those.';

NOTIFY pgrst, 'reload schema';
