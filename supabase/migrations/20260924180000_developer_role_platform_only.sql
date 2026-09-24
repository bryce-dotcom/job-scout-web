-- =====================================================================
-- Developer is a PLATFORM role, not a tenant role.
--
-- WHAT WAS WRONG
--
-- 'Developer' (user_role) and is_developer both grade as access level 5:
-- the Data Console, SQL Runner, every company's rows through
-- current_user_company_ids(), and — since 20260924150000 — writes to the
-- shared utility tables. Nothing tied that level to WHO may hold it. The
-- Employees page offered 'Developer' in every tenant's role picker, and the
-- escalation guard (20260826120000) let any Admin set it. Found on
-- 2026-09-24: an employee of company 9 carried user_role = 'Developer' and
-- so could open the platform's Data Console from another tenant.
--
-- WHAT THIS DOES
--
--   1. companies.is_platform — which company IS JobScout (HHH). The row
--      that holds the platform's own staff. Data, not a hard-coded id.
--   2. Developer, by either column, may only exist on an employee of the
--      platform company, and may only be granted or revoked by a platform
--      developer (or the service role, i.e. an admin script). Enforced in
--      the same trigger that guards the other privilege columns — one rule,
--      one place — and now on INSERT as well as UPDATE, so it cannot be
--      bypassed by creating the employee already promoted.
--   3. Any Developer outside the platform company is downgraded to
--      Super Admin: the top TENANT role, so they lose nothing inside their
--      own company.
--
-- The access ladder itself (current_user_access_level, accessControl.js,
-- _shared/auth.ts) is untouched: a Developer still grades 5. The rule here
-- is who may BECOME one.
--
-- Reversible: DROP TRIGGER employees_no_privilege_escalation_insert ON
-- employees, and re-run 20260826130000 for the update-only function.
-- =====================================================================

alter table public.companies
  add column if not exists is_platform boolean not null default false;

comment on column public.companies.is_platform is
  'True for the one company that IS the platform (JobScout / HHH). Only its employees may hold the Developer role; see employees_block_privilege_escalation().';

-- HHH is company 3 in production. Match by id, then by company_name as a
-- fallback for a database seeded differently; never more than one.
update public.companies set is_platform = true where id = 3;
update public.companies set is_platform = true
 where id = (
   select c.id from public.companies c
    where not exists (select 1 from public.companies p where p.is_platform)
      and lower(c.company_name) like 'hhh%'
    order by c.id limit 1
 );

create or replace function public.is_platform_company(cid integer)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select c.is_platform from public.companies c where c.id = cid), false);
$$;
revoke all on function public.is_platform_company(integer) from public;
grant execute on function public.is_platform_company(integer) to authenticated;

-- ---------------------------------------------------------------------
-- The guard. Body identical to 20260826130000 below the developer block.
-- ---------------------------------------------------------------------
create or replace function public.employees_block_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_email text := nullif(current_setting('request.jwt.claims', true)::json ->> 'email', '');
  changed text[] := array[]::text[];
  wants_developer boolean := (new.is_developer is true) or (new.user_role = 'Developer');
  had_developer boolean := tg_op = 'UPDATE' and ((old.is_developer is true) or (old.user_role = 'Developer'));
begin
  -- Developer is a platform role. Checked before every exemption below,
  -- including the service role, because no legitimate path grants it to a
  -- tenant's employee.
  if wants_developer and not public.is_platform_company(new.company_id) then
    raise exception
      'Developer is a platform role: only employees of the platform company can hold it.'
      using errcode = '42501';
  end if;

  -- Granting or revoking it is a platform developer's call (or an admin
  -- script's, which carries no JWT email).
  if jwt_email is not null and (wants_developer <> had_developer) and not public.is_platform_developer() then
    raise exception
      'Only a platform developer can grant or revoke the Developer role.'
      using errcode = '42501';
  end if;

  -- No JWT email = service role (edge functions, migrations, admin scripts).
  -- Those authorise their own callers; see _shared/auth.ts#resolveCaller.
  if jwt_email is null then
    return new;
  end if;

  -- Nothing below compares against a previous row.
  if tg_op = 'INSERT' then
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

comment on function public.employees_block_privilege_escalation() is
  'Rejects changes to access-granting and pay columns on employees unless the caller is Admin or above; Developer (user_role or is_developer) is allowed only on the platform company and only granted by a platform developer. Service-role callers (no JWT email) are exempt from the admin check, not from the platform-company check.';

drop trigger if exists employees_no_privilege_escalation on public.employees;
create trigger employees_no_privilege_escalation
  before update on public.employees
  for each row
  execute function public.employees_block_privilege_escalation();

drop trigger if exists employees_no_privilege_escalation_insert on public.employees;
create trigger employees_no_privilege_escalation_insert
  before insert on public.employees
  for each row
  execute function public.employees_block_privilege_escalation();

-- ---------------------------------------------------------------------
-- Existing Developers outside the platform company become Super Admin —
-- the top tenant role — so they keep everything inside their own company.
-- (One row on 2026-09-24: company 9.) Runs as the migration role, so the
-- trigger's platform-developer check is not in the way; the platform-company
-- check passes because the row no longer wants Developer.
-- ---------------------------------------------------------------------
update public.employees e
   set user_role = 'Super Admin',
       is_developer = false
 where (e.is_developer is true or e.user_role = 'Developer')
   and not public.is_platform_company(e.company_id);

notify pgrst, 'reload schema';
