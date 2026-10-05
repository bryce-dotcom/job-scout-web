-- Pay type: salary or commission, whichever is more.
--
-- Bryce, 5 Oct 2026: "we need a new option that is Salary or Commission
-- whichever is more. So like doug should be salary or commission and
-- Christopher should be the same... and a way to manage that in payroll...
-- when the salary is bigger than the commissions then the payroll should
-- indicate and indicate that these commissions were paid."
--
-- Until now the pay types added up: a salaried rep with commission was paid
-- both. This is the other arrangement every sales shop runs — the salary is a
-- floor the commission has to beat, not a base it sits on top of. The period's
-- commission either beats the salary and gets paid, or it does not and the
-- salary covers it. Either way the commission rows are settled, which is why
-- they need somewhere to record WHICH of the two settled them: a row marked
-- paid with no further explanation is how someone concludes they were paid
-- twice, or not at all.

alter table public.employees
  add column if not exists pay_greater_of_salary_commission boolean not null default false;

comment on column public.employees.pay_greater_of_salary_commission is
  'Pay the greater of the period salary and the period commission, not both. Implies is_salary and is_commission. lib/payBasis is the rule.';

-- Settled by the salary rather than paid as commission. The row still goes to
-- payment_status = paid on the run (the earning is closed either way), so this
-- is the difference between "we sent you this" and "your salary already
-- covered this".
alter table public.rep_commissions
  add column if not exists covered_by_salary boolean not null default false;

alter table public.lead_commissions
  add column if not exists covered_by_salary boolean not null default false;

comment on column public.rep_commissions.covered_by_salary is
  'Closed by a salary that beat the period commission (employees.pay_greater_of_salary_commission), not paid out on top of it.';

comment on column public.lead_commissions.covered_by_salary is
  'Closed by a salary that beat the period commission (employees.pay_greater_of_salary_commission), not paid out on top of it.';

-- The new pay flag decides what somebody is paid, so it belongs with the other
-- money columns in the escalation guard — otherwise anyone below Admin could
-- turn their own salary floor off and collect both. Re-created whole from the
-- live definition (which already carries commission_min_job_total).
create or replace function public.employees_block_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  jwt_email text := nullif(current_setting('request.jwt.claims', true)::json ->> 'email', '');
  changed text[] := '{}';
begin
  -- No JWT email = service role (edge functions, migrations, admin scripts).
  -- Those already authorise their own callers; see _shared/auth.ts.
  if jwt_email is null then
    return new;
  end if;

  -- Admin and above manage people. That is the job.
  if public.current_user_access_level() >= 3 then
    return new;
  end if;

  -- Access-granting columns.
  if new.user_role     is distinct from old.user_role     then changed := array_append(changed, 'user_role'::text); end if;
  if new.is_admin      is distinct from old.is_admin      then changed := array_append(changed, 'is_admin'::text); end if;
  if new.is_developer  is distinct from old.is_developer  then changed := array_append(changed, 'is_developer'::text); end if;
  if new.has_hr_access is distinct from old.has_hr_access then changed := array_append(changed, 'has_hr_access'::text); end if;
  if new.active        is distinct from old.active        then changed := array_append(changed, 'active'::text); end if;

  -- Money.
  if new.hourly_rate   is distinct from old.hourly_rate   then changed := array_append(changed, 'hourly_rate'::text); end if;
  if new.salary        is distinct from old.salary        then changed := array_append(changed, 'salary'::text); end if;
  if new.annual_salary is distinct from old.annual_salary then changed := array_append(changed, 'annual_salary'::text); end if;
  if new.pay_type      is distinct from old.pay_type      then changed := array_append(changed, 'pay_type'::text); end if;
  if new.is_hourly     is distinct from old.is_hourly     then changed := array_append(changed, 'is_hourly'::text); end if;
  if new.is_salary     is distinct from old.is_salary     then changed := array_append(changed, 'is_salary'::text); end if;
  if new.is_commission is distinct from old.is_commission then changed := array_append(changed, 'is_commission'::text); end if;
  if new.commission_goods_rate     is distinct from old.commission_goods_rate     then changed := array_append(changed, 'commission_goods_rate'::text); end if;
  if new.commission_services_rate  is distinct from old.commission_services_rate  then changed := array_append(changed, 'commission_services_rate'::text); end if;
  if new.commission_software_rate  is distinct from old.commission_software_rate  then changed := array_append(changed, 'commission_software_rate'::text); end if;
  if new.commission_leads_rate     is distinct from old.commission_leads_rate     then changed := array_append(changed, 'commission_leads_rate'::text); end if;
  if new.commission_setter_rate    is distinct from old.commission_setter_rate    then changed := array_append(changed, 'commission_setter_rate'::text); end if;
  if new.commission_processor_rate is distinct from old.commission_processor_rate then changed := array_append(changed, 'commission_processor_rate'::text); end if;
  if new.commission_min_job_total  is distinct from old.commission_min_job_total  then changed := array_append(changed, 'commission_min_job_total'::text); end if;
  if new.pay_greater_of_salary_commission is distinct from old.pay_greater_of_salary_commission
    then changed := array_append(changed, 'pay_greater_of_salary_commission'::text); end if;

  if cardinality(changed) > 0 then
    raise exception
      'Only an admin can change % on an employee record.', array_to_string(changed, ', ')
      using errcode = '42501';
  end if;

  return new;
end;
$function$;
