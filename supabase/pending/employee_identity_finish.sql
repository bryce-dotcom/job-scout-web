-- EMPLOYEE IDENTITY, STEP 2: EMPTY THE LEGACY COLUMNS (held back for Bryce's OK)
--
-- NOT in supabase/migrations on purpose: `db push` from any worktree would run
-- it. Move it there (with a fresh timestamp) only after Bryce approves, and
-- only once the app + edge functions that read employee_identity are LIVE.
--
-- Before: 20261015120000_employee_private_access.sql (rule, RLS on onboarding
-- tables, audit strip) and 20261015121000_employee_identity.sql (table, copy,
-- mirror trigger). Rollback: employee_identity_rollback.sql.
--
-- What it does, in one transaction:
--   1. refuses to run unless every employee has an identity row;
--   2. turns the mirror into a REDIRECT: an identity value written to
--      employees (an old cached build, a forgotten writer) is moved into
--      employee_identity and the employees column is left NULL. A user outside
--      can_see_employee_private gets 42501 instead of a silent drop;
--   3. NULLs the 13 legacy columns on employees: this is what closes the hole;
--   4. scrubs those keys out of every past employees row in audit_log
--      (773 rows on 2026-10-15, readable by the whole tenant);
--   5. redacts the plain-text SSN / EIN / bank numbers kept in completed
--      onboarding packets' draft_data (finalize now does this itself).
-- The columns themselves are dropped one release later.

begin;

do $$
declare missing int;
begin
  select count(*) into missing
    from public.employees e
   where e.company_id is not null
     and not exists (select 1 from public.employee_identity i where i.employee_id = e.id);
  if missing > 0 then
    raise exception 'employee_identity is missing % employee(s); re-run the backfill first', missing;
  end if;
end $$;

-- 2. Redirect.
drop trigger if exists employees_mirror_identity on public.employees;

create or replace function public.employees_redirect_identity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  jwt_email text := nullif(current_setting('request.jwt.claims', true)::json ->> 'email', '');
begin
  if num_nonnulls(new.ssn_last4, new.ssn_encrypted, new.date_of_birth, new.home_address, new.home_city,
                  new.home_state, new.home_zip, new.dd_account_encrypted, new.dd_routing_encrypted,
                  new.dd_account_last4, new.dd_account_type, new.w9_ein_encrypted, new.w9_ein_last4) = 0 then
    if tg_op = 'INSERT' and new.company_id is not null then
      insert into public.employee_identity (employee_id, company_id) values (new.id, new.company_id)
      on conflict (employee_id) do nothing;
    end if;
    return null;
  end if;

  if jwt_email is not null and not public.can_see_employee_private(new.id) then
    raise exception 'Only the employee or a payroll admin can change SSN, date of birth, home address or bank details.'
      using errcode = '42501';
  end if;

  insert into public.employee_identity (employee_id, company_id) values (new.id, new.company_id)
  on conflict (employee_id) do nothing;

  update public.employee_identity ei set
    ssn_last4            = coalesce(new.ssn_last4,            ei.ssn_last4),
    ssn_encrypted        = coalesce(new.ssn_encrypted,        ei.ssn_encrypted),
    date_of_birth        = coalesce(new.date_of_birth,        ei.date_of_birth),
    home_address         = coalesce(new.home_address,         ei.home_address),
    home_city            = coalesce(new.home_city,            ei.home_city),
    home_state           = coalesce(new.home_state,           ei.home_state),
    home_zip             = coalesce(new.home_zip,             ei.home_zip),
    dd_account_encrypted = coalesce(new.dd_account_encrypted, ei.dd_account_encrypted),
    dd_routing_encrypted = coalesce(new.dd_routing_encrypted, ei.dd_routing_encrypted),
    dd_account_last4     = coalesce(new.dd_account_last4,     ei.dd_account_last4),
    dd_account_type      = coalesce(new.dd_account_type,      ei.dd_account_type),
    w9_ein_encrypted     = coalesce(new.w9_ein_encrypted,     ei.w9_ein_encrypted),
    w9_ein_last4         = coalesce(new.w9_ein_last4,         ei.w9_ein_last4)
  where ei.employee_id = new.id;

  -- AFTER trigger: empty the columns on the stored row. This UPDATE carries
  -- only NULLs, so it re-enters this function and returns at the top.
  update public.employees set
    ssn_last4 = null, ssn_encrypted = null, date_of_birth = null, home_address = null, home_city = null,
    home_state = null, home_zip = null, dd_account_encrypted = null, dd_routing_encrypted = null,
    dd_account_last4 = null, dd_account_type = null, w9_ein_encrypted = null, w9_ein_last4 = null
  where id = new.id;
  return null;
end;
$$;

drop trigger if exists employees_redirect_identity on public.employees;
create trigger employees_redirect_identity
  after insert or update on public.employees
  for each row execute function public.employees_redirect_identity();

-- 3. Empty the legacy columns. (No JWT here, so the guards pass; the audit
-- trigger already strips these keys; the redirect sees only NULLs.)
update public.employees set
  ssn_last4 = null, ssn_encrypted = null, date_of_birth = null, home_address = null, home_city = null,
  home_state = null, home_zip = null, dd_account_encrypted = null, dd_routing_encrypted = null,
  dd_account_last4 = null, dd_account_type = null, w9_ein_encrypted = null, w9_ein_last4 = null
where num_nonnulls(ssn_last4, ssn_encrypted, date_of_birth, home_address, home_city, home_state, home_zip,
                   dd_account_encrypted, dd_routing_encrypted, dd_account_last4, dd_account_type,
                   w9_ein_encrypted, w9_ein_last4) > 0;

-- 4. Scrub audit history.
update public.audit_log set
  old_values = old_values - array['ssn_last4','ssn_encrypted','date_of_birth','home_address','home_city','home_state','home_zip','dd_account_encrypted','dd_routing_encrypted','dd_account_last4','dd_account_type','w9_ein_encrypted','w9_ein_last4'],
  new_values = new_values - array['ssn_last4','ssn_encrypted','date_of_birth','home_address','home_city','home_state','home_zip','dd_account_encrypted','dd_routing_encrypted','dd_account_last4','dd_account_type','w9_ein_encrypted','w9_ein_last4'],
  old_data   = old_data   - array['ssn_last4','ssn_encrypted','date_of_birth','home_address','home_city','home_state','home_zip','dd_account_encrypted','dd_routing_encrypted','dd_account_last4','dd_account_type','w9_ein_encrypted','w9_ein_last4'],
  new_data   = new_data   - array['ssn_last4','ssn_encrypted','date_of_birth','home_address','home_city','home_state','home_zip','dd_account_encrypted','dd_routing_encrypted','dd_account_last4','dd_account_type','w9_ein_encrypted','w9_ein_last4']
where table_name = 'employees';

-- 5. Redact plain-text secrets in COMPLETED onboarding packets (same shape as
-- employee-onboarding's redactDraftSecrets). In-progress packets keep theirs
-- until finalize encrypts them.
update public.employee_onboarding_packets p set draft_data =
  p.draft_data
  || case when jsonb_typeof(p.draft_data->'ssn') = 'object'
          then jsonb_build_object('ssn', jsonb_build_object('last4', nullif(right(regexp_replace(coalesce(p.draft_data->'ssn'->>'value',''), '\D', '', 'g'), 4), ''), 'redacted', true))
          else '{}'::jsonb end
  || case when jsonb_typeof(p.draft_data->'ein') = 'object'
          then jsonb_build_object('ein', jsonb_build_object('last4', nullif(right(regexp_replace(coalesce(p.draft_data->'ein'->>'value',''), '\D', '', 'g'), 4), ''), 'redacted', true))
          else '{}'::jsonb end
  || case when jsonb_typeof(p.draft_data->'direct_deposit') = 'object'
          then jsonb_build_object('direct_deposit',
                 ((p.draft_data->'direct_deposit') - array['routing_number','account_number','confirm_account'])
                 || jsonb_build_object('account_last4', nullif(right(regexp_replace(coalesce(p.draft_data->'direct_deposit'->>'account_number',''), '\D', '', 'g'), 4), ''), 'redacted', true))
          else '{}'::jsonb end
where p.status = 'completed'
  and p.draft_data is not null
  and (coalesce(p.draft_data->'ssn'->>'value','') <> ''
       or coalesce(p.draft_data->'ein'->>'value','') <> ''
       or coalesce(p.draft_data->'direct_deposit'->>'account_number','') <> ''
       or coalesce(p.draft_data->'direct_deposit'->>'routing_number','') <> '');

commit;
