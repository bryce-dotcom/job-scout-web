-- =====================================================================
-- agent-releases — the file a customer downloads to put Arnie on their
-- computer.
--
-- PUBLIC READ, deliberately, and it is the one Arnie bucket that is. What is
-- in here is a program we wrote and a key that is already public (the anon
-- key ships in every web bundle). Nothing in it is anybody's data. Making it
-- private would mean a signed URL, which means the download link expires,
-- which means a person who comes back to their Downloads folder tomorrow
-- gets an error instead of an agent.
--
-- WRITE IS SERVICE ROLE ONLY — no policy for `authenticated` at all. This is
-- the one bucket where an upload would be an executable that other people
-- then run on their own machines, so the only way in is a publisher holding
-- the service key (npm run agent:release). An employee cannot put a file
-- here, and neither can a compromised browser session.
--
-- The recordings bucket next door is the mirror image of this one: private,
-- authenticated write, no public read. Worth reading them together — the
-- difference is entirely in who the bytes belong to.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('agent-releases', 'agent-releases', true, 20971520, null)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- A public bucket still needs a select policy for anon/authenticated to read
-- objects through the API; `public = true` alone governs the public URL path.
-- Granting both keeps the download working however the browser asks for it.
do $$ begin
  create policy agent_releases_read on storage.objects
    for select to anon, authenticated
    using (bucket_id = 'agent-releases');
exception when duplicate_object then null; end $$;

-- Writes: nothing. Not even for authenticated. See the note above — the
-- absence of an insert policy here is the point, not an oversight, so if a
-- future migration "fixes" this bucket by adding one, that is the bug.
