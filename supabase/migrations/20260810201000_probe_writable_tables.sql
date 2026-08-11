-- TEMPORARY, dropped by the next migration. Which tables the trial read-only
-- gate covers, so the exemption is a considered list rather than a guess.
truncate public.__policy_probe;
insert into public.__policy_probe (tablename, policyname, cmd)
select tablename, policyname, cmd from pg_policies
where schemaname = 'public' and policyname like 'require_writable%';
