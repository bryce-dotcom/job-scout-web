-- =====================================================================
-- Arnie's UI, the parts that need tables: skills, rules, and an expiry.
--
-- Three things, all of them lifted from reading xAI's own documentation for
-- Grok Bot rather than guessing at it (ARNIE_UI_PLAN.md records the findings).
--
-- 1. SKILL IS NOT ROUTINE.
--    Their split is the right one and ours conflated the two. A *skill* is the
--    method — what it is for, the steps, how to tell it worked, what needs
--    approval — and it is company know-how. A *routine* says when one person's
--    Arnie runs something. arnie_routines.steps was carrying both.
--
--    This matters beyond tidiness: "the steps are shared, the login never is"
--    is the whole per-user story, and it should be true in the schema rather
--    than true by convention. A skill has no credentials in it and is shared;
--    a session and a grant belong to one employee and are not.
--
--    arnie_routines.steps stays, deprecated, until the routines that might be
--    using it are migrated. It is null on every row today, so nothing breaks
--    either way — but a column read by an older deploy must not vanish under
--    it.
--
-- 2. A TAUGHT SKILL IS A DRAFT.
--    Their docs are blunt: "a taught skill is not production-ready until you
--    add its approval boundaries", because one demonstration cannot reveal the
--    decision rules, the failure handling or what needs a human. So `status`
--    starts at 'recording', becomes 'draft', and only a person moves it to
--    'published'.
--
--    DECIDED, because it changes this table: the TEACHER publishes their own
--    skill, and `shared` is false until they say otherwise. An Admin can
--    archive one but does not have to approve it first. The reason to prefer
--    this over an admin gate: a taught skill can embed one customer's premise
--    number or one rep's own account quirk, and the person who recorded it is
--    the only one who can see that. An admin reviewing a step list they did
--    not record would be rubber-stamping.
--
-- 3. A BACKGROUND APPROVAL HAS TO EXPIRE.
--    Theirs expire in about ten minutes and the card reads Expired. We had no
--    expiry at all, which means a routine could queue an action at 7am and
--    have it approved at 6pm by somebody clearing a backlog. That is not the
--    thing anybody agreed to. An action a person asked for in a conversation
--    waits as long as they like; one raised by standing work does not.
-- =====================================================================

-- ── A method, taught once, owned by the company ──────────────────────────
create table if not exists public.arnie_skills (
  id             bigserial primary key,
  company_id     integer not null references public.companies(id) on delete cascade,
  -- Who taught it. Kept for the audit trail and because they are the only
  -- person who may publish it.
  employee_id    integer not null references public.employees(id) on delete cascade,
  name           text not null,
  -- What the person said they were about to demonstrate, before they did it.
  -- Grok asks for this first for a good reason: the recording shows WHAT was
  -- clicked and never WHY, and the outcome is the only statement of intent.
  outcome        text,
  status         text not null default 'recording'
                   check (status in ('recording', 'draft', 'published', 'archived')),
  -- The action stream, reviewed and corrected in English before it is used.
  steps          jsonb,
  -- Notes a person added that the demonstration could not show: the decision
  -- rules, what to do when a step misses, what must never be automatic.
  rules          text,
  -- Company know-how, but not until the teacher says so.
  shared         boolean not null default false,
  recorded_at    timestamptz,
  published_at   timestamptz,
  published_by   integer references public.employees(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create unique index if not exists arnie_skills_one_name_per_person_idx
  on public.arnie_skills (employee_id, lower(name)) where status <> 'archived';

create index if not exists arnie_skills_shared_idx
  on public.arnie_skills (company_id, status) where shared and status = 'published';

-- Only one recording at a time per person: two overlapping recordings would
-- interleave each other's clicks into both step lists.
create unique index if not exists arnie_skills_one_recording_idx
  on public.arnie_skills (employee_id) where status = 'recording';

-- ── A routine may now run a skill ────────────────────────────────────────
alter table public.arnie_routines
  add column if not exists skill_id bigint references public.arnie_skills(id) on delete set null;

comment on column public.arnie_routines.steps is
  'DEPRECATED 2026-10-10: a taught workflow lives in arnie_skills.steps and is referenced by skill_id. Null on every row; kept so an older deploy reading it does not break.';

-- ── Rules a person writes, on top of the leash ───────────────────────────
-- The leash (_shared/computerGrants.ts) is the floor and cannot be loosened by
-- anything here. These sit on top of it, as Grok's Auto-review rules do.
create table if not exists public.arnie_computer_rules (
  id             bigserial primary key,
  company_id     integer not null references public.companies(id) on delete cascade,
  -- NULL means a company rule, set by an Admin and not editable by the person.
  -- A row with an employee_id is that person's own.
  employee_id    integer references public.employees(id) on delete cascade,
  -- 'ask_first' always stops for approval. 'allow_auto' lets it through unless
  -- something else stops it. When both match, ask_first wins — their conflict
  -- rule, and the right way round: a person's own rules may only ever make
  -- behaviour STRICTER than the company's, never looser.
  kind           text not null check (kind in ('ask_first', 'allow_auto')),
  -- What it matches. Any of app / host / action_kind; absent means any.
  app            text,
  host           text,
  action_kind    text,
  note           text,
  created_by     integer references public.employees(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists arnie_computer_rules_lookup_idx
  on public.arnie_computer_rules (company_id, employee_id, kind);

-- ── An approval that nobody answers ──────────────────────────────────────
alter table public.arnie_computer_actions
  add column if not exists expires_at timestamptz;

-- Two more decisions, and they are NOT the same thing:
--
--   awaiting_human  Arnie will never do this one. A password box, a Submit
--                   button. There is no approval that changes it, so this is
--                   not a question and it cannot expire — it is an instruction
--                   to the person.
--   needs_approval  He may do it, once somebody says yes to this particular
--                   action. Raised by an ask_first rule. THIS is the one that
--                   expires.
--   expired         Nobody answered in time. The action did not run.
--
-- Collapsing the first two into one value would make "approve" a button that
-- sometimes types a password, which is the one thing this whole feature
-- promises never to do.
do $$ begin
  alter table public.arnie_computer_actions drop constraint if exists arnie_computer_actions_decision_check;
  alter table public.arnie_computer_actions add constraint arnie_computer_actions_decision_check
    check (decision in ('queued', 'allowed', 'refused', 'awaiting_human', 'needs_approval', 'failed', 'expired'));
end $$;

create index if not exists arnie_computer_actions_expiring_idx
  on public.arnie_computer_actions (expires_at)
  where decision = 'needs_approval' and expires_at is not null;

-- ── RLS ──────────────────────────────────────────────────────────────────
alter table public.arnie_skills         enable row level security;
alter table public.arnie_computer_rules enable row level security;

do $$ begin
  create policy tenant_isolation on public.arnie_skills
    for all to authenticated
    using (company_id in (select public.current_user_company_ids()))
    with check (company_id in (select public.current_user_company_ids()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy service_role_all on public.arnie_skills
    for all to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy tenant_isolation on public.arnie_computer_rules
    for all to authenticated
    using (company_id in (select public.current_user_company_ids()))
    with check (company_id in (select public.current_user_company_ids()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy service_role_all on public.arnie_computer_rules
    for all to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;
