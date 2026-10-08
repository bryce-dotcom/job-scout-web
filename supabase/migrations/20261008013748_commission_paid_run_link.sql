-- Which payroll run paid this commission.
--
-- Bryce, 7 Oct 2026: "I cant see history in payroll... which i should be able
-- to (pay stubs) but also what jobs hes has been paid for."
--
-- A paid commission row records paid_at and nothing else, so "which jobs were
-- in this paycheck" had to be answered by matching dates — and HHH has two
-- runs sharing a pay date (runs 7 and 9, both 20 Aug 2026), which would merge
-- two checks into one list. The run id is the honest link.
--
-- Nullable, because every row paid before today has only its date. The
-- resolver (lib/payHistory) prefers this and falls back to the pay date.

alter table public.rep_commissions
  add column if not exists paid_payroll_run_id bigint references public.payroll_runs(id) on delete set null;

alter table public.lead_commissions
  add column if not exists paid_payroll_run_id bigint references public.payroll_runs(id) on delete set null;

comment on column public.rep_commissions.paid_payroll_run_id is
  'The payroll run that paid this commission. Null on rows paid before Oct 2026 — lib/payHistory falls back to matching the run pay date.';

create index if not exists rep_commissions_paid_run_idx
  on public.rep_commissions (paid_payroll_run_id) where paid_payroll_run_id is not null;

create index if not exists lead_commissions_paid_run_idx
  on public.lead_commissions (paid_payroll_run_id) where paid_payroll_run_id is not null;
