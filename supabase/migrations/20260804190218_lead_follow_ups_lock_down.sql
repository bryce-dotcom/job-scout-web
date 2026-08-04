-- lead_follow_ups was readable by the ANON role while jobs and leads are not.
--
-- Supabase grants anon/authenticated SELECT on new public tables by default,
-- and the tenant tables have had those grants revoked. My migration created
-- the table without matching that, so it sat more exposed than every table
-- around it — an unauthenticated client could read follow-up notes.
--
-- Align it with jobs/leads: no anon access at all, authenticated only, and
-- the RLS policy scoped to the caller's company rather than `using (true)`.

revoke all on public.lead_follow_ups from anon;

do $$ begin
  drop policy if exists lead_follow_ups_rw on public.lead_follow_ups;
exception when undefined_object then null; end $$;

-- Authenticated users see only their own company's rows. Mirrors how the
-- rest of the tenant tables are scoped.
do $$ begin
  create policy lead_follow_ups_company_rw on public.lead_follow_ups
    for all to authenticated
    using (
      company_id in (
        select e.company_id from public.employees e
        where e.email = auth.jwt() ->> 'email'
      )
    )
    with check (
      company_id in (
        select e.company_id from public.employees e
        where e.email = auth.jwt() ->> 'email'
      )
    );
exception when duplicate_object then null; end $$;
