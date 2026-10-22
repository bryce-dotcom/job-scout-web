-- Conference rooms: the team in one place, wherever they are working.
--
-- Bryce, 2026-10-22: techs are on phones in the field, the office is on
-- laptops, and there is nowhere in JobScout to just see each other. Main room
-- plus side rooms, named from the topo world the product already lives in —
-- Base Camp, The Ridge, Switchback — because a team that says "I'm on the
-- Ridge" is a team that actually uses it.
--
-- This table is the LOBBY, not the call. The media runs on LiveKit; a room
-- row only records that a room exists, who opened it and whether it is still
-- open, so the lobby can list rooms without asking the media server. The
-- actual LiveKit room id is built SERVER-SIDE from the caller's own company
-- (lib/conferenceRooms.roomId) — never from anything the browser sends — and
-- that namespacing is the only thing keeping two tenants off one call.
--
-- Base Camp is not stored. It always exists for every company, so there is
-- no state to get wrong and nothing to create before the first meeting.

create table if not exists public.conference_rooms (
  id              bigserial primary key,
  company_id      integer not null references public.companies(id) on delete cascade,
  slug            text not null check (slug ~ '^[a-z0-9-]{2,40}$'),
  name            text not null check (length(name) between 1 and 60),
  blurb           text,
  opened_by       integer references public.employees(id) on delete set null,
  opened_by_name  text,
  created_at      timestamptz not null default now(),
  closed_at       timestamptz
);

-- One room per slug per company. Two rooms with one name would be two
-- different calls that look like the same place.
create unique index if not exists conference_rooms_company_slug
  on public.conference_rooms (company_id, slug);

create index if not exists conference_rooms_open
  on public.conference_rooms (company_id, created_at desc)
  where closed_at is null;

alter table public.conference_rooms enable row level security;

-- Everyone in the company sees the lobby: that is the point of a lobby.
drop policy if exists conference_rooms_read on public.conference_rooms;
create policy conference_rooms_read on public.conference_rooms
  for select to authenticated
  using (company_id = public.get_user_company_id());

-- Anyone may open a side room — a meeting you have to ask permission for is
-- a meeting that does not happen. Scoped to their own company by the check.
drop policy if exists conference_rooms_open on public.conference_rooms;
create policy conference_rooms_open on public.conference_rooms
  for insert to authenticated
  with check (company_id = public.get_user_company_id());

-- And anyone may close one they can see. Closing is cosmetic — it hides a
-- finished room from the lobby; it does not end anyone's call.
drop policy if exists conference_rooms_close on public.conference_rooms;
create policy conference_rooms_close on public.conference_rooms
  for update to authenticated
  using (company_id = public.get_user_company_id())
  with check (company_id = public.get_user_company_id());

comment on table public.conference_rooms is
  'Side rooms for the in-app conference. The lobby list only; media runs on LiveKit, and the real room id is namespaced per company server-side. Base Camp is implicit for every company and is never stored here.';
