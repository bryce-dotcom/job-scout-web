-- The next visit to the same property has the same pieces of work.
--
-- Antonino Lawn Care (5d1d5bc1): "we have to mow edge trim and blow a 16 acre
-- property which sometimes it hard to keep track... have my guys start a
-- tracker that they can mark where and what they have done." Job sections are
-- that tracker — but spawn_next_recurring_job copied only the jobs row, so
-- every spawned visit arrived with none. On a weekly mow that means typing
-- the same five zones in again every week, which is the same as not having
-- the feature: 94 of Antonino's 207 jobs are recurring.
--
-- So the new visit inherits the shape of the work: the names, the order, the
-- share of the job, the estimate, and who does each piece. What it does not
-- inherit is anything that describes the visit that just finished — status
-- starts at Not Started, and the hours, dates and verification are cleared.

create or replace function public.copy_sections_to_spawned_job()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.source_system is distinct from 'recurrence_spawn' or new.recurrence_parent_id is null then
    return new;
  end if;

  -- The visit this one was spawned from: the most recent sibling in the chain
  -- (or the root itself) that actually has sections to copy.
  insert into public.job_sections (
    company_id, job_id, name, description, sort_order, percent_of_job,
    estimated_hours, assigned_to, status
  )
  select s.company_id, new.id, s.name, s.description, s.sort_order, s.percent_of_job,
         s.estimated_hours, s.assigned_to, 'Not Started'
    from public.job_sections s
   where s.job_id = (
     select j.id from public.jobs j
      where j.company_id = new.company_id
        and j.id <> new.id
        and (j.id = new.recurrence_parent_id or j.recurrence_parent_id = new.recurrence_parent_id)
        and exists (select 1 from public.job_sections x where x.job_id = j.id)
      order by j.created_at desc
      limit 1
   )
   order by s.sort_order;

  return new;
end $$;

drop trigger if exists jobs_copy_sections_on_spawn on public.jobs;
create trigger jobs_copy_sections_on_spawn
  after insert on public.jobs
  for each row execute function public.copy_sections_to_spawned_job();
