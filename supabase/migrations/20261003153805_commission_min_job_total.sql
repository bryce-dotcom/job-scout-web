-- A commission that only applies to jobs over a certain size.
--
-- Christopher Lyman is HHH's project manager on the cleaning side: salaried,
-- off the efficiency bonus, and paid "5% on jobs over 10k" (Bryce, 3 Oct
-- 2026). Every rate in this table is a flat percentage of whatever the rep
-- owns, so there was nowhere to say "over 10k" — and with a 6% rate on an
-- import that stamped him as salesperson on 5,961 of HHH's 7,150 jobs, he was
-- accruing commission on $40 window cleans.
--
-- null / 0 = no minimum, which is every existing employee, so nothing moves
-- until someone sets a number.

alter table public.employees
  add column if not exists commission_min_job_total numeric;

comment on column public.employees.commission_min_job_total is
  'Smallest job total that earns this employee commission. Null or 0 = every job, which is the default. Read by lib/commissionEligibility, which both the live calc and the rep_commissions ledger go through.';

-- The guard has to know about it too. Without this line a Manager could set
-- their own minimum to 0 and start earning on everything — the same hole the
-- trigger was written to close for the other pay columns (migration
-- 20260826120000). Re-created whole, from the live definition, with
-- commission_min_job_total added to the money block.
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

  if cardinality(changed) > 0 then
    raise exception
      'Only an admin can change % on an employee record.', array_to_string(changed, ', ')
      using errcode = '42501';
  end if;

  return new;
end;
$function$;
