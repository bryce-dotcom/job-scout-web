-- TEMPORARY, dropped by the next migration. Tracy can no longer pick an
-- expense category in Books: all 20 categories have company_id IS NULL, and a
-- tenant policy of company_id IN (...) never matches NULL. Read the live
-- policies before changing them.
create table if not exists public.__policy_probe (
  tablename text, policyname text, cmd text, roles text, qual text, with_check text, permissive text
);
alter table public.__policy_probe enable row level security;
truncate public.__policy_probe;
insert into public.__policy_probe
select tablename, policyname, cmd, roles::text, qual, with_check, permissive
from pg_policies
where schemaname = 'public' and tablename in ('expense_categories');
