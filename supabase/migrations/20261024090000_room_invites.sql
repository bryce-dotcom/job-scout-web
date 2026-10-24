-- Letting a client into one meeting, and nothing else.
--
-- Bryce, 2026-10-23: "how can we share an outside link if we want to have a
-- meeting with a client."
--
-- room-token refuses anybody who is not a signed-in employee, and that is
-- what keeps one company out of another's call — so it is not the thing to
-- loosen. A guest comes through a different door with different rules: one
-- row here is one link, for one FireSide, that can be revoked on its own.
--
-- Several invites per room on purpose. One token shared with everybody means
-- killing the link for the client also kills it for the subcontractor, so
-- nobody ever revokes anything.
--
-- room_id is a real FK: a guest link is to a FIRESIDE, never to The Campfire,
-- which has no row because it is implicit for every company. That is the
-- design — a client should not land where the team is chatting — and here it
-- is enforced by there being nothing to point at.

create table if not exists public.room_invites (
  id              bigint generated always as identity primary key,
  company_id      bigint not null,
  room_id         bigint not null references public.conference_rooms(id) on delete cascade,
  -- Denormalised so the guest function can mint a LiveKit room id without a
  -- join. The room id it builds (co<company>__<slug>) is the tenant boundary.
  slug            text not null,
  -- The link itself. A uuid, matching the /portal/<uuid> customer links that
  -- already exist, so there is one shape of public link in the product.
  token           uuid not null default gen_random_uuid(),
  -- Who it is for, so a list of links is readable: "Brad Scott", "the
  -- inspector". Not an email — this is a label, not an identity.
  label           text,
  created_by      bigint,
  created_by_name text,
  -- A video link that works forever is a video link somebody forwards.
  expires_at      timestamptz not null default (now() + interval '24 hours'),
  revoked_at      timestamptz,
  created_at      timestamptz not null default now()
);

create unique index if not exists room_invites_token_idx on public.room_invites (token);
create index if not exists room_invites_room_idx on public.room_invites (room_id);

alter table public.room_invites enable row level security;

-- Employees of the company manage their own company's invites. The GUEST
-- never reads this table: the edge function looks the token up with the
-- service role, because the guest has no session at all.
drop policy if exists room_invites_read on public.room_invites;
create policy room_invites_read on public.room_invites
  for select to authenticated
  using (company_id = public.get_user_company_id());

drop policy if exists room_invites_create on public.room_invites;
create policy room_invites_create on public.room_invites
  for insert to authenticated
  with check (company_id = public.get_user_company_id());

-- Revoking is an update of revoked_at; the row is kept so there is a record
-- that the link existed and who made it.
drop policy if exists room_invites_revoke on public.room_invites;
create policy room_invites_revoke on public.room_invites
  for update to authenticated
  using (company_id = public.get_user_company_id())
  with check (company_id = public.get_user_company_id());

comment on table public.room_invites is
  'One shareable link per row, for one FireSide, revocable on its own. Guests never read this table — guest-room-token resolves it with the service role.';
