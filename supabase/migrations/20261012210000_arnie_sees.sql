-- =====================================================================
-- Giving Arnie eyes.
--
-- He could already act on a person's computer and could not see it. The
-- agent took real screenshots — verified, it photographed a program — but
-- they stayed as a temp file on the machine and only the PATH was reported,
-- so nothing ever came back to him. He was a hand with no eyes: able to click
-- and type in a program, unable to read what was in front of him.
--
-- Which is the difference between "allow him Chrome on mail.google.com" being
-- a party trick and being the product. Nobody wants him clicking blind in
-- their email. They want him to read it — on the screen they are already
-- signed into, with no Google password, no API scopes and no OAuth review,
-- because he is only looking at what is already there.
--
-- WHERE THE PICTURES GO. The same private bucket as the teaching recordings,
-- because they are the same kind of thing: a photograph of somebody's working
-- screen, with whatever customer happened to be on it. Never public, never
-- guessable, and read server-side through a short-lived signed URL.
--
-- The existing policy keys a path on its first segment being a SKILL this
-- person owns. A live action is not part of a skill, so it needs its own
-- shape — `a/<action_id>.png` — and its own check: the action must belong to
-- the person asking. Same rule, different table.
-- =====================================================================

create or replace function public.arnie_shot_is_mine(object_name text)
returns boolean
language sql
stable
security definer
set search_path = 'public', 'pg_temp'
as $$
  select exists (
    select 1
    from public.arnie_computer_actions a
    join public.employees e on e.id = a.employee_id
    where split_part(object_name, '/', 1) = 'a'
      and a.id = nullif(split_part(split_part(object_name, '/', 2), '.', 1), '')::bigint
      and e.active = true
      and lower(e.email) = lower(coalesce(
        current_setting('request.jwt.claims', true)::jsonb ->> 'email', ''))
      and coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'email', '') <> ''
  );
$$;

-- The agent uploads as the person, so these are the same three verbs the
-- recordings got — and for the same reason: a bucket with no policy accepts
-- nothing and says nothing, which is how every screenshot in a demonstration
-- vanished once already.
do $$ begin
  create policy arnie_shots_insert_own on storage.objects
    for insert to authenticated
    with check (bucket_id = 'arnie-recordings' and public.arnie_shot_is_mine(name));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy arnie_shots_read_own on storage.objects
    for select to authenticated
    using (bucket_id = 'arnie-recordings' and public.arnie_shot_is_mine(name));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy arnie_shots_update_own on storage.objects
    for update to authenticated
    using (bucket_id = 'arnie-recordings' and public.arnie_shot_is_mine(name))
    with check (bucket_id = 'arnie-recordings' and public.arnie_shot_is_mine(name));
exception when duplicate_object then null; end $$;
