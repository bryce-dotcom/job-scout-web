-- How urgent a job is, and how many times we have finished one for a customer.
--
-- Bryce (2026-10-12): "on jobs and on the job board we want that… the level of
-- importance/urgent/priority… like a 1-5, five being the highest level."
--
-- 1. jobs.priority
--
-- Nullable, and normal is stored as NULL rather than 3. Two reasons: nothing
-- has to be backfilled across 7,171 HHH rows, and the column honestly says
-- "nobody has decided" instead of claiming every job was assessed and found
-- average. src/lib/jobPriority reads NULL as normal and draws no badge.
--
-- 2. customer_completed_job_counts()
--
-- Counting finished jobs cannot be done from the app's job store, and cannot
-- be done from jobs.status either. Archiving OVERWRITES status with
-- 'Archived', and on HHH 6,197 of 7,171 jobs are archived — 5,871 of which
-- still carry a completed_at. Counting delivered status alone reads 469
-- instead of ~6,463 and tells almost every repeat customer they are new.
-- Neither signal is complete on its own: 171 HHH jobs sit in a delivered
-- status with no completed_at. So it is a delivered status OR a completed_at.
--
-- The function groups server side because the alternative is pulling six
-- thousand rows into a browser to count them, and PostgREST caps a response
-- at 1000 rows regardless of what the client asks for.

alter table jobs add column if not exists priority smallint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'jobs'::regclass and conname = 'jobs_priority_chk'
  ) then
    alter table jobs add constraint jobs_priority_chk
      check (priority is null or (priority between 1 and 5));
  end if;
end $$;

comment on column jobs.priority is
  '1-5, 5 highest. NULL means normal and renders no badge — see src/lib/jobPriority.';

-- Partial: only the jobs that are not normal are ever looked up by priority,
-- and on a healthy board that is a handful out of thousands.
create index if not exists jobs_company_priority_idx
  on jobs (company_id, priority desc)
  where priority is not null;

-- Which delivered statuses count is the CALLER's business: job statuses are
-- per-company (settings.job_statuses, category 'delivered'), and
-- src/lib/jobMetrics#getDeliveredStatusIds is the one rule that resolves them.
-- Passing them in keeps that rule in one place instead of forking a copy here.
--
-- SECURITY INVOKER (the default) on purpose: it reads `jobs` as the caller, so
-- the table's own RLS policy decides what they may count. The company_id
-- filter is belt and braces.
create or replace function customer_completed_job_counts(
  p_company_id integer,
  p_customer_ids integer[],
  p_delivered_statuses text[]
)
returns table (customer_id integer, completed_count bigint)
language sql
stable
as $$
  select j.customer_id, count(*)::bigint
  from jobs j
  where j.company_id = p_company_id
    and j.customer_id = any(p_customer_ids)
    and (
      j.completed_at is not null
      or (p_delivered_statuses is not null and j.status = any(p_delivered_statuses))
    )
  group by j.customer_id
$$;

comment on function customer_completed_job_counts(integer, integer[], text[]) is
  'Completed jobs per customer. Finished means a delivered status OR a completed_at, because archiving overwrites status — see src/lib/customerRepeat.';

grant execute on function customer_completed_job_counts(integer, integer[], text[]) to authenticated;
