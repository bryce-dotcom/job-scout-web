-- TEMPORARY diagnostic. Returns the RLS landscape for tenant tables so we
-- can confirm the read-only write-gate actually applies everywhere (a table
-- with RLS disabled would silently ignore the restrictive policy). Dropped
-- by a follow-up migration once verified — do not build on this.
create or replace function public._gate_debug()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  tables jsonb := '[]'::jsonb;
  no_rls text[] := '{}';
  missing_policy text[] := '{}';
begin
  for rec in
    select c.relname as tbl,
           c.relrowsecurity as rls_on,
           exists (
             select 1 from pg_policies p
              where p.schemaname = 'public' and p.tablename = c.relname
                and p.policyname = 'require_writable_ins'
           ) as has_ins_policy
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
     where c.relkind = 'r'
       and exists (
         select 1 from information_schema.columns col
          where col.table_schema = 'public' and col.table_name = c.relname
            and col.column_name = 'company_id'
       )
     order by c.relname
  loop
    tables := tables || jsonb_build_object('t', rec.tbl, 'rls', rec.rls_on, 'ins', rec.has_ins_policy);
    if not rec.rls_on then no_rls := no_rls || rec.tbl; end if;
    if not rec.has_ins_policy then missing_policy := missing_policy || rec.tbl; end if;
  end loop;

  return jsonb_build_object(
    'can_write_9_trial_expired', public.company_can_write(9),
    'can_write_3_grandfathered', public.company_can_write(3),
    'tables_total', jsonb_array_length(tables),
    'rls_disabled', to_jsonb(no_rls),
    'missing_ins_policy', to_jsonb(missing_policy),
    'tables', tables
  );
end $$;

revoke all on function public._gate_debug() from public, anon, authenticated;
grant execute on function public._gate_debug() to service_role;
