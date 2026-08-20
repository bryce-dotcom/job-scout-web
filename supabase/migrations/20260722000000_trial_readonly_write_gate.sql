-- =====================================================================
-- Read-only enforcement for lapsed / canceled tenants.
--
-- Problem: `billing_status='trialing'` had no non-Stripe exit. A trial
-- that simply ran out (no card added → no Stripe subscription → no
-- webhook will ever fire) sat at 'trialing' forever with full write
-- access. The expire-trials cron now moves those to 'trial_expired';
-- this migration makes that status (and 'canceled') actually mean
-- something: the tenant can still READ their data, but cannot write.
--
-- Design — ADDITIVE + RESTRICTIVE, on purpose:
--   * The existing tenant-isolation policies are permissive and are NOT
--     touched here. (They also no longer reference belongs_to_company(),
--     which was dropped from prod — so recreating them blind would be
--     risky. We add alongside instead.)
--   * A RESTRICTIVE policy is AND-ed with whatever permissive policies
--     already exist. Scoped to INSERT/UPDATE/DELETE only, so SELECT is
--     never affected — reads keep working for a read-only tenant.
--   * Applied to every public table that has a company_id column, plus
--     companies (keyed on id). Auto-covers current AND future tenant
--     tables, so a new table can't silently reopen the write hole.
--
-- Service-role connections (edge functions, scripts) bypass RLS
-- entirely, so re-subscribe (tenant-billing-create-subscription) and all
-- server-side flows keep working regardless of a tenant's write state.
-- =====================================================================

-- Writable? FALSE only for hard billing stops. Fail OPEN on unknown/null
-- so a data hiccup or an as-yet-unseen status never bricks a good tenant.
-- 'past_due' stays writable on purpose — a paying customer whose card just
-- failed gets a grace period, not an instant lockout (the banner nags).
create or replace function public.company_can_write(cid integer)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select c.billing_status is distinct from 'trial_expired'
        and c.billing_status is distinct from 'canceled'
       from public.companies c
      where c.id = cid),
    true
  )
$$;

create or replace function public.company_can_write(cid bigint)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select public.company_can_write(cid::integer)
$$;

revoke all on function public.company_can_write(integer) from public;
revoke all on function public.company_can_write(bigint)  from public;
grant execute on function public.company_can_write(integer) to authenticated, anon;
grant execute on function public.company_can_write(bigint)  to authenticated, anon;

-- Add the restrictive write-gate to every tenant table with a company_id.
do $$
declare
  t text;
begin
  for t in
    select c.table_name
      from information_schema.columns c
      join pg_tables p
        on p.schemaname = 'public' and p.tablename = c.table_name
     where c.table_schema = 'public'
       and c.column_name = 'company_id'
  loop
    execute format('drop policy if exists require_writable_ins on public.%I', t);
    execute format('drop policy if exists require_writable_upd on public.%I', t);
    execute format('drop policy if exists require_writable_del on public.%I', t);

    execute format($p$
      create policy require_writable_ins on public.%I
        as restrictive for insert to authenticated
        with check (public.company_can_write(company_id))
    $p$, t);

    execute format($p$
      create policy require_writable_upd on public.%I
        as restrictive for update to authenticated
        using (public.company_can_write(company_id))
        with check (public.company_can_write(company_id))
    $p$, t);

    execute format($p$
      create policy require_writable_del on public.%I
        as restrictive for delete to authenticated
        using (public.company_can_write(company_id))
    $p$, t);
  end loop;
end $$;

-- companies itself keys on id, not company_id — gate its writes too so a
-- read-only tenant can't edit its own company record client-side. (Billing
-- transitions run server-side via service role and are unaffected.)
drop policy if exists require_writable_ins on public.companies;
drop policy if exists require_writable_upd on public.companies;
drop policy if exists require_writable_del on public.companies;

create policy require_writable_upd on public.companies
  as restrictive for update to authenticated
  using (public.company_can_write(id))
  with check (public.company_can_write(id));

create policy require_writable_del on public.companies
  as restrictive for delete to authenticated
  using (public.company_can_write(id));
