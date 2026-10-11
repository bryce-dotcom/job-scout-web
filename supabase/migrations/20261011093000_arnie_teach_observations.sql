-- =====================================================================
-- Teach a task: what the recorder saw.
--
-- A demonstration is not a video. It is a list of OBSERVATIONS — at this
-- moment, in this program, the person clicked here / typed this many
-- characters — each with a screenshot of what was on screen at the time.
-- Arnie then reads those screenshots and writes the steps in English, which
-- the person corrects before the skill is ever used on a real customer.
--
-- WHY A SEPARATE TABLE AND NOT A jsonb ON THE SKILL. A ten-minute recording
-- is hundreds of rows arriving one at a time from a laptop over a slow link.
-- Appending to a jsonb column means read-modify-write on every observation,
-- which loses events the moment two arrive together, and makes a partial
-- recording indistinguishable from a complete one. Rows arrive independently,
-- carry their own sequence, and a recording that stops halfway is still
-- honestly half a recording.
--
-- WHAT IS DELIBERATELY NOT HERE: the text somebody typed. The recorder counts
-- characters and never keeps them. A demonstration runs through real screens
-- with real customers on them, and the one thing worse than a brittle step
-- list is a step list with somebody's data in it. The screenshots are the
-- exception and they are the reason the bucket is private and the paths are
-- never public — see the storage policy below.
--
-- NOTHING IS RECORDED WHILE ARNIE IS WAITING ON A HANDOFF. The agent stops
-- the recorder when it sees an awaiting_human action and starts it again
-- afterwards, so a password typed during a demonstration cannot reach a
-- screenshot. That rule lives in the agent, where the screen is, and the
-- `paused` flag here is how the gap is made visible rather than silent.
-- =====================================================================

create table if not exists public.arnie_skill_observations (
  id             bigserial primary key,
  company_id     integer not null references public.companies(id) on delete cascade,
  skill_id       bigint not null references public.arnie_skills(id) on delete cascade,
  -- The agent's own counter. Rows arrive out of order over a slow link and
  -- the ORDER is the whole meaning of a demonstration, so it is carried, not
  -- inferred from arrival time.
  seq            integer not null,
  at             timestamptz not null default now(),
  -- What was in front. The single most useful thing for reconstructing a
  -- workflow, and the only one the machine can always answer.
  app            text,
  window_title   text,
  -- 'click' | 'double_click' | 'right_click' | 'type' | 'key' | 'scroll'
  -- | 'app_change' | 'paused' | 'resumed'
  kind           text not null,
  x              integer,
  y              integer,
  -- How much was typed, never what. See the header.
  text_length    integer,
  key_name       text,
  -- Private bucket path. Null when the shot could not be taken, which is
  -- normal and must not lose the observation.
  shot_path      text,
  created_at     timestamptz not null default now()
);

create unique index if not exists arnie_skill_observations_seq_idx
  on public.arnie_skill_observations (skill_id, seq);

create index if not exists arnie_skill_observations_skill_idx
  on public.arnie_skill_observations (skill_id, seq);

-- How long the recorder may run, and when it started. Ten minutes, the same
-- ceiling Grok uses, for the same reason: a demonstration longer than that is
-- two skills that have not been separated yet.
alter table public.arnie_skills
  add column if not exists recording_started_at timestamptz,
  add column if not exists recording_device text,
  -- What Arnie made of it, kept beside the steps so a person reviewing the
  -- draft can see what he was unsure about rather than only what he decided.
  add column if not exists draft_notes text;

alter table public.arnie_skill_observations enable row level security;

do $$ begin
  create policy tenant_isolation on public.arnie_skill_observations
    for all to authenticated
    using (company_id in (select public.current_user_company_ids()))
    with check (company_id in (select public.current_user_company_ids()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy service_role_all on public.arnie_skill_observations
    for all to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;
