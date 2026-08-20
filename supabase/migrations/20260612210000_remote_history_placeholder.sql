-- Placeholder for a migration version that exists ONLY in the remote
-- supabase_migrations.schema_migrations history (applied ~2026-06-12 21:00 UTC,
-- source unknown — not from this repo; likely a dashboard SQL-editor save or a
-- cloud session). The local file exists so `supabase db push` stops flagging a
-- history mismatch. It intentionally contains no statements: whatever 210000
-- did is already live in prod, and recording it here prevents the CLI from
-- ever trying to re-apply or revert it.
select 1 where false;
