-- =====================================================================
-- Tenant-isolation RLS rollout — FINAL (employees). Login-critical.
--
-- Login and every session-restore run
--   employees.select('*, company:companies(*)').eq(...)
-- as the just-authenticated user. The standard policy permits it because
-- current_user_company_ids() is SECURITY DEFINER — it resolves the user's
-- company from employees by JWT email WITHOUT recursing through RLS, then
-- the policy lets the user read employees in that company (incl. their own
-- row). Developers get all companies via the same helper, so DataConsole's
-- cross-company employee views keep working.
--
-- Applied on its own and verified with a live sign-in before commit;
-- reversible via DISABLE ROW LEVEL SECURITY on failure.
-- =====================================================================
drop policy if exists tenant_isolation on public.employees;
create policy tenant_isolation on public.employees
  for all to authenticated
  using (company_id in (select public.current_user_company_ids()))
  with check (company_id in (select public.current_user_company_ids()));

alter table public.employees enable row level security;
alter table public.employees force row level security;
