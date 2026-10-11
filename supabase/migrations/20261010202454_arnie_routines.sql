-- =====================================================================
-- arnie_routines: standing work Arnie does on a schedule, per person.
--
-- Bryce, 2026-10-10, after a rep taught a general agent to run his morning
-- checks: "I want Arnie to be able to do that same thing for users." The two
-- routines that rep built are the shape of it — a morning Lead Setter check
-- on weekdays, and a daily JobScout refresh — each one a question asked on a
-- schedule with the answer delivered where he reads it.
--
-- So a routine is, for now, a PROMPT plus a WHEN plus a WHERE-TO-SEND. It runs
-- through the same Arnie as everything else (runArnieTurn → arnie-chat), with
-- the same tools, the same money gates and the same propose → approve rails,
-- as the employee it belongs to. It can read; anything it would change comes
-- back as a card for a person to approve, exactly as if they had asked.
--
-- `steps` is deliberately here and deliberately null for every row today. When
-- a routine can also drive an outside tool — the SRP portal, a supplier site —
-- those steps land in this column and the engine gains a second kind of step.
-- The table should not need changing for that.
--
-- OWNERSHIP, which is the part worth being careful about: a routine belongs to
-- an EMPLOYEE, because it runs with that person's access and answers from what
-- they are allowed to see. But it is also company knowledge — when somebody
-- works out the right morning check, everyone should be able to have it — so
-- `shared` marks one the rest of the company may copy. The credential-shaped
-- things stay personal; the know-how does not.
--
-- Run hourly by a Vercel cron with the service role key (api/cron/), the same
-- way the morning brief is, and for the same reason: 20260821120000 records a
-- pg_cron job that failed silently for two months and left 835 estimates
-- unchased. A cron where a non-2xx is visible.
-- =====================================================================

create table if not exists public.arnie_routines (
  id             serial primary key,
  company_id     integer not null references public.companies(id) on delete cascade,
  employee_id    integer not null references public.employees(id) on delete cascade,
  name           text not null,
  -- What to ask Arnie, in the words the person would use.
  prompt         text not null,
  enabled        boolean not null default true,
  channel        text not null default 'app' check (channel in ('app', 'sms', 'email')),
  hour_local     integer not null default 7 check (hour_local between 0 and 23),
  timezone       text not null default 'America/Denver',
  weekdays_only  boolean not null default true,
  -- Company know-how: another employee may copy a shared routine as their own.
  shared         boolean not null default false,
  -- The outside-tool half, when there is one. Null for every row today.
  steps          jsonb,
  last_run_on    date,
  last_result    text,
  last_error     text,
  created_by     integer references public.employees(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- One person should not quietly end up with the same routine twice.
create unique index if not exists arnie_routines_one_name_per_person_idx
  on public.arnie_routines (employee_id, lower(name));

create index if not exists arnie_routines_due_idx
  on public.arnie_routines (enabled, hour_local) where enabled;

alter table public.arnie_routines enable row level security;

do $$ begin
  create policy tenant_isolation on public.arnie_routines
    for all to authenticated
    using (company_id in (select public.current_user_company_ids()))
    with check (company_id in (select public.current_user_company_ids()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy service_role_all on public.arnie_routines
    for all to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;
