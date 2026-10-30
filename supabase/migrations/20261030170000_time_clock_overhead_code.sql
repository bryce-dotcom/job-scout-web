-- A punch that is not charged to a job can now say what the work was:
-- Shop, Training, Meeting, Travel. The company defines its own list in
-- settings.time_clock_overhead_codes. The rule lives in src/lib/clockInJob.js
-- and its mirror supabase/functions/_shared/clockInRule.ts.
--
-- Why this exists: requiring a job at clock-in (2026-10-12) closed a real
-- leak — 530 of HHH's 1,513 September hours were landing on no job, so every
-- job margin read high, and hours parked off-job never count against the
-- allotment the efficiency bonus is measured against. But it left shop work
-- and crew meetings nowhere to go. Cameron, 2026-10-30: "I am no longer able
-- to clock into "General", this is helpful when working around the shop or
-- mounds meetings." A named code keeps the leak shut — the hours are
-- attributed and reportable instead of landing on nothing.
--
-- Why a column rather than the existing 'Overhead — ' prefix in notes: notes
-- is free text. Other paths append to it (FieldScout's "[WRONG JOB CORRECTED
-- …]") and Payroll's edit screen lets a person retype it, so it is fine as a
-- label and wrong as the key a report groups by. A column is also indexable,
-- which is what "overhead hours by code this period" needs.
--
-- Additive and nullable, so every existing row and every existing read is
-- unchanged. There is deliberately NO check constraint tying this to job_id:
-- the wrong-job correction sets job_id on an existing row, and a constraint
-- would turn that into a write failure. That path clears the code instead
-- (FieldScout), so the hours are not counted against both.
alter table public.time_clock add column if not exists overhead_code text;

comment on column public.time_clock.overhead_code is
  'Company-defined non-job work (Shop, Training, Meeting, Travel). Null means a job punch (job_id set) or a legacy untagged one. Cleared when a punch is moved onto a job.';

-- Reporting asks "the overhead hours in this period, by code".
create index if not exists time_clock_overhead_code_idx
  on public.time_clock (company_id, overhead_code, clock_in)
  where overhead_code is not null;
