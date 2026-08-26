-- =====================================================================
-- Intra-tenant authorization — stage 1: stop privilege escalation.
--
-- WHAT WAS WRONG
--
-- Every tenant table carries the same policy shape:
--
--     CREATE POLICY tenant_isolation ON <table>
--       FOR ALL TO authenticated
--       USING (belongs_to_company(company_id))
--       WITH CHECK (belongs_to_company(company_id));
--
-- That was written to close a cross-tenant hole and it does exactly that:
-- company A still cannot see or touch company B. But `FOR ALL` scoped only
-- by company membership means that INSIDE a tenant every authenticated
-- employee has full write access to every row. Across 93 policy-defining
-- migrations, not one restricts by role — the role model lives entirely in
-- the client (src/lib/accessControl.js), and the database enforces none of
-- it.
--
-- Measured on production as a real User-level field tech, every one of
-- these was permitted:
--
--     own row: user_role      -> ALLOWED   (self-promote to Super Admin)
--     own row: hourly_rate    -> ALLOWED   (give yourself a raise)
--     another employee's row  -> ALLOWED
--
-- user_role is what src/lib/accessControl.js and the edge functions'
-- resolveCaller() both read, so setting it to 'Super Admin' grants
-- owner-level access to the app AND to Arnie's owner-only tools — revenue,
-- payroll, the lot. One line in a browser console.
--
-- WHAT THIS DOES, AND DELIBERATELY DOES NOT DO
--
-- This is surgical on purpose. It does NOT restrict which ROWS a non-admin
-- may update, because that needs checking against real UI flows (does a
-- Team Lead legitimately edit a colleague's record on the Employees page?)
-- and getting it wrong fails SILENTLY in this app: `const { data } = await
-- ...` swallows a denied write into an empty array, so the screen shows
-- nothing wrong. That is how every Payroll commission once became $0.
--
-- It restricts only the COLUMNS that confer privilege or money, and only
-- for callers below Admin. No legitimate flow needs a non-admin to change
-- somebody's role or pay rate, so this can be enforced without knowing
-- every page that touches the table.
--
-- Service-role callers (every edge function) are unaffected: they carry no
-- JWT email claim and return early.
--
-- Reversible: DROP TRIGGER employees_no_privilege_escalation ON employees.
-- =====================================================================

-- ---------------------------------------------------------------------
-- The access ladder, in SQL. Mirrors src/lib/accessControl.js and
-- supabase/functions/_shared/auth.ts. This is now the THIRD place that
-- rule is written, which this codebase has been bitten by before — so the
-- test suite pins all three together (see src/lib/accessLadder.test.js).
-- ---------------------------------------------------------------------
create or replace function public.current_user_access_level()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(max(
    case
      when e.is_developer then 5
      when e.user_role = 'Developer' then 5
      when e.user_role in ('Super Admin', 'Owner') then 4
      when e.user_role = 'Admin' then 3
      when e.is_admin then 3
      when e.user_role = 'Manager' then 2
      when e.user_role = 'Team Lead' then 1
      when e.user_role = 'User' then 0
      -- Anything unrecognised grades as 0. A role this function has never
      -- heard of must not inherit privilege by accident; 'User' is spelled
      -- out anyway so all three copies of the ladder list the same roles.
      else 0
    end), 0)
  from public.employees e
  where e.active = true
    and lower(e.email) = lower(nullif(
      current_setting('request.jwt.claims', true)::json ->> 'email', ''));
$$;

comment on function public.current_user_access_level() is
  'Numeric access level of the calling user (0 User .. 5 Developer), read from their active employee row by JWT email. Mirrors src/lib/accessControl.js#getAccessLevel and _shared/auth.ts#accessLevel — keep all three in step.';

-- ---------------------------------------------------------------------
-- Columns a non-admin must never change, on anybody's row including their
-- own. Two groups: the ones that grant access, and the ones that pay you.
-- ---------------------------------------------------------------------
create or replace function public.employees_block_privilege_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
  if new.user_role     is distinct from old.user_role     then changed := changed || 'user_role'; end if;
  if new.is_admin      is distinct from old.is_admin      then changed := changed || 'is_admin'; end if;
  if new.is_developer  is distinct from old.is_developer  then changed := changed || 'is_developer'; end if;
  if new.has_hr_access is distinct from old.has_hr_access then changed := changed || 'has_hr_access'; end if;
  if new.active        is distinct from old.active        then changed := changed || 'active'; end if;

  -- Money.
  if new.hourly_rate   is distinct from old.hourly_rate   then changed := changed || 'hourly_rate'; end if;
  if new.salary        is distinct from old.salary        then changed := changed || 'salary'; end if;
  if new.annual_salary is distinct from old.annual_salary then changed := changed || 'annual_salary'; end if;
  if new.pay_type      is distinct from old.pay_type      then changed := changed || 'pay_type'; end if;
  if new.is_hourly     is distinct from old.is_hourly     then changed := changed || 'is_hourly'; end if;
  if new.is_salary     is distinct from old.is_salary     then changed := changed || 'is_salary'; end if;
  if new.is_commission is distinct from old.is_commission then changed := changed || 'is_commission'; end if;
  if new.commission_goods_rate     is distinct from old.commission_goods_rate     then changed := changed || 'commission_goods_rate'; end if;
  if new.commission_services_rate  is distinct from old.commission_services_rate  then changed := changed || 'commission_services_rate'; end if;
  if new.commission_software_rate  is distinct from old.commission_software_rate  then changed := changed || 'commission_software_rate'; end if;
  if new.commission_leads_rate     is distinct from old.commission_leads_rate     then changed := changed || 'commission_leads_rate'; end if;
  if new.commission_setter_rate    is distinct from old.commission_setter_rate    then changed := changed || 'commission_setter_rate'; end if;
  if new.commission_processor_rate is distinct from old.commission_processor_rate then changed := changed || 'commission_processor_rate'; end if;

  if array_length(changed, 1) is not null then
    raise exception
      'Only an admin can change % on an employee record.', array_to_string(changed, ', ')
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.employees_block_privilege_escalation() is
  'Rejects changes to access-granting and pay columns on employees unless the caller is Admin or above. Service-role callers (no JWT email) are exempt.';

drop trigger if exists employees_no_privilege_escalation on public.employees;
create trigger employees_no_privilege_escalation
  before update on public.employees
  for each row
  execute function public.employees_block_privilege_escalation();

notify pgrst, 'reload schema';
