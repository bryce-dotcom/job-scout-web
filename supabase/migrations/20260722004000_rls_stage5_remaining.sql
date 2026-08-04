-- =====================================================================
-- Tenant-isolation RLS rollout — STAGE 5 (remaining standard tables).
--
-- settings, customer_portal_tokens, google_calendar_tokens, feedback,
-- reports. All per-company (data check: no shared/global NULL rows except
-- one system-generated feedback alert, which SHOULD stay tenant-invisible).
-- Standard tenant_isolation policy. Public paths that touch these
-- (portal token lookup, Zach/Lenard slug settings reads) go through
-- service-role edge functions, which bypass RLS. Reversible per table.
--
-- (employees is handled separately in its own stage — login-critical.)
-- =====================================================================
do $$
declare
  t text;
  tables text[] := array[
    'settings','customer_portal_tokens','google_calendar_tokens',
    'feedback','reports'
  ];
begin
  foreach t in array tables loop
    if not exists (select 1 from pg_tables where schemaname='public' and tablename=t) then
      raise notice 'skip % (no table)', t; continue;
    end if;
    if not exists (
      select 1 from information_schema.columns
       where table_schema='public' and table_name=t and column_name='company_id'
    ) then
      raise notice 'skip % (no company_id)', t; continue;
    end if;

    execute format('drop policy if exists tenant_isolation on public.%I', t);
    execute format($p$
      create policy tenant_isolation on public.%I
        for all to authenticated
        using (company_id in (select public.current_user_company_ids()))
        with check (company_id in (select public.current_user_company_ids()))
    $p$, t);

    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    raise notice 'RLS enabled + tenant policy: %', t;
  end loop;
end $$;
