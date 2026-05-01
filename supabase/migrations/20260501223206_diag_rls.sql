-- Diagnostic + remediation: ensure RLS is actually active and that
-- the anon role's table-level grants are what we expect.
--
-- Check: a freshly-enabled RLS table should still allow anon SELECT
-- through PostgREST when the role has the SELECT privilege AND a
-- policy matches. If the policy is `TO authenticated` and the request
-- comes from anon, the policy doesn't apply -> all rows are denied.
-- BUT — and this was the trap on JobScout — Supabase ships the anon
-- role with table grants by default. Enabling RLS without a matching
-- policy denies. Yet our audit showed anon STILL reading rows.
--
-- Likely cause: PostgREST caches the schema after RLS toggles. Force
-- a NOTIFY pgrst, 'reload schema' so the API picks up the new RLS
-- state immediately.

NOTIFY pgrst, 'reload schema';
