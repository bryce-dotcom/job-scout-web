-- Routines at a minute, not just an hour.
--
-- Alayda asked for a check emailed at 8:45 and got one scheduled for 8:00:
-- the table only ever had hour_local, so the 45 was parsed, dropped, and
-- never stored. She then went looking for an email that was never going to
-- arrive when she expected it.
--
-- Default 0, so every routine that already exists keeps the exact time it
-- runs today. Nothing needs backfilling.
--
-- The index carries the minute too: dueRoutines reads every enabled row and
-- filters in code, but the ordering is what the Routines page lists by, and
-- an hour-only order puts 8:45 above 8:00.

alter table public.arnie_routines
  add column if not exists minute_local integer not null default 0
    check (minute_local between 0 and 59);

drop index if exists arnie_routines_due_idx;
create index if not exists arnie_routines_due_idx
  on public.arnie_routines (enabled, hour_local, minute_local) where enabled;

comment on column public.arnie_routines.minute_local is
  'Minutes past hour_local, in the routine''s own timezone. The cron runs every five minutes and isDue() allows a short catch-up window, so a routine fires at or just after this time — never before it.';
