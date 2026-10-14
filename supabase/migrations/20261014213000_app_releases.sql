-- What shipped, written by `npm run ship` the moment a change is confirmed on
-- main. Two readers:
--   - Arnie, so he knows what changed in the app today ("it should learn
--     every time an update happens" — Bryce, 2026-10-14);
--   - Cole's daily JobScout refresh, which lists "release notes and tickets".
--
-- Commit messages are written for the team and can name HHH people and
-- customers, so this is NOT a public changelog: RLS is on with no client
-- policies, and arnie-chat reads it with the service role only for a
-- platform company (companies.is_platform). A curated customer-facing
-- changelog would be a different table.
create table if not exists public.app_releases (
  id          bigserial primary key,
  sha         text not null unique,
  subject     text not null,
  summary     text,
  shipped_at  timestamptz not null default now()
);

alter table public.app_releases enable row level security;

create index if not exists app_releases_shipped_at_idx on public.app_releases (shipped_at desc);

comment on table public.app_releases is
  'Commits confirmed on main by scripts/ship.mjs. Internal (platform company only): read by arnie-chat with the service role. No client policies on purpose.';
