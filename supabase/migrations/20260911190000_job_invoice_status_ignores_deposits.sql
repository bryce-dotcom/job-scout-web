-- =====================================================================
-- A deposit invoice does not invoice the job.
--
-- job_invoice_status() answers "has this job been invoiced, and is that
-- invoice paid". Since 20260831 it has counted every row in `invoices` for
-- the job — including the deposit, which goes out the day the job is won,
-- before anything is ordered or installed.
--
-- What that did on JOB-MTJ2MSZX (Doug, 2026-09-08):
--
--   09-01  deposit invoice created      jobs.invoice_status -> 'Invoiced'
--   09-11  deposit paid ($3,424.02)     jobs.invoice_status -> 'Paid'
--
-- with a $56,386.34 job still unbilled. The Jobs list shows a green Paid
-- pill on it, and when the crew marks it Complete, the "ready to invoice"
-- alert stays silent because `needsInvoice` reads the column and sees
-- 'Paid'. That alert exists so AR does not have to hunt the board for
-- finished jobs; a deposit should not be able to switch it off.
--
-- The frontend already draws this line: JobDetail offers "Generate Invoice"
-- while every invoice on the job is a deposit (`invoice_type !== 'deposit'`).
-- This makes the column agree with it. The three-value vocabulary stays —
-- see the 20260831 migration for why a fourth value is not added.
--
-- Measured before this migration: 7 deposit invoices exist, 3 jobs carry
-- nothing else and all 3 read 'Paid'.
-- =====================================================================

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
  where job_id = p_job_id
    and coalesce(invoice_type, 'standard') <> 'deposit';
$$;

-- Only rows that actually change, and updated_at left alone, for the same
-- reasons as the original backfill: this corrects a derived value, and
-- offline sync keys off that timestamp.
update public.jobs j
   set invoice_status = public.job_invoice_status(j.id)
 where j.invoice_status is distinct from public.job_invoice_status(j.id);
