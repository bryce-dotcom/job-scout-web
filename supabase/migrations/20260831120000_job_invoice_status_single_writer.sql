-- =====================================================================
-- jobs.invoice_status gets exactly one writer: the database.
--
-- THE PROBLEM
--
-- `jobs.invoice_status` answers "does this job have an invoice, and is it
-- paid". That fact already lives in the `invoices` table. The column is a
-- cache of it, and five different places in the app wrote that cache by
-- hand:
--
--   JobDetail.jsx  x3   'Invoiced' on generate, 'Not Invoiced' on reset
--   PMJobSetter.jsx     'Invoiced' when a drag auto-invoices a job
--   InvoiceDetail.jsx   null when the invoice is deleted
--
-- Every other route that creates an invoice — the Invoices page, imports,
-- edge functions — wrote no cache at all. So the cache drifted, badly.
-- Measured on company 3 before this migration:
--
--   723 jobs have an invoice
--   241 of them say so                 <- the column was right 33% of the time
--   484 have an invoice and DENY it
--   479 have an invoice and NEITHER field reflects it
--     0 jobs are flagged 'Paid', while 444 have invoices that are all paid
--
-- 'Paid' is in the column's documented vocabulary (importExportFields.js)
-- and gets its own green pill on three screens. Nothing has ever written it.
--
-- The app had already begun working around the column instead of fixing it.
-- JobDetail:5601 stopped trusting it in so many words — "that field can be
-- stale" — and re-derives from the invoices table. SalesPipeline moved its
-- delivery column off it. Two workarounds, no fix, and the readers that were
-- left kept lying: a false "Ready to invoice" alert fires for jobs that were
-- invoiced months ago.
--
-- THE FIX
--
-- The column stays — imports, exports and eight read sites use it, and
-- rewriting those is how invoice screens get broken. What changes is that
-- nothing in the app writes it any more. `invoices` is the truth; a trigger
-- keeps the cache equal to the truth; the frontend only reads.
--
-- jobs.status is deliberately NOT touched here. It is not a duplicate of
-- this column, it is the pipeline stage a human moves a card to, and
-- 'Invoiced' there means "the invoice was SENT" — a distinction SalesPipeline
-- documents at line 477 and relies on. Invoice existence and workflow stage
-- are two different facts about a job and each now has one home.
-- =====================================================================


-- ---------------------------------------------------------------------
-- The rule, written once.
-- ---------------------------------------------------------------------
-- Deliberately limited to the three values the column has always claimed to
-- hold: 'Not Invoiced', 'Invoiced', 'Paid'. Introducing a fourth would put a
-- string on screens whose colour maps and conditionals were never written to
-- expect it. A partially-paid job reads 'Invoiced', which is true.
create or replace function public.job_invoice_status(p_job_id integer)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when count(*) = 0 then 'Not Invoiced'
    when count(*) filter (where coalesce(payment_status, '') <> 'Paid') = 0 then 'Paid'
    else 'Invoiced'
  end
  from public.invoices
  where job_id = p_job_id;
$$;


-- ---------------------------------------------------------------------
-- Keep the cache equal to the truth.
-- ---------------------------------------------------------------------
create or replace function public.sync_job_invoice_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ids integer[];
  jid integer;
  want text;
begin
  -- Both sides, because an UPDATE can move an invoice from one job to
  -- another and then BOTH jobs are wrong.
  ids := array_remove(array[
    case when tg_op <> 'INSERT' then old.job_id end,
    case when tg_op <> 'DELETE' then new.job_id end
  ], null);

  foreach jid in array ids loop
    begin
      want := public.job_invoice_status(jid);
      -- `is distinct from` so a no-op change does not churn the row and
      -- fire the jobs audit trigger for nothing.
      update public.jobs
         set invoice_status = want
       where id = jid
         and invoice_status is distinct from want;
    exception when others then
      -- A display cache must never be able to roll back an invoice. If this
      -- fails the badge is stale for that job and the backfill below can be
      -- re-run; if it raised, someone could not bill a customer.
      raise warning 'sync_job_invoice_status: job % not synced: %', jid, sqlerrm;
    end;
  end loop;

  return coalesce(new, old);
end;
$$;

drop trigger if exists sync_job_invoice_status on public.invoices;
create trigger sync_job_invoice_status
  after insert or update or delete on public.invoices
  for each row execute function public.sync_job_invoice_status();


-- ---------------------------------------------------------------------
-- Backfill every tenant.
-- ---------------------------------------------------------------------
-- Only rows that actually change, so this does not stamp thousands of jobs
-- into the audit log. updated_at is left alone on purpose: this corrects a
-- derived value, it is not someone editing the job, and offline sync keys
-- off that timestamp.
update public.jobs j
   set invoice_status = public.job_invoice_status(j.id)
 where j.invoice_status is distinct from public.job_invoice_status(j.id);


-- ---------------------------------------------------------------------
-- New jobs start correct without anyone remembering to say so.
-- ---------------------------------------------------------------------
-- The trigger only fires on invoices, so a brand-new job needs a starting
-- value. That was hand-written at one insert site and omitted at the rest,
-- which is where the 16 NULL rows came from — and NULL has no entry in
-- invoiceStatusColors, so those jobs rendered no pill at all.
alter table public.jobs
  alter column invoice_status set default 'Not Invoiced';
