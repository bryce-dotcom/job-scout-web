-- Company meetings on the company calendar.
--
-- Bryce, 2026-10-25: "On the company calendar there is no place for company
-- meetings. And the EOS should establish a cadence of meeting on the calendar.
-- I'm pretty sure there is a place to set up your cadence in the eos it just
-- needs to translate to the company calendar and it needs to be maluble in the
-- chace we need to change something."
--
-- He was right on both counts. The cadence already exists — settings key
-- `eos_meeting_cadences`, holding {l10_day, l10_time, quarterly_next,
-- annual_next} — and HHH has had Monday 08:30 set the whole time. Nothing ever
-- carried it to the calendar: companyCalendar.js has eight kinds and not one
-- of them is a meeting, and buildCalendarEvents is never handed the EOS
-- settings at all.
--
-- WHAT THIS TABLE IS, AND WHAT IT IS NOT.
--
-- It is NOT the meeting schedule. The weekly L10 is a RULE — every Monday at
-- 08:30 — and writing out one row per week would mean a spawner, a backfill,
-- and two places that disagree about when the meeting is. The calendar DERIVES
-- the series from the cadence, the way it already draws projected repeats of
-- recurring jobs without creating them.
--
-- This table holds only what the rule cannot say:
--
--   * an EXCEPTION   — this one week moved, or is cancelled. `series_kind` +
--                      `series_date` name the derived occurrence it replaces.
--   * a ONE-OFF      — an all-hands that was never part of any series.
--                      `series_date` is null.
--
-- So changing the cadence in EOS moves every occurrence that nobody has
-- touched, and the handful that were deliberately moved stay where they were
-- put. That is the "malleable" Bryce asked for, without a second source of
-- truth for when the meeting normally is.

create table if not exists public.company_meetings (
  id            bigint generated always as identity primary key,
  company_id    integer not null references public.companies(id) on delete cascade,

  -- Which series this belongs to. 'custom' is a one-off that belongs to none.
  series_kind   text not null check (series_kind in ('l10', 'quarterly', 'annual', 'custom')),

  -- The date the DERIVED occurrence would have fallen on. This is the join key
  -- back to the series, so it must stay the original date even after the
  -- meeting is moved — otherwise the occurrence it was overriding comes back
  -- and you get two. Null for a one-off.
  series_date   date,

  -- Where it actually lands. Null only when cancelled.
  meeting_date  date,
  start_time    time,
  duration_minutes integer check (duration_minutes is null or duration_minutes between 1 and 1440),

  title         text,
  notes         text,
  cancelled     boolean not null default false,

  created_by    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  -- A cancelled meeting has no date; anything else must have one.
  constraint company_meetings_date_present
    check (cancelled or meeting_date is not null),
  -- A one-off is not an override of anything, so it needs its own name.
  constraint company_meetings_custom_has_title
    check (series_kind <> 'custom' or coalesce(btrim(title), '') <> '')
);

-- One override per occurrence. Deliberately NOT a partial index: PostgREST
-- cannot target one with onConflict and the write vanishes with 42P10 (that
-- trap has already cost this codebase a silent write). A plain unique index
-- treats NULLs as distinct, so any number of one-off meetings coexist while a
-- series occurrence can be overridden only once.
create unique index if not exists company_meetings_occurrence_uniq
  on public.company_meetings (company_id, series_kind, series_date);

create index if not exists company_meetings_company_date_idx
  on public.company_meetings (company_id, meeting_date);

comment on table public.company_meetings is
  'Exceptions and one-offs for the company meeting calendar. The recurring schedule itself is DERIVED from settings.eos_meeting_cadences — a row here only moves, cancels or adds a meeting. See src/lib/companyMeetings.js.';
comment on column public.company_meetings.series_date is
  'The date the derived occurrence would have fallen on — the join key back to the series. Stays put when the meeting moves, or the occurrence it overrides reappears.';

-- ---------------------------------------------------------------------
-- RLS. Every tenant table is RLS-on (2026-10-16 rollout); a new one does not
-- get to be the exception.
--
-- READ is company-wide on purpose. A meeting block on the shared calendar is a
-- time, not EOS content — no scorecard figure, rock or issue travels with it,
-- and a crew knowing leadership is in L10 on Monday is the point of a company
-- calendar. The EOS page itself stays Manager+ as it was.
--
-- WRITE is Manager+ (level >= 2), matching the gate on /admin/eos, so the
-- meeting schedule is changed by the people who own it.
-- ---------------------------------------------------------------------
alter table public.company_meetings enable row level security;

drop policy if exists company_meetings_read on public.company_meetings;
create policy company_meetings_read on public.company_meetings
  for select to authenticated
  using (company_id = public.get_user_company_id());

drop policy if exists company_meetings_write on public.company_meetings;
create policy company_meetings_write on public.company_meetings
  for all to authenticated
  using (company_id = public.get_user_company_id() and public.current_user_access_level() >= 2)
  with check (company_id = public.get_user_company_id() and public.current_user_access_level() >= 2);

-- updated_at, the way the rest of the schema does it.
create or replace function public.company_meetings_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists company_meetings_touch_trg on public.company_meetings;
create trigger company_meetings_touch_trg
  before update on public.company_meetings
  for each row execute function public.company_meetings_touch();
