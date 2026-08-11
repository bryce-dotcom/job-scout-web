-- Assertion, not a change. Fails the push if the feedback channel is ever
-- gated again, or if tenant isolation got dropped along with it.
do $$
begin
  if exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'feedback'
       and policyname = 'require_writable_ins'
  ) then
    raise exception 'feedback INSERT is still gated by the trial read-only policy';
  end if;

  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'feedback'
       and policyname = 'tenant_isolation'
  ) then
    raise exception 'feedback lost tenant isolation — a tenant could file against another company';
  end if;

  if exists (select 1 from pg_tables where schemaname = 'public' and tablename = '__policy_probe') then
    raise exception 'introspection scaffolding was left behind in production';
  end if;
end $$;
