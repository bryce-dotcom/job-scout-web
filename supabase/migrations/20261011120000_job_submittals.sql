-- Submittals that never touched JobScout.
--
-- Alayda (2026-10-10, filed from /admin/eos): "Some submittals aren't done
-- through the system, I am trying to accuratley track the numbers, can you
-- create a button that shows when we submit a job outside of the system."
--
-- The Scorecard's "Submittals Sent" counts file_attachments with
-- photo_context 'submittal'. That works — 28 of them for HHH — but a package
-- emailed straight to a GC, uploaded to their portal or handed over on site
-- never creates an attachment, so the number is quietly low and the person
-- trying to run the business on it cannot tell by how much.
--
-- This records the EVENT rather than a file: the job, the day it went out and
-- how. src/lib/submittals is the counting rule, and it folds a logged event
-- into an attachment for the same job on the same day so a submittal recorded
-- both ways counts once.
--
-- submitted_at is a DATE, not a timestamp. It is the day somebody says the
-- package went out, often typed in days later, and giving it a clock would
-- invite the timezone bug that misfiled every 1st-of-month row in Books.

create table if not exists job_submittals (
  id          bigserial primary key,
  company_id  integer not null,
  job_id      integer not null,
  submitted_at date   not null,
  method      text    not null default 'other',
  recipient   text,
  note        text,
  employee_id integer,
  created_at  timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'job_submittals'::regclass and conname = 'job_submittals_method_chk'
  ) then
    alter table job_submittals add constraint job_submittals_method_chk
      check (method in ('email', 'portal', 'in_person', 'mail', 'other'));
  end if;
end $$;

-- The scorecard reads a company's rows for a date window; the job page reads
-- one job's.
create index if not exists job_submittals_company_date_idx
  on job_submittals (company_id, submitted_at desc);
create index if not exists job_submittals_job_idx
  on job_submittals (job_id);

-- One log per job per day. A second tap on the button is the same submittal,
-- and the counting rule already folds duplicates — but letting them into the
-- table would leave the job page showing a submittal twice.
create unique index if not exists job_submittals_job_day_uniq
  on job_submittals (job_id, submitted_at);

comment on table job_submittals is
  'A submittal that went out some way other than through JobScout. Counted alongside file_attachments(photo_context=submittal) by src/lib/submittals.';
comment on column job_submittals.submitted_at is
  'The calendar DAY it went out. Deliberately a date — see src/lib/localDate for why a day wearing a timestamp misfiles itself.';

-- Same tenant isolation as every other table here.
alter table job_submittals enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'job_submittals' and policyname = 'tenant_isolation') then
    create policy tenant_isolation on job_submittals
      for all to authenticated
      using (company_id in (select current_user_company_ids()))
      with check (company_id in (select current_user_company_ids()));
  end if;
end $$;
