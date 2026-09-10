-- =====================================================================
-- One invoice, two debtors.
--
-- A rebate job bills two parties: the utility owes the incentive, the
-- customer owes their out-of-pocket on the in-scope work plus everything
-- out of scope. Today that is two documents — an invoice and a separate
-- utility_invoices row — and the books have to stitch receivables together
-- from both (arHelpers.totalAR = totalCustomerAR + totalUtilityAR).
--
-- These columns put both obligations on the one invoice so the stitch can
-- go away. This migration ONLY adds and backfills them. Nothing reads them
-- yet, which is deliberate: it means accounts receivable cannot move on the
-- day this lands, and the change can be verified against live numbers
-- before anything depends on it.
--
-- WHAT THE TWO FIGURES MEAN
--
--   utility_owes     what we billed the utility — the incentive. Stored,
--                    not derived, because the utility can approve less than
--                    we claimed or claw it back after an audit, and then
--                    the figure is a fact about their decision, not about
--                    our arithmetic.
--   customer_owes    what the customer owes after the incentive.
--
-- They are NOT constrained to sum to invoices.amount, and that is on
-- purpose. Real invoices carry `amount` in two different shapes: some hold
-- the GROSS with the incentive in discount_applied, others hold the NET
-- with no discount at all (job 12814 is the second kind). A constraint
-- assuming one shape would reject the other. Each half is individually
-- correct instead, which is what receivables actually need.
--
-- shortfall_borne_by records the decision when a utility pays less than
-- billed: the customer covers it, or the company absorbs it. No default —
-- either default is wrong half the time, so a human chooses per invoice.
-- =====================================================================

alter table public.invoices
  add column if not exists utility_owes          numeric,
  add column if not exists customer_owes         numeric,
  add column if not exists utility_provider_id   integer references public.utility_providers(id),
  -- The aging clock. A utility owes nothing until the submittal is actually
  -- sent, so this is when their balance starts aging — not the invoice date,
  -- which would show them overdue for however long the package sat unsent.
  add column if not exists utility_submitted_at  timestamptz,
  add column if not exists shortfall_borne_by    text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'invoices_shortfall_borne_by_check'
  ) then
    alter table public.invoices
      add constraint invoices_shortfall_borne_by_check
      check (shortfall_borne_by is null or shortfall_borne_by in ('customer', 'company'));
  end if;
end $$;

-- Who paid. Every payment row today belongs to a customer: payments.invoice_id
-- has only ever pointed at a customer invoice, and a utility paying us was
-- recorded as a status flag on utility_invoices rather than as a dated payment
-- at all. That is the hole this closes — but the default keeps every existing
-- row meaning exactly what it means now.
alter table public.payments
  add column if not exists paid_by text not null default 'customer';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'payments_paid_by_check'
  ) then
    alter table public.payments
      add constraint payments_paid_by_check
      check (paid_by in ('customer', 'utility'));
  end if;
end $$;

comment on column public.invoices.utility_owes is
  'What the utility owes on this invoice (the incentive). Stored, not derived — a utility can approve less than billed.';
comment on column public.invoices.customer_owes is
  'What the customer owes after the incentive. Equals arHelpers.invoiceCustomerTotal at backfill time.';
comment on column public.invoices.utility_submitted_at is
  'When the submittal was sent. The utility balance ages from here, not from the invoice date.';
comment on column public.invoices.shortfall_borne_by is
  'Set only when a utility pays less than billed: who covers the difference.';
comment on column public.payments.paid_by is
  'customer or utility. Lets the two balances age separately in receivables.';
