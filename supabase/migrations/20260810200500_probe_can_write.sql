-- TEMPORARY, dropped by the next migration. Captures the source of
-- company_can_write() so the trial gate can be changed with its real
-- semantics in hand rather than guessed at.
truncate public.__policy_probe;
insert into public.__policy_probe (tablename, policyname, qual)
select 'fn', p.proname, pg_get_functiondef(p.oid)
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('company_can_write', 'current_user_company_ids');
