-- =====================================================================
-- Make the payroll-table guard fail LOUDLY.
--
-- 20260827140000 protected paystubs, payroll_runs and
-- payroll_tax_liabilities with RESTRICTIVE policies. They work: a
-- non-admin write does not land. But an RLS `USING` clause filters the
-- row out rather than raising, so the caller gets "0 rows affected" and
-- this app's `const { data } = await ...` turns that into an empty
-- result. The screen shows nothing wrong.
--
-- That is precisely the failure mode the audit is about, and it would be
-- perverse to introduce more of it while fixing it. The other two guards
-- in that migration are triggers and say why they refused; these now
-- match.
--
-- Protection is unchanged either way — this is about whether the person
-- who hits it finds out.
-- =====================================================================

create or replace function public.guard_payroll_admin_only()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_email text := nullif(current_setting('request.jwt.claims', true)::json ->> 'email', '');
begin
  -- Edge functions authorise their own callers; see _shared/auth.ts.
  if jwt_email is null then return coalesce(new, old); end if;
  if public.current_user_access_level() >= 3 then return coalesce(new, old); end if;

  raise exception 'Only an admin can % a % record.', lower(tg_op), tg_table_name
    using errcode = '42501';
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['paystubs', 'payroll_runs', 'payroll_tax_liabilities'] loop
    -- The restrictive policies come off: one mechanism, one behaviour.
    execute format('drop policy if exists admin_writes_only on public.%I', t);
    execute format('drop policy if exists admin_updates_only on public.%I', t);
    execute format('drop policy if exists admin_deletes_only on public.%I', t);

    execute format('drop trigger if exists guard_payroll_admin_only on public.%I', t);
    execute format($p$
      create trigger guard_payroll_admin_only
        before insert or update or delete on public.%I
        for each row execute function public.guard_payroll_admin_only()
    $p$, t);
  end loop;
end $$;

notify pgrst, 'reload schema';
