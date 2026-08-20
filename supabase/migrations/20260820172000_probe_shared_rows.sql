-- TEMPORARY, dropped by the next migration. Which other tables hold shared
-- rows (company_id IS NULL) that the tenant policy would hide the same way?
create table if not exists public.__shared_probe (tablename text, null_rows bigint, total_rows bigint);
alter table public.__shared_probe enable row level security;
truncate public.__shared_probe;
do $$
declare r record; n bigint; t bigint;
begin
  for r in
    select c.relname as tablename
    from pg_class c
    join pg_namespace ns on ns.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attname = 'company_id' and a.attnum > 0
    where ns.nspname = 'public' and c.relkind = 'r'
      and exists (select 1 from pg_policies p where p.schemaname='public' and p.tablename=c.relname and p.policyname='tenant_isolation')
  loop
    execute format('select count(*) filter (where company_id is null), count(*) from public.%I', r.tablename) into n, t;
    if n > 0 then insert into public.__shared_probe values (r.tablename, n, t); end if;
  end loop;
end $$;
