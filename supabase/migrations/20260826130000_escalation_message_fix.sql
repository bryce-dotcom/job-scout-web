-- =====================================================================
-- Fix the message the escalation guard raises.
--
-- 20260826120000 blocked the escalation correctly — a User-level employee
-- attempting to set their own user_role to 'Super Admin' was rejected in
-- production. But it was rejected for the wrong reason: building the list
-- of offending columns with
--
--     changed := changed || 'user_role';
--
-- makes Postgres resolve the untyped literal against `anyarray || anyarray`
-- and fail with `malformed array literal: "user_role"`. The exception
-- aborted the UPDATE, so the guard held, but the caller saw a parser error
-- instead of an explanation, and the guard was one operator-resolution rule
-- away from not raising at all.
--
-- array_append() with an explicit ::text takes the ambiguity out.
-- =====================================================================

create or replace function public.employees_block_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_email text := nullif(current_setting('request.jwt.claims', true)::json ->> 'email', '');
  changed text[] := array[]::text[];
begin
  -- No JWT email = service role (edge functions, migrations, admin scripts).
  -- Those authorise their own callers; see _shared/auth.ts#resolveCaller.
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

  if cardinality(changed) > 0 then
    raise exception
      'Only an admin can change % on an employee record.', array_to_string(changed, ', ')
      using errcode = '42501';
  end if;

  return new;
end;
$$;

notify pgrst, 'reload schema';
