-- A locked-out account must still be able to tell us it is locked out.
--
-- Antonio (Antonino Lawn Care, company 9, trial expired 2026-06-08) tried to
-- report a bug and got:
--
--   new row violates row-level security policy "require_writable_ins"
--   for table "feedback"
--
-- The trial read-only gate covers 123 tables, and feedback was one of them. So
-- the moment a beta tester's trial ends, the channel they would use to tell us
-- anything closes too — and it closes silently from our side: we just stop
-- hearing from them and read it as having nothing to say. Every beta tester
-- reaching the end of their trial hits this, which is exactly when their
-- opinion is worth the most.
--
-- Freezing someone's BUSINESS DATA when they stop paying is the point of the
-- gate and stays. Feedback is not business data — it is how they reach a human.
-- Dropping the restrictive INSERT policy leaves tenant_isolation in force, so
-- they still can only file against their own company.
--
-- UPDATE and DELETE stay gated: reaching us is what has to keep working, not
-- editing the record afterwards.
drop policy if exists require_writable_ins on public.feedback;

-- Introspection scaffolding from working this out — the policy existed in the
-- database but in no migration, so it had to be read off the live schema.
drop table if exists public.__policy_probe;
