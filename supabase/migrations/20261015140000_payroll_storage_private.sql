-- Payroll files in project-documents are private.
--
-- The bucket is private, but its policies (project_docs_select/insert/delete
-- and the authenticated_* set) only check bucket_id = 'project-documents', and
-- three of them are granted to `public` — so the anon key alone could list and
-- download W-2s (full SSN), onboarding packets (W-4, I-9, direct deposit) and
-- paystubs, and any signed-in user of any company could too.
--
-- This adds RESTRICTIVE policies that apply only to the three payroll prefixes
-- and leave every other prefix exactly as it was (the customer portal and the
-- onboarding portal read jobs/, estimates/, handbooks/, ica/ ... with the anon
-- key, so the open policies themselves stay):
--
--   tax-filings/<company>/<year>/<file>      written by render-tax-forms
--   onboarding/<company>/<employee>/<file>   written by render-onboarding-pdfs
--   paystubs/<company>/<run>/<stub>.pdf      written by lib/paystubDelivery
--
-- Read:  a payroll admin of <company>, or the employee the file is about
--        (onboarding: the path's <employee>; tax-filings / paystubs: the
--        payroll_tax_filings / paystubs row that points at this exact path).
-- Write: a payroll admin of <company> only.
-- Edge functions use the service role, which bypasses RLS.
--
-- "Payroll admin" is the can_see_employee_private rule: is_developer, or an
-- active employee of that company with has_hr_access / is_admin / user_role
-- Admin, Owner, Super Admin or Developer. Identity is the JWT email, as there.

create or replace function public.is_payroll_admin_of(p_company_id integer)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select exists (
      select 1
        from public.employees c
       where c.active = true
         and lower(c.email) = me.email
         and (   c.is_developer = true
              or (c.company_id = p_company_id
                  and (   c.has_hr_access = true
                       or c.is_admin = true
                       or coalesce(c.user_role, '') in ('Admin', 'Owner', 'Super Admin', 'Developer'))))
    )
    from (select lower(nullif(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'email', '')) as email) me
    where me.email is not null
  ), false);
$$;

-- p_name is storage.objects.name inside project-documents.
create or replace function public.can_access_payroll_file(p_name text, p_write boolean)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  kind   text := split_part(coalesce(p_name, ''), '/', 1);
  seg2   text := split_part(coalesce(p_name, ''), '/', 2);
  seg3   text := split_part(coalesce(p_name, ''), '/', 3);
  co     integer;
  me     text := lower(nullif(nullif(current_setting('request.jwt.claims', true), '')::json ->> 'email', ''));
begin
  if kind not in ('tax-filings', 'onboarding', 'paystubs') then
    return true;            -- not a payroll file: other policies decide
  end if;
  if me is null or seg2 !~ '^[0-9]{1,9}$' then
    return false;           -- anon, or a path that names no company
  end if;
  co := seg2::integer;

  if public.is_payroll_admin_of(co) then
    return true;
  end if;
  if p_write then
    return false;
  end if;

  -- The employee the file is about, reading it.
  if kind = 'onboarding' then
    return seg3 ~ '^[0-9]{1,9}$' and exists (
      select 1 from public.employees e
       where e.id = seg3::integer and e.company_id = co
         and e.email is not null and lower(e.email) = me);
  elsif kind = 'tax-filings' then
    return exists (
      select 1 from public.payroll_tax_filings f
        join public.employees e on e.id = f.employee_id
       where f.pdf_storage_path = p_name and f.company_id = co
         and e.email is not null and lower(e.email) = me);
  else -- paystubs
    return exists (
      select 1 from public.paystubs p
        join public.employees e on e.id = p.employee_id
       where p.pdf_path = p_name and p.company_id = co
         and e.email is not null and lower(e.email) = me);
  end if;
end;
$$;

revoke all on function public.is_payroll_admin_of(integer) from public;
revoke all on function public.can_access_payroll_file(text, boolean) from public;
grant execute on function public.is_payroll_admin_of(integer) to anon, authenticated, service_role;
grant execute on function public.can_access_payroll_file(text, boolean) to anon, authenticated, service_role;

drop policy if exists payroll_files_select on storage.objects;
drop policy if exists payroll_files_insert on storage.objects;
drop policy if exists payroll_files_update on storage.objects;
drop policy if exists payroll_files_delete on storage.objects;

create policy payroll_files_select on storage.objects
  as restrictive for select to public
  using (bucket_id <> 'project-documents'
         or split_part(name, '/', 1) not in ('tax-filings', 'onboarding', 'paystubs')
         or public.can_access_payroll_file(name, false));

create policy payroll_files_insert on storage.objects
  as restrictive for insert to public
  with check (bucket_id <> 'project-documents'
         or split_part(name, '/', 1) not in ('tax-filings', 'onboarding', 'paystubs')
         or public.can_access_payroll_file(name, true));

create policy payroll_files_update on storage.objects
  as restrictive for update to public
  using (bucket_id <> 'project-documents'
         or split_part(name, '/', 1) not in ('tax-filings', 'onboarding', 'paystubs')
         or public.can_access_payroll_file(name, true))
  with check (bucket_id <> 'project-documents'
         or split_part(name, '/', 1) not in ('tax-filings', 'onboarding', 'paystubs')
         or public.can_access_payroll_file(name, true));

create policy payroll_files_delete on storage.objects
  as restrictive for delete to public
  using (bucket_id <> 'project-documents'
         or split_part(name, '/', 1) not in ('tax-filings', 'onboarding', 'paystubs')
         or public.can_access_payroll_file(name, true));
