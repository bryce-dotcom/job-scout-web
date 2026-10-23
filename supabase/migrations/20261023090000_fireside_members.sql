-- Who a FireSide is for.
--
-- Bryce, 2026-10-22: "create FireSide-Sales and add all the salesmen into the
-- group for Cole."
--
-- Deliberately a LIST, not a lock. Anyone in the company can still walk into
-- any FireSide — locking people out of a video room in a twenty-person
-- company buys nothing and costs a support call every time somebody needs to
-- join a conversation they were not listed on. What membership buys is that
-- the room is obviously THEIRS: it sorts to the top of their list and says so.
--
-- A plain array rather than a join table: a FireSide holds a handful of
-- people, nobody queries "every room this employee is in" from the server,
-- and a join table would need its own policies to protect a list of names
-- that everyone in the company can already see on the roster.
--
-- No foreign key on purpose. An employee who leaves should not block the
-- delete of their row or vanish the FireSide with them; a stale id simply
-- stops matching anyone and drops out of the display.

alter table public.conference_rooms
  add column if not exists member_ids bigint[] not null default '{}';

comment on column public.conference_rooms.member_ids is
  'Employee ids this FireSide is for. A list, not a lock — anyone in the company may still join.';

-- Reading a room already requires being in its company, and the existing
-- update policy is company-scoped too, so changing the member list needs no
-- new policy. This index only matters once "my FireSides" is a filter.
create index if not exists conference_rooms_member_ids_idx
  on public.conference_rooms using gin (member_ids);
