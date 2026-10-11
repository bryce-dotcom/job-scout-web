-- =====================================================================
-- Storage policies for arnie-recordings.
--
-- The bucket was created private and then nothing could write to it: an
-- authenticated upload came back "new row violates row-level security
-- policy", so every screenshot in a demonstration was silently dropped and
-- Arnie was handed a recording with no pictures in it. He correctly said the
-- recording was too thin to be useful, which is how the missing policy was
-- found at all — a worse-behaved prompt would have invented steps from three
-- coordinates and nobody would have noticed for weeks.
--
-- The bucket stays PRIVATE and gains no public read. These are screenshots of
-- somebody's working screen, with whatever customer happened to be on it; a
-- public bucket would put that on a guessable URL. Arnie reads them
-- server-side through a short-lived signed URL (arnie-teach), which needs no
-- policy because the service role bypasses these.
--
-- Writes are scoped to the person's OWN recordings by path: the agent uploads
-- to <skill_id>/<seq>.png, and the policy checks that skill belongs to the
-- caller. So one employee cannot write into — or read — another's
-- demonstration, which matters more here than almost anywhere else in the
-- app, because a demonstration is a recording of somebody's screen.
-- =====================================================================

-- Idempotent: the bucket may already exist from the console/API.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('arnie-recordings', 'arnie-recordings', false, 5242880, array['image/png', 'image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- The first path segment is the skill id. A recording that is not yours is
-- not yours to write into, read, or delete.
--
-- Identity is the JWT's EMAIL, matched case-insensitively against an ACTIVE
-- employee — the same rule current_user_company_ids() uses. This app has no
-- employees.user_id column; auth.uid() would have matched nothing and the
-- policy would have silently denied everybody, which is exactly the failure
-- this migration exists to fix.
create or replace function public.arnie_recording_is_mine(object_name text)
returns boolean
language sql
stable
security definer
set search_path = 'public', 'pg_temp'
as $$
  select exists (
    select 1
    from public.arnie_skills s
    join public.employees e on e.id = s.employee_id
    where s.id = nullif(split_part(object_name, '/', 1), '')::bigint
      and e.active = true
      and lower(e.email) = lower(coalesce(
        current_setting('request.jwt.claims', true)::jsonb ->> 'email', ''))
      and coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'email', '') <> ''
  );
$$;

do $$ begin
  create policy arnie_recordings_insert_own on storage.objects
    for insert to authenticated
    with check (bucket_id = 'arnie-recordings' and public.arnie_recording_is_mine(name));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy arnie_recordings_read_own on storage.objects
    for select to authenticated
    using (bucket_id = 'arnie-recordings' and public.arnie_recording_is_mine(name));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy arnie_recordings_update_own on storage.objects
    for update to authenticated
    using (bucket_id = 'arnie-recordings' and public.arnie_recording_is_mine(name))
    with check (bucket_id = 'arnie-recordings' and public.arnie_recording_is_mine(name));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy arnie_recordings_delete_own on storage.objects
    for delete to authenticated
    using (bucket_id = 'arnie-recordings' and public.arnie_recording_is_mine(name));
exception when duplicate_object then null; end $$;
