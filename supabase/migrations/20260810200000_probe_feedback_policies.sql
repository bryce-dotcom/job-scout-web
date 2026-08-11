-- TEMPORARY. Reads the live RLS policies on public.feedback into a table so the
-- service role can inspect them; dropped by the very next migration.
-- A beta tester cannot submit feedback at all:
--   new row violates row-level security policy "require_writable_ins"
-- and that policy exists in the database but in no migration in this repo, so
-- it has to be read from the live schema before it can be safely changed.
create table if not exists public.__policy_probe (
  tablename text, policyname text, cmd text, roles text,
  qual text, with_check text, permissive text
);
alter table public.__policy_probe enable row level security;  -- no policies: service role only
truncate public.__policy_probe;
insert into public.__policy_probe
select tablename, policyname, cmd, roles::text, qual, with_check, permissive
from pg_policies
where schemaname = 'public' and tablename in ('feedback', 'companies');
