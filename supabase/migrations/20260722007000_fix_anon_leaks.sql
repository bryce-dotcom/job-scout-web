-- =====================================================================
-- Close two anon-readable leaks found during the go-to-market audit:
--   * public.companies         — anon could read ALL company rows
--   * public.beta_invite_codes — anon could read the signup codes,
--                                defeating the beta gate entirely
--
-- Both are reset from whatever their current (broken) policy state is:
-- drop every existing policy, then recreate the correct minimal set and
-- force RLS on. Verified safe by audit: no public/anon frontend path
-- reads either table directly — companies is read only by authenticated
-- own-company code (incl. login), beta_invite_codes only by the
-- beta-signup edge function (service role, bypasses RLS).
-- =====================================================================

-- ── companies: authenticated users see/write only their OWN company row
--    (developers get all via current_user_company_ids()'s dev bypass).
do $$
declare p record;
begin
  for p in select policyname from pg_policies
            where schemaname = 'public' and tablename = 'companies'
  loop
    execute format('drop policy if exists %I on public.companies', p.policyname);
  end loop;
end $$;

create policy tenant_isolation on public.companies
  for all to authenticated
  using (id in (select public.current_user_company_ids()))
  with check (id in (select public.current_user_company_ids()));

-- keep the lapsed-trial read-only write-gate on the company row
create policy require_writable_upd on public.companies
  as restrictive for update to authenticated
  using (public.company_can_write(id)) with check (public.company_can_write(id));
create policy require_writable_del on public.companies
  as restrictive for delete to authenticated
  using (public.company_can_write(id));

alter table public.companies enable row level security;
alter table public.companies force row level security;

-- ── beta_invite_codes: service-role only (the beta-signup edge fn), plus
--    an authenticated-developer read so admin tooling can still list codes.
--    The frontend never reads this table directly.
do $$
declare p record;
begin
  for p in select policyname from pg_policies
            where schemaname = 'public' and tablename = 'beta_invite_codes'
  loop
    execute format('drop policy if exists %I on public.beta_invite_codes', p.policyname);
  end loop;
end $$;

create policy developer_read on public.beta_invite_codes
  for select to authenticated
  using (
    exists (
      select 1 from public.employees e
       where lower(e.email) = lower(coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'email', ''))
         and e.is_developer = true
    )
  );

alter table public.beta_invite_codes enable row level security;
alter table public.beta_invite_codes force row level security;
