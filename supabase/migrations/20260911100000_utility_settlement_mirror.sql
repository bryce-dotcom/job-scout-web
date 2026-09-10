-- =====================================================================
-- The utility's settlement lives on the invoice.
--
-- Step three of retiring the separate utility invoice. After this,
-- receivables can read a rebate job's utility debt — how much, to whom,
-- whether it has been paid — from the one invoice, with utility_invoices
-- consulted only for rows nobody has linked yet.
--
-- WHY NOT A PAYMENT ROW
--
-- payments.paid_by = 'utility' exists and is the long-term shape: a receipt
-- is a dated ledger entry. But cash-basis revenue ALREADY counts collected
-- incentives from utility_invoices (revenueBasis.collectedIncentives), and
-- bonusCalc / repCommissions pay out on payment rows. Inserting utility
-- receipts as payments today would double-count revenue and put incentive
-- money into commission and bonus runs — three business decisions that
-- belong to the owner, made one at a time, each verified. So the settlement
-- is a dated fact on the invoice for now, and the ledger step waits.
--
-- WHY A TRIGGER
--
-- Until utility_invoices becomes a view, the office still records utility
-- payments there — sixteen write sites across four pages (mark paid, reopen,
-- correct the date, short-pay, reconcile, delete). A JavaScript sync would
-- have to be remembered at every one of them, and this codebase's most
-- repeated bug is one rule written in two places that drift. The mirror is
-- ONE rule, here, fired by every writer including ones not written yet, in
-- the same transaction as the write it mirrors.
--
-- Direction of truth during the transition: utility_invoices → invoices.
-- When the table becomes a view the direction flips and this trigger goes.
--
-- WHAT THE MIRROR WRITES, AND WHY THOSE EXPRESSIONS
--
--   utility_owes     coalesce(amount, incentive_amount)
--                    the same figure arHelpers.totalUtilityAR sums and the
--                    step-two backfill wrote — a short-pay overwrites amount
--                    with what was received, so for a paid row this is the
--                    settled figure, which is what the books believe today
--   utility_paid_at  paid_at when status is Paid, else null
--                    paid_at is the receipt date the office records; it is
--                    what payroll's utility commissions and (as of yesterday)
--                    cash revenue already key on. updated_at is the fallback
--                    only for a row marked Paid before paid_at existed —
--                    never the first choice, because any edit re-dates it
--   utility_provider_id
--                    set only when the invoice has none and the utility's
--                    name matches exactly one provider the company can see.
--                    It never overwrites a provider a person chose.
--
-- The trigger only acts on rows that carry invoice_id. It does not guess a
-- link from job_id — that heuristic ran once, in the backfill below, under
-- the same rule the step-two script used, and the result is now explicit.
-- =====================================================================

alter table public.invoices
  add column if not exists utility_paid_at timestamptz;

comment on column public.invoices.utility_paid_at is
  'When the utility paid. Null = still owed. Mirrored from utility_invoices.paid_at by mirror_utility_settlement() until that table retires.';

create or replace function public.mirror_utility_settlement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id  integer;
  co_id      integer;
  provider   integer;
begin
  -- A deleted or relinked utility row releases the invoice it pointed at —
  -- everything the mirror set, the provider included. A utility named on an
  -- invoice that owes it nothing is a dangling fact, not a record.
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.invoice_id is distinct from new.invoice_id) then
    if old.invoice_id is not null then
      update public.invoices
         set utility_owes = null,
             utility_paid_at = null,
             utility_provider_id = null
       where id = old.invoice_id;
    end if;
    if tg_op = 'DELETE' then
      return old;
    end if;
  end if;

  target_id := new.invoice_id;
  if target_id is null then
    return new;
  end if;

  select company_id into co_id from public.invoices where id = target_id;

  -- Name the utility only when nobody has, and only when the name is unambiguous.
  select min(p.id) into provider
    from public.utility_providers p
   where lower(trim(p.provider_name)) = lower(trim(coalesce(new.utility_name, '')))
     and (p.company_id is null or p.company_id = co_id)
  having count(*) = 1;

  update public.invoices
     set utility_owes = case
                          when new.payment_status = 'Void' then 0
                          else coalesce(new.amount, new.incentive_amount)
                        end,
         utility_paid_at = case
                             when new.payment_status = 'Paid'
                               then coalesce(new.paid_at, new.updated_at, now())
                             else null
                           end,
         utility_provider_id = coalesce(utility_provider_id, provider)
   where id = target_id;

  return new;
end;
$$;

drop trigger if exists trg_mirror_utility_settlement on public.utility_invoices;
create trigger trg_mirror_utility_settlement
  after insert or update or delete on public.utility_invoices
  for each row execute function public.mirror_utility_settlement();

-- ---------------------------------------------------------------------
-- Make every link explicit.
--
-- Nine of the nineteen invoices backfilled in step two were matched to
-- their utility row by job — the row's invoice_id was null. Record the
-- match so the trigger, receivables, and the eventual view all read the
-- same link, under the same rule the step-two script used: the job's one
-- invoice with a non-zero amount that now carries a utility debt.
-- ---------------------------------------------------------------------
with candidates as (
  select u2.id          as utility_row,
         i.id           as invoice_id,
         i.invoice_id   as invoice_number,
         count(*) over (partition by u2.id) as n
    from public.utility_invoices u2
    join public.invoices i
      on i.job_id = u2.job_id
     and i.amount > 0
     and i.utility_owes is not null
   where u2.invoice_id is null
)
update public.utility_invoices u
   set invoice_id = c.invoice_id,
       linked_invoice_number = coalesce(u.linked_invoice_number, c.invoice_number)
  from candidates c
 where u.id = c.utility_row
   and c.n = 1;

-- ---------------------------------------------------------------------
-- Now let the one rule populate every linked invoice. A no-op update fires
-- the mirror for each linked row, so the values on the invoice come from
-- the trigger and nothing else — the step-two backfill's figures are
-- re-derived here and must come out identical (the script checks).
-- ---------------------------------------------------------------------
update public.utility_invoices set id = id where invoice_id is not null;
