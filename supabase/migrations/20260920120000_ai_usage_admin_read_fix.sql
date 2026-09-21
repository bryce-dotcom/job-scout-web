-- ai_usage: the admin read policy joined auth.users, which the
-- authenticated role may not read — so every client SELECT on ai_usage
-- failed with "permission denied for table users" and no admin has ever
-- seen a usage row from the app. The ladder function already answers
-- "is this caller an admin" without touching auth.users.
drop policy if exists "Admins can read ai_usage" on public.ai_usage;
create policy "Admins can read ai_usage"
  on public.ai_usage for select
  using (
    company_id in (select public.current_user_company_ids())
    and public.current_user_access_level() >= 3
  );
