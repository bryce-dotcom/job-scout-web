-- EMPLOYEE IDENTITY GETS ITS OWN TABLE (2026-10-15)
--
-- public.employees is read by everyone in the company: it is the roster, the
-- sign-in lookup, the assignee picker. RLS on it is company-level only, so any
-- signed-in employee could ask the REST API for every coworker's
--   ssn_last4, ssn_encrypted, date_of_birth, home_address/city/state/zip,
--   dd_account_encrypted, dd_routing_encrypted, dd_account_last4,
--   dd_account_type, w9_ein_encrypted, w9_ein_last4
-- Pages hid them; devtools did not.
--
-- Why a table and not a column REVOKE: Login, AuthCallback, App sign-in,
-- Employees and the store all `select('*')` from employees. A column revoke
-- makes `select *` fail outright ("permission denied"), i.e. breaks sign-in
-- for every tenant, and every column added later would need its own grant.
--
-- employee_identity holds those fields, one row per employee, readable and
-- writable only under public.can_see_employee_private() (the employee
-- themself, a payroll admin of their company, a platform developer). See
-- 20261015120000_employee_private_access.sql.
--
-- THIS MIGRATION COPIES, IT DOES NOT MOVE. The employees columns keep their
-- values, so every old build (a phone's PWA keeps the previous build until it
-- reloads) still works, and rollback is "deploy the old app". A mirror trigger
-- copies any identity write that still lands on employees (an old build's
-- Employees save, an edge function not yet redeployed) into employee_identity,
-- so the new table never falls behind. Nulling the old columns, which is what
-- actually closes the hole, is the follow-up data migration, after the new
-- readers are live. The columns are dropped a release after that.

create table if not exists public.employee_identity (
  employee_id          integer primary key references public.employees(id) on delete cascade,
  company_id           integer not null references public.companies(id) on delete cascade,
  ssn_last4            text,
  ssn_encrypted        bytea,
  date_of_birth        date,
  home_address         text,
  home_city            text,
  home_state           text,
  home_zip             text,
  dd_account_encrypted bytea,
  dd_routing_encrypted bytea,
  dd_account_last4     text,
  dd_account_type      text,
  w9_ein_encrypted     bytea,
  w9_ein_last4         text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists employee_identity_company_id_idx on public.employee_identity (company_id);

comment on table public.employee_identity is
  'SSN, DOB, home address, bank and EIN for one employee. Readable only by the employee, a payroll admin of their company, or a platform developer (can_see_employee_private). Never select these from employees.';

-- company_id always follows the employee, so a client cannot file a row under
-- another company, and employee_id never changes once written.
create or replace function public.employee_identity_stamp()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  co integer;
begin
  if tg_op = 'UPDATE' and new.employee_id is distinct from old.employee_id then
    raise exception 'employee_identity.employee_id cannot change' using errcode = '42501';
  end if;
  select company_id into co from public.employees where id = new.employee_id;
  if co is null then
    raise exception 'employee % not found', new.employee_id using errcode = '23503';
  end if;
  new.company_id := co;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists employee_identity_stamp on public.employee_identity;
create trigger employee_identity_stamp
  before insert or update on public.employee_identity
  for each row execute function public.employee_identity_stamp();

alter table public.employee_identity enable row level security;

revoke all on public.employee_identity from anon, public;
grant select, insert, update on public.employee_identity to authenticated;  -- no DELETE: rows go with the employee (cascade)
grant all on public.employee_identity to service_role;

drop policy if exists tenant_isolation on public.employee_identity;
create policy tenant_isolation on public.employee_identity
  for all to authenticated
  using (company_id in (select public.current_user_company_ids()))
  with check (company_id in (select public.current_user_company_ids()));

drop policy if exists employee_private_only on public.employee_identity;
create policy employee_private_only on public.employee_identity
  as restrictive for all to authenticated
  using (public.can_see_employee_private(employee_id))
  with check (public.can_see_employee_private(employee_id));

drop policy if exists require_writable_ins on public.employee_identity;
create policy require_writable_ins on public.employee_identity
  as restrictive for insert to authenticated
  with check (public.company_can_write(company_id));

drop policy if exists require_writable_upd on public.employee_identity;
create policy require_writable_upd on public.employee_identity
  as restrictive for update to authenticated
  using (public.company_can_write(company_id))
  with check (public.company_can_write(company_id));

-- Mirror: an identity write that still lands on employees is copied across,
-- column by column, only for the columns that changed, so a later write to
-- employee_identity by the new app is never overwritten by an unrelated
-- employees save. Runs as owner (RLS bypass) because the employees write it
-- follows has already passed employees' own guards (row ownership, privilege
-- escalation): it grants nothing that write did not already have.
create or replace function public.employees_mirror_identity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.company_id is null then return null; end if;

  if tg_op = 'UPDATE' and new.company_id is distinct from old.company_id then
    update public.employee_identity set company_id = new.company_id where employee_id = new.id;
  end if;

  if tg_op = 'INSERT' then
    insert into public.employee_identity (
      employee_id, company_id, ssn_last4, ssn_encrypted, date_of_birth, home_address, home_city, home_state,
      home_zip, dd_account_encrypted, dd_routing_encrypted, dd_account_last4, dd_account_type,
      w9_ein_encrypted, w9_ein_last4)
    values (
      new.id, new.company_id, new.ssn_last4, new.ssn_encrypted, new.date_of_birth, new.home_address, new.home_city,
      new.home_state, new.home_zip, new.dd_account_encrypted, new.dd_routing_encrypted, new.dd_account_last4,
      new.dd_account_type, new.w9_ein_encrypted, new.w9_ein_last4)
    on conflict (employee_id) do nothing;
    return null;
  end if;

  if (new.ssn_last4, new.ssn_encrypted, new.date_of_birth, new.home_address, new.home_city, new.home_state,
      new.home_zip, new.dd_account_encrypted, new.dd_routing_encrypted, new.dd_account_last4, new.dd_account_type,
      new.w9_ein_encrypted, new.w9_ein_last4)
     is not distinct from
     (old.ssn_last4, old.ssn_encrypted, old.date_of_birth, old.home_address, old.home_city, old.home_state,
      old.home_zip, old.dd_account_encrypted, old.dd_routing_encrypted, old.dd_account_last4, old.dd_account_type,
      old.w9_ein_encrypted, old.w9_ein_last4) then
    return null;
  end if;

  insert into public.employee_identity (employee_id, company_id)
  values (new.id, new.company_id)
  on conflict (employee_id) do nothing;

  update public.employee_identity ei set
    ssn_last4            = case when new.ssn_last4            is distinct from old.ssn_last4            then new.ssn_last4            else ei.ssn_last4            end,
    ssn_encrypted        = case when new.ssn_encrypted        is distinct from old.ssn_encrypted        then new.ssn_encrypted        else ei.ssn_encrypted        end,
    date_of_birth        = case when new.date_of_birth        is distinct from old.date_of_birth        then new.date_of_birth        else ei.date_of_birth        end,
    home_address         = case when new.home_address         is distinct from old.home_address         then new.home_address         else ei.home_address         end,
    home_city            = case when new.home_city            is distinct from old.home_city            then new.home_city            else ei.home_city            end,
    home_state           = case when new.home_state           is distinct from old.home_state           then new.home_state           else ei.home_state           end,
    home_zip             = case when new.home_zip             is distinct from old.home_zip             then new.home_zip             else ei.home_zip             end,
    dd_account_encrypted = case when new.dd_account_encrypted is distinct from old.dd_account_encrypted then new.dd_account_encrypted else ei.dd_account_encrypted end,
    dd_routing_encrypted = case when new.dd_routing_encrypted is distinct from old.dd_routing_encrypted then new.dd_routing_encrypted else ei.dd_routing_encrypted end,
    dd_account_last4     = case when new.dd_account_last4     is distinct from old.dd_account_last4     then new.dd_account_last4     else ei.dd_account_last4     end,
    dd_account_type      = case when new.dd_account_type      is distinct from old.dd_account_type      then new.dd_account_type      else ei.dd_account_type      end,
    w9_ein_encrypted     = case when new.w9_ein_encrypted     is distinct from old.w9_ein_encrypted     then new.w9_ein_encrypted     else ei.w9_ein_encrypted     end,
    w9_ein_last4         = case when new.w9_ein_last4         is distinct from old.w9_ein_last4         then new.w9_ein_last4         else ei.w9_ein_last4         end
  where ei.employee_id = new.id;
  return null;
end;
$$;

drop trigger if exists employees_mirror_identity on public.employees;
create trigger employees_mirror_identity
  after insert or update on public.employees
  for each row execute function public.employees_mirror_identity();

-- Backfill: one row per employee, a straight copy. Nothing on employees changes.
insert into public.employee_identity (
  employee_id, company_id, ssn_last4, ssn_encrypted, date_of_birth, home_address, home_city, home_state,
  home_zip, dd_account_encrypted, dd_routing_encrypted, dd_account_last4, dd_account_type,
  w9_ein_encrypted, w9_ein_last4)
select
  id, company_id, ssn_last4, ssn_encrypted, date_of_birth, home_address, home_city, home_state,
  home_zip, dd_account_encrypted, dd_routing_encrypted, dd_account_last4, dd_account_type,
  w9_ein_encrypted, w9_ein_last4
from public.employees
where company_id is not null
on conflict (employee_id) do nothing;

-- The decrypt RPCs read the new table. Access rule unchanged.
create or replace function public.decrypt_ssn_for_payroll_admin(p_employee_id integer)
 returns text
 language plpgsql
 security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
DECLARE
  k text := public.get_payroll_secret();
  caller_email text := lower(coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'email',''));
  emp_co integer;
  is_admin boolean := false;
  enc bytea;
BEGIN
  IF k IS NULL THEN RAISE EXCEPTION 'payroll secret is not configured.'; END IF;

  SELECT company_id INTO emp_co FROM public.employees WHERE id = p_employee_id;
  IF emp_co IS NULL THEN RAISE EXCEPTION 'employee not found'; END IF;

  SELECT (has_hr_access OR is_developer OR coalesce(user_role,'') IN ('Admin','Owner','Super Admin'))
    INTO is_admin
    FROM public.employees
   WHERE company_id = emp_co
     AND lower(email) = caller_email
     AND active = true
   LIMIT 1;

  IF NOT is_admin THEN
    RAISE EXCEPTION 'caller is not a payroll admin for this company';
  END IF;

  SELECT ssn_encrypted INTO enc FROM public.employee_identity WHERE employee_id = p_employee_id;
  IF enc IS NULL THEN RETURN NULL; END IF;
  RETURN pgp_sym_decrypt(enc, k);
END;
$function$;

create or replace function public.decrypt_ein_for_payroll_admin(p_employee_id integer)
 returns text
 language plpgsql
 security definer
 set search_path to 'public', 'extensions', 'pg_temp'
as $function$
DECLARE
  k text := public.get_payroll_secret();
  caller_email text := lower(coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'email',''));
  emp_co integer;
  is_admin boolean := false;
  enc bytea;
BEGIN
  IF k IS NULL THEN RAISE EXCEPTION 'payroll secret is not configured.'; END IF;
  SELECT company_id INTO emp_co FROM public.employees WHERE id = p_employee_id;
  IF emp_co IS NULL THEN RAISE EXCEPTION 'employee not found'; END IF;
  SELECT (has_hr_access OR is_developer OR coalesce(user_role,'') IN ('Admin','Owner','Super Admin'))
    INTO is_admin
    FROM public.employees
   WHERE company_id = emp_co
     AND lower(email) = caller_email
     AND active = true
   LIMIT 1;
  IF NOT is_admin THEN RAISE EXCEPTION 'caller is not a payroll admin for this company'; END IF;
  SELECT w9_ein_encrypted INTO enc FROM public.employee_identity WHERE employee_id = p_employee_id;
  IF enc IS NULL THEN RETURN NULL; END IF;
  RETURN pgp_sym_decrypt(enc, k);
END;
$function$;
