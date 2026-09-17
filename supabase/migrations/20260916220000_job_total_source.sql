-- =====================================================================
-- jobs.job_total_source — who owns a job's total: its lines, or a person.
--
-- JobDetail keeps job_total in step with the job's line items whenever it
-- has any. Good for a job priced from its lines; ruinous for a job whose
-- total no line ever produced — a HouseCall import, a job booked with a
-- price and no itemisation, a demo job. 6,025 of HHH's 6,470 priced jobs
-- have no lines at all (4,556 booked directly, 1,468 HouseCall imports,
-- 165 of them open today). Add one $165 part to any of them and the total
-- became $165 (demo job 23513, 16 Sep 2026; HHH's audit log shows the same
-- collapse fourteen times this year).
--
-- 'lines'  — the lines produced this total; keep it in step with them.
-- 'manual' — a person, an import or an estimate summary set it; lines
--            added later are additions to look at, never a replacement.
-- NULL     — unknown (legacy): behaves as before.
-- Bryce, 16 Sep: "stop the sync from replacing a total no line produced".
-- =====================================================================

alter table public.jobs
  add column if not exists job_total_source text
    check (job_total_source in ('lines', 'manual'));

comment on column public.jobs.job_total_source is
  'Who owns job_total: lines (kept in step with job_lines) or manual (set by a person/import/estimate summary; lines added later never replace it). NULL = legacy, synced from lines when they differ.';

-- Backfill from the evidence: a priced job with no lines has a total no line
-- produced; a job whose lines already sum to its total is line-owned.
-- Row triggers (audit_log, party sync, status caches) are switched off for
-- the backfill: 6,500 rows of "job_total_source: null → manual" is not a
-- history anyone wants, and nothing else about the rows changes. The file
-- runs in one transaction, so a failure re-enables them by rolling back.
alter table public.jobs disable trigger user;

update public.jobs j
   set job_total_source = 'manual'
 where j.job_total_source is null
   and coalesce(j.job_total, 0) > 0
   and not exists (select 1 from public.job_lines l where l.job_id = j.id);

update public.jobs j
   set job_total_source = 'lines'
  from (select job_id, sum(coalesce(total, 0)) as lines_total from public.job_lines group by job_id) s
 where s.job_id = j.id
   and j.job_total_source is null
   and abs(s.lines_total - coalesce(j.job_total, 0)) <= 0.5;

alter table public.jobs enable trigger user;
