-- A commission earned in the pay period is paid in the pay period.
--
-- Bryce, 23 Oct 2026, looking at Doug's My Pay: "the ones that show he
-- earned this pay period have not been paid… my pay should show that those
-- will be paid this pay period." Until now a run paid only the commission
-- rows somebody had pressed "Add to payroll" on (queued_for_payroll), so an
-- earned commission sat out of the cheque until the office remembered it,
-- and My Pay could not promise it. From here the engine pays every row
-- earned in the period unless the office holds it back: "Remove from
-- payroll" sets held_from_payroll, and that is the only way out of the run.
-- queued_for_payroll stays as the record of what was staged.
--
-- process_payroll_run marks the rows the engine actually paid, by id, when
-- the page sends them (paid_rep_ids / paid_lead_ids); without them it falls
-- back to the staged rule, so an older build still runs.

alter table public.rep_commissions  add column if not exists held_from_payroll boolean not null default false;
alter table public.lead_commissions add column if not exists held_from_payroll boolean not null default false;
comment on column public.rep_commissions.held_from_payroll  is 'The office took this row out of the run it was earned in. Only a hold keeps an earned commission off the cheque. See 20261023230000.';
comment on column public.lead_commissions.held_from_payroll is 'The office took this row out of the run it was earned in. Only a hold keeps an earned commission off the cheque. See 20261023230000.';

create or replace function public.process_payroll_run(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_company bigint := nullif(p->>'company_id', '')::bigint;
  v_run public.payroll_runs;
  v_rerun boolean := false;
  v_pto_note text := '';
  v_paid_at timestamptz := coalesce(nullif(p->>'paid_at', '')::timestamptz, now());
  v_paid_by bigint := nullif(p->>'paid_by', '')::bigint;
  v_paid_ids bigint[];
  v_rep_ids bigint[];
  v_lead_ids bigint[];
  v_stubs int := 0; v_liab int := 0; v_bonus int := 0; v_lead int := 0; v_rep int := 0; v_pto int := 0; v_settled int := 0; v_n int;
  r jsonb;
begin
  if v_company is null then
    raise exception 'process_payroll_run: company_id missing';
  end if;
  if jsonb_typeof(p->'stubs') is distinct from 'array' or jsonb_array_length(p->'stubs') = 0 then
    raise exception 'process_payroll_run: no stubs in the payload';
  end if;

  -- 1. The run.
  insert into public.payroll_runs (company_id, period_start, period_end, pay_date, total_gross, employee_count, created_by)
  values (
    v_company,
    (p->'run'->>'period_start')::date,
    (p->'run'->>'period_end')::date,
    (p->'run'->>'pay_date')::date,
    coalesce((p->'run'->>'total_gross')::numeric, 0),
    coalesce((p->'run'->>'employee_count')::int, jsonb_array_length(p->'stubs')),
    nullif(p->'run'->>'created_by', '')::bigint
  )
  returning * into v_run;

  -- 2. The stubs, every one carrying this run.
  insert into public.paystubs (
    company_id, employee_id, payroll_run_id, period_start, period_end, pay_date,
    regular_hours, overtime_hours, pto_hours, hourly_rate, salary_amount, gross_pay,
    bonus_pay, commission_pay, reimbursement_pay, taxable_wages,
    federal_income_tax, state_income_tax, social_security_employee, social_security_employer,
    medicare_employee, medicare_employer, additional_medicare, futa, sui,
    famli_employee, famli_employer, pre_tax_deductions, post_tax_deductions, net_pay
  )
  select
    v_company, x.employee_id, v_run.id,
    coalesce(x.period_start, v_run.period_start), coalesce(x.period_end, v_run.period_end), coalesce(x.pay_date, v_run.pay_date),
    coalesce(x.regular_hours, 0), coalesce(x.overtime_hours, 0), coalesce(x.pto_hours, 0), coalesce(x.hourly_rate, 0), coalesce(x.salary_amount, 0), coalesce(x.gross_pay, 0),
    coalesce(x.bonus_pay, 0), coalesce(x.commission_pay, 0), coalesce(x.reimbursement_pay, 0), coalesce(x.taxable_wages, x.gross_pay, 0),
    coalesce(x.federal_income_tax, 0), coalesce(x.state_income_tax, 0), coalesce(x.social_security_employee, 0), coalesce(x.social_security_employer, 0),
    coalesce(x.medicare_employee, 0), coalesce(x.medicare_employer, 0), coalesce(x.additional_medicare, 0), coalesce(x.futa, 0), coalesce(x.sui, 0),
    coalesce(x.famli_employee, 0), coalesce(x.famli_employer, 0), coalesce(x.pre_tax_deductions, 0), coalesce(x.post_tax_deductions, 0), coalesce(x.net_pay, 0)
  from jsonb_to_recordset(p->'stubs') as x(
    employee_id bigint, period_start date, period_end date, pay_date date,
    regular_hours numeric, overtime_hours numeric, pto_hours numeric, hourly_rate numeric, salary_amount numeric, gross_pay numeric,
    bonus_pay numeric, commission_pay numeric, reimbursement_pay numeric, taxable_wages numeric,
    federal_income_tax numeric, state_income_tax numeric, social_security_employee numeric, social_security_employer numeric,
    medicare_employee numeric, medicare_employer numeric, additional_medicare numeric, futa numeric, sui numeric,
    famli_employee numeric, famli_employer numeric, pre_tax_deductions numeric, post_tax_deductions numeric, net_pay numeric
  );
  get diagnostics v_stubs = row_count;
  if v_stubs <> jsonb_array_length(p->'stubs') then
    raise exception 'process_payroll_run: % stubs sent, % written', jsonb_array_length(p->'stubs'), v_stubs;
  end if;

  -- 3. PTO banks: accrue and deduct once per period, never twice.
  select exists (
    select 1 from public.payroll_runs
    where company_id = v_company and period_start = v_run.period_start and period_end = v_run.period_end and id <> v_run.id
  ) into v_rerun;
  if v_rerun then
    v_pto_note := 'PTO balances were left alone: this period had already been run once, and accruing or deducting it twice would be wrong.';
  else
    update public.employees e
       set pto_accrued = m.pto_accrued, pto_used = m.pto_used
      from jsonb_to_recordset(coalesce(p->'pto_moves', '[]'::jsonb)) as m(employee_id bigint, pto_accrued numeric, pto_used numeric)
     where e.id = m.employee_id and e.company_id = v_company;
    get diagnostics v_pto = row_count;
  end if;

  -- 4. What this run paid is marked paid, by this run.
  select array_agg(x::bigint) into v_paid_ids
    from jsonb_array_elements_text(coalesce(p->'paid_employee_ids', '[]'::jsonb)) x;
  if v_paid_ids is not null then
    update public.job_bonuses
       set status = 'paid', paid_at = v_paid_at, paid_by = v_paid_by, paid_payroll_run_id = v_run.id, queued_for_payroll = false,
           paid_pay_period_start = v_run.period_start, paid_pay_period_end = v_run.period_end, updated_at = now()
     where company_id = v_company and employee_id = any(v_paid_ids)
       and status = 'accrued' and queued_for_payroll and needs_verification = false;
    get diagnostics v_bonus = row_count;
  end if;

  -- Commissions: the rows the engine paid, by id. Earned in the period and
  -- not held (20261023230000). Without the lists, the older staged rule.
  if p ? 'paid_rep_ids' then
    select array_agg(x::bigint) into v_rep_ids from jsonb_array_elements_text(coalesce(p->'paid_rep_ids', '[]'::jsonb)) x;
    if v_rep_ids is not null then
      update public.rep_commissions
         set payment_status = 'paid', paid_at = v_paid_at, queued_for_payroll = false, paid_payroll_run_id = v_run.id
       where company_id = v_company and id = any(v_rep_ids) and payment_status is distinct from 'paid';
      get diagnostics v_rep = row_count;
    end if;
  elsif v_paid_ids is not null then
    update public.rep_commissions
       set payment_status = 'paid', paid_at = v_paid_at, queued_for_payroll = false, paid_payroll_run_id = v_run.id
     where company_id = v_company and employee_id = any(v_paid_ids)
       and queued_for_payroll and payment_status is distinct from 'paid';
    get diagnostics v_rep = row_count;
  end if;

  if p ? 'paid_lead_ids' then
    select array_agg(x::bigint) into v_lead_ids from jsonb_array_elements_text(coalesce(p->'paid_lead_ids', '[]'::jsonb)) x;
    if v_lead_ids is not null then
      update public.lead_commissions
         set payment_status = 'paid', queued_for_payroll = false, paid_payroll_run_id = v_run.id
       where company_id = v_company and id = any(v_lead_ids) and payment_status is distinct from 'paid';
      get diagnostics v_lead = row_count;
    end if;
  elsif v_paid_ids is not null then
    update public.lead_commissions
       set payment_status = 'paid', queued_for_payroll = false, paid_payroll_run_id = v_run.id
     where company_id = v_company and employee_id = any(v_paid_ids)
       and queued_for_payroll and payment_status is distinct from 'paid';
    get diagnostics v_lead = row_count;
  end if;

  -- 5. Salary-or-commission: the rows weighed are settled, covered or paid.
  for r in select * from jsonb_array_elements(coalesce(p->'settle', '[]'::jsonb)) loop
    update public.rep_commissions
       set payment_status = 'paid', paid_at = v_paid_at, queued_for_payroll = false,
           covered_by_salary = coalesce((r->>'covered')::boolean, false), paid_payroll_run_id = v_run.id
     where company_id = v_company
       and id in (select x::bigint from jsonb_array_elements_text(coalesce(r->'rep', '[]'::jsonb)) x);
    get diagnostics v_n = row_count; v_settled := v_settled + v_n;
    update public.lead_commissions
       set payment_status = 'paid', queued_for_payroll = false,
           covered_by_salary = coalesce((r->>'covered')::boolean, false), paid_payroll_run_id = v_run.id
     where company_id = v_company
       and id in (select x::bigint from jsonb_array_elements_text(coalesce(r->'lead', '[]'::jsonb)) x);
    get diagnostics v_n = row_count; v_settled := v_settled + v_n;
  end loop;

  -- 6. What is owed to whom, by this run.
  insert into public.payroll_tax_liabilities (
    company_id, payroll_run_id, jurisdiction, agency, kind, period_start, period_end, due_date, amount_employee, amount_employer
  )
  select v_company, v_run.id, x.jurisdiction, x.agency, x.kind,
         coalesce(x.period_start, v_run.period_start), coalesce(x.period_end, v_run.period_end), x.due_date,
         coalesce(x.amount_employee, 0), coalesce(x.amount_employer, 0)
    from jsonb_to_recordset(coalesce(p->'liabilities', '[]'::jsonb)) as x(
      jurisdiction text, agency text, kind text, period_start date, period_end date, due_date date, amount_employee numeric, amount_employer numeric
    );
  get diagnostics v_liab = row_count;

  return jsonb_build_object(
    'run', to_jsonb(v_run),
    'rerun', v_rerun,
    'pto_note', v_pto_note,
    'counts', jsonb_build_object('stubs', v_stubs, 'liabilities', v_liab, 'bonuses', v_bonus, 'setter', v_lead, 'rep', v_rep, 'settled', v_settled, 'pto', v_pto)
  );
end $$;

comment on function public.process_payroll_run(jsonb) is
  'One payroll run, one transaction: run row, stubs, PTO banks, ledger marks (commissions by id when sent), liabilities. All of it or none of it. See 20261023200000, 20261023230000 and docs/PAYROLL_PLAN.md step 4.';
