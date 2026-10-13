-- Why a location fix was taken.
--
-- HR went looking for where a tech had been and found "the pings are sparse,
-- I can't really tell where he is" (Bryce, 13 Oct 2026). Part of that is how
-- few fixes a phone in a pocket produces — a browser suspends the 15-minute
-- timer the moment the app sleeps, so a field tech averages about five a
-- shift against an office worker's hundred-plus.
--
-- The app can still take a fix whenever somebody actually does something in
-- it: starting a job, finishing one, adding a photo, running a Victor check,
-- collecting payment. Those are the minutes worth knowing about anyway. This
-- column says which of those a dot was, so the trail reads as a story rather
-- than confetti: "Started the job 8:12, photo 9:40, completed 11:05".
--
-- Null for everything recorded before today, which is simply unknown.

alter table public.location_pings
  add column if not exists reason text;

comment on column public.location_pings.reason is
  'What the employee was doing when this fix was taken - lib/locationPing PING_REASONS (interval, resume, clock_in, clock_out, job_start, job_complete, photo, verification, payment). Null on rows recorded before 2026-10-13.';
