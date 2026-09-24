-- Data Console > Utilities writes GLOBAL utility rows (company_id IS NULL)
-- from the browser, as the signed-in user. Stage-3 RLS
-- (20260722003000_rls_stage3_reference.sql) put the six utility tables on
-- "read own + global, write own" with a comment that global rows are
-- maintained by the ai-utility-research / parse-utility-pdf edge functions on
-- the service role. They are not — those functions only return JSON; every
-- insert, update and delete on that page is a plain PostgREST call under the
-- user's JWT. So from 2026-07-22 every insert there was refused, and every
-- update or delete matched zero rows with no error (the page never read the
-- error either, so the modal closed as if it had saved). No utility row has
-- been created since 2026-04-08.
--
-- Fix: a platform developer — employees.is_developer = true, matched by JWT
-- email, the same notion current_user_company_ids() already honours — may
-- write rows whose company_id IS NULL on the six utility tables. Tenant rows
-- are untouched; nobody without is_developer gains anything. The restrictive
-- require_writable_* policies still apply and pass, because
-- company_can_write(NULL) is true by design (no company to be expired).

create or replace function public.is_platform_developer()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with jwt_email as (
    select lower(coalesce(
      current_setting('request.jwt.claims', true)::jsonb ->> 'email', ''
    )) as email
  )
  select exists (
    select 1
      from public.employees e, jwt_email j
     where e.active = true
       and e.is_developer = true
       and j.email <> ''
       and lower(e.email) = j.email
  );
$$;

revoke all on function public.is_platform_developer() from public;
grant execute on function public.is_platform_developer() to authenticated;

do $$
declare
  t text;
  tables text[] := array[
    'utility_providers','utility_programs','utility_rate_schedules',
    'utility_forms','incentive_measures','prescriptive_measures'
  ];
begin
  foreach t in array tables loop
    if not exists (select 1 from pg_tables where schemaname = 'public' and tablename = t) then
      raise notice 'skip % (no table)', t; continue;
    end if;
    begin
      execute format($p$
        create policy platform_write_global on public.%I
          for all to authenticated
          using (company_id is null and public.is_platform_developer())
          with check (company_id is null and public.is_platform_developer())
      $p$, t);
      raise notice 'platform_write_global: %', t;
    exception when duplicate_object then
      raise notice 'platform_write_global already on %', t;
    end;
  end loop;
end $$;
