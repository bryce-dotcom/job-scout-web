-- =====================================================================
-- Tenant-isolation RLS rollout — STAGE 1 of N (operational tables).
--
-- Context: an audit found ~90 tenant tables with RLS DISABLED entirely
-- (no isolation, and the trial read-only write-gate dormant). The May-1
-- rollout only covered ~55 tables; the schema grew to 122. This closes
-- the gap in tested, domain-grouped batches.
--
-- This stage: LOW-RISK operational tables (no financial, no reference
-- data, no auth/employees). Each gets the SAME permissive policy already
-- proven on the 32 live tables — company members see/write only their own
-- company's rows, via current_user_company_ids() (which already grants
-- developers all-company access for the DataConsole). The restrictive
-- read-only write-gate (require_writable_*) is already present on every
-- table, so lapsed-trial read-only enforcement activates here too.
--
-- Verified by audit: none of these tables are read/written by an
-- anonymous user on any public route, so enabling RLS breaks no public
-- page. Service-role (edge functions) bypasses RLS regardless.
--
-- Reversible per stage: ALTER TABLE ... DISABLE ROW LEVEL SECURITY.
-- =====================================================================

do $$
declare
  t text;
  tables text[] := array[
    'appointments','assets','audit_areas','audit_log','bookings',
    'category_rules','collection_reminders','communications_log',
    'company_agents','company_notifications','custom_forms',
    'deal_activities','doc_package_items','document_approvals',
    'document_templates','email_automations','email_campaigns',
    'email_templates','file_attachments','fleet','fleet_fuel_logs',
    'fleet_maintenance','fleet_rentals','helpers','inventory',
    'lighting_audits','location_pings','pipeline_stages','routes',
    'sales_pipeline','search_index','sync_log','verification_photos',
    'verification_reports','webhook_form','employee_invitations',
    'dougie_corrections','cc_contact_map','cc_integrations',
    'ai_messages','ai_modules','ai_sessions','lawn_ai_corrections',
    'lawn_estimates','lawn_properties','lawn_treatments','lawn_visits',
    'lawn_quote_requests'
  ];
begin
  foreach t in array tables loop
    -- Skip if the table doesn't exist or lacks company_id (defensive;
    -- the audit says all 48 qualify, but keep the migration portable).
    if not exists (select 1 from pg_tables where schemaname='public' and tablename=t) then
      raise notice 'skip % (no table)', t; continue;
    end if;
    if not exists (
      select 1 from information_schema.columns
       where table_schema='public' and table_name=t and column_name='company_id'
    ) then
      raise notice 'skip % (no company_id)', t; continue;
    end if;

    -- Permissive tenant-isolation policy (idempotent).
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
