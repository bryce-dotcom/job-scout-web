-- Who can currently write, according to the gate itself.
--
-- Antonino Lawn Care sat read-only from 2026-06-08 to 2026-08-10 and we found
-- out from a photograph of an error dialog. Nothing watches for an account
-- going read-only, and the account least able to tell us is precisely the one
-- it has happened to — the feedback form was behind the same gate.
--
-- This calls public.company_can_write() rather than restating which statuses
-- mean read-only. That list already has to stay in step between the database
-- and the client; a third copy in a monitor is how it would drift, and a
-- monitor that disagrees with the gate is worse than none.
--
-- Cross-tenant by nature, so service_role only.
create or replace function public.account_access_report()
returns table (
  company_id     integer,
  company_name   text,
  billing_status text,
  trial_ends_at  timestamptz,
  can_write      boolean,
  active_users   integer
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select
    c.id,
    c.company_name,
    c.billing_status,
    c.trial_ends_at,
    public.company_can_write(c.id),
    (select count(*)::integer from public.employees e
      where e.company_id = c.id and e.active is true)
  from public.companies c
$$;

revoke all on function public.account_access_report() from public, anon, authenticated;
grant execute on function public.account_access_report() to service_role;
