-- =====================================================================
-- Tenant-isolation RLS rollout — STAGE 2 (financial / payroll tables).
--
-- Same standard tenant_isolation policy as Stage 1 and the 32 original
-- live tables (company members see/write only their own company's rows
-- via current_user_company_ids(); developers get all-company for admin).
-- The restrictive read-only write-gate is already present on each table.
--
-- These hold money/payroll data — strictly per-company, no anon/public
-- read path (audit-confirmed); Stripe/Plaid/portal flows go through edge
-- functions on the service role, which bypasses RLS. Reversible per table
-- via DISABLE ROW LEVEL SECURITY.
-- =====================================================================

do $$
declare
  t text;
  tables text[] := array[
    'bank_accounts','plaid_transactions','expenses','expense_categories',
    'expense_splits','manual_expenses','invoice_lines','payment_plans',
    'payroll_runs','payroll_adjustments','paystubs','setter_commissions',
    'lead_commissions','liabilities','transaction_job_allocations',
    'customer_payment_methods','connected_accounts','time_clock',
    'time_log','time_off_requests'
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
