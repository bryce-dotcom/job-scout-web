-- =====================================================================
-- Arnie On Your Computer — the permission spine.
--
-- Bryce, 2026-10-10: "arnie should be able to login to email accounts
-- calendars and do basically run your computer", after watching a rep teach a
-- general agent to drive his own machine — the SRP rebate portal, his mail,
-- the tools that have no API. Arnie already has the brain, the eyes (vision),
-- the approval rails and somewhere to keep a learned workflow
-- (arnie_routines.steps). What he has never had is hands.
--
-- These three tables are the hands' leash, and they are deliberately built
-- before the hands. This is the most powerful thing JobScout would ship: a
-- cloud brain acting on a customer's own computer. The permission model is not
-- a footnote on the feature, it IS the feature, so it exists first and
-- everything else has to ask it.
--
-- THE RULES THIS TABLE SET ENFORCES
--
--   1. A grant belongs to ONE EMPLOYEE. employee_id is NOT NULL and there is
--      no company-wide grant, by construction. Bryce, earlier the same day:
--      "if its able to read email and text it needs to be per user... only he
--      has credentials into SRP's online tool... we wouldnt want that kind of
--      access to be company wide." A company-level row is not something to be
--      discouraged in review; it is not representable.
--
--   2. Arnie never holds a credential. There is no password column here and
--      there is not meant to be one. He drives to a sign-in page and STOPS;
--      the person types their own password and clears their own 2FA; the
--      session lives in their own browser profile on their own machine. That
--      is why this needs no vault — and it is also why the per-user rule above
--      costs nothing to keep.
--
--   3. Tiers, because some programs should never be typeable. 'watch' can be
--      screenshotted and nothing more; 'click' can be clicked but not typed
--      into (a terminal or an IDE lives here — one click runs a build, one
--      stray keystroke rewrites a file); 'full' is unrestricted. Mirrors the
--      model Anthropic's own computer-use grants use, which is where the
--      shape is proven rather than guessed.
--
--   4. Every action is a row in arnie_computer_actions BEFORE it runs and is
--      stamped with what happened after. A refusal is as much a record as an
--      action — "Arnie tried to type into a password box" is exactly the line
--      an admin needs to be able to find.
--
-- The local agent enforces all of this too, on the machine, rather than
-- trusting the cloud to ask nicely: an agent that only obeyed the server would
-- do whatever a compromised server said. The server copy is the audit and the
-- second opinion. See _shared/computerGrants.ts, which is the one place the
-- decision is written, and which both sides import.
-- =====================================================================

-- ── A live agent on a machine ────────────────────────────────────────────
create table if not exists public.arnie_computer_sessions (
  id             bigserial primary key,
  company_id     integer not null references public.companies(id) on delete cascade,
  -- Whose machine. There is no session that is not a person's.
  employee_id    integer not null references public.employees(id) on delete cascade,
  -- What the person called this computer, for the audit trail: "Cole's laptop".
  device_label   text,
  platform       text,
  agent_version  text,
  -- The agent polls; this is how we know it is still there, and how the app
  -- can honestly say "Arnie is not on your computer right now" rather than
  -- queueing work into a void.
  last_seen_at   timestamptz not null default now(),
  started_at     timestamptz not null default now(),
  ended_at       timestamptz,
  -- 'live' | 'ended' | 'stopped'. 'stopped' is the kill switch: the person hit
  -- it, and nothing more runs on this session, ever. A new one must be started
  -- from the machine, by them.
  status         text not null default 'live' check (status in ('live', 'ended', 'stopped')),
  created_at     timestamptz not null default now()
);

create index if not exists arnie_computer_sessions_live_idx
  on public.arnie_computer_sessions (employee_id, status, last_seen_at desc);

-- ── What Arnie may touch, per person, per application ────────────────────
create table if not exists public.arnie_computer_grants (
  id             bigserial primary key,
  company_id     integer not null references public.companies(id) on delete cascade,
  -- NOT NULL, and no company-wide variant. See rule 1 in the header.
  employee_id    integer not null references public.employees(id) on delete cascade,
  -- The application, as the agent reports it: 'chrome', 'excel', 'outlook'.
  app            text not null,
  -- For a browser, the grant is per SITE as well as per app, because "Arnie
  -- may use Chrome" is not a thing anybody means. A host of '*' is the whole
  -- app and must be asked for explicitly.
  host           text not null default '*',
  tier           text not null default 'watch' check (tier in ('watch', 'click', 'full')),
  -- 'always' holds until revoked; 'once' is consumed by the next action that
  -- uses it, which is how "Allow once" stays honest.
  duration       text not null default 'always' check (duration in ('once', 'always')),
  -- Who said yes, and when it stops being true.
  granted_at     timestamptz not null default now(),
  expires_at     timestamptz,
  revoked_at     timestamptz,
  consumed_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- One standing grant per person per app+host. A second "always" for the same
-- target is an update, not another row, or revoking gets ambiguous.
create unique index if not exists arnie_computer_grants_one_standing_idx
  on public.arnie_computer_grants (employee_id, app, host)
  where duration = 'always' and revoked_at is null;

create index if not exists arnie_computer_grants_lookup_idx
  on public.arnie_computer_grants (employee_id, app) where revoked_at is null;

-- ── Every action, before and after ───────────────────────────────────────
create table if not exists public.arnie_computer_actions (
  id             bigserial primary key,
  company_id     integer not null references public.companies(id) on delete cascade,
  employee_id    integer not null references public.employees(id) on delete cascade,
  session_id     bigint references public.arnie_computer_sessions(id) on delete set null,
  -- When the action came from standing work rather than a live conversation.
  routine_id     integer references public.arnie_routines(id) on delete set null,
  kind           text not null check (kind in (
                   'screenshot', 'click', 'double_click', 'right_click',
                   'type', 'key', 'scroll', 'drag', 'launch', 'read_text')),
  app            text,
  host           text,
  -- What it was aimed at and with what — never a credential value. The server
  -- refuses to store one and the agent refuses to type one; see rule 2.
  target         jsonb,
  -- 'queued' → the agent has not taken it yet
  -- 'allowed' → the leash said yes and it ran
  -- 'refused' → the leash said no, with a reason, and nothing happened
  -- 'awaiting_human' → an irreversible control; a person must do it themselves
  -- 'failed' → it ran and the machine said no
  decision       text not null default 'queued' check (decision in (
                   'queued', 'allowed', 'refused', 'awaiting_human', 'failed')),
  -- Why it was refused, in words an admin reading the log can act on.
  reason         text,
  -- Storage paths, not images. A click that cannot be undone is photographed
  -- either side of itself.
  shot_before    text,
  shot_after     text,
  result         jsonb,
  created_at     timestamptz not null default now(),
  completed_at   timestamptz
);

create index if not exists arnie_computer_actions_session_idx
  on public.arnie_computer_actions (session_id, id);

create index if not exists arnie_computer_actions_audit_idx
  on public.arnie_computer_actions (company_id, created_at desc);

create index if not exists arnie_computer_actions_queue_idx
  on public.arnie_computer_actions (session_id, decision) where decision = 'queued';

-- ── RLS ──────────────────────────────────────────────────────────────────
-- Tenant isolation as everywhere else. Note what this does NOT do: it does not
-- stop one employee reading another's grants, because an Admin reviewing what
-- Arnie is allowed to do on the roster is a thing we want. The per-user rule
-- is about whose CREDENTIALS and whose MACHINE, and that is enforced by
-- employee_id on the grant and by the agent only ever running as its own
-- person — not by hiding rows.
alter table public.arnie_computer_sessions enable row level security;
alter table public.arnie_computer_grants   enable row level security;
alter table public.arnie_computer_actions  enable row level security;

do $$ begin
  create policy tenant_isolation on public.arnie_computer_sessions
    for all to authenticated
    using (company_id in (select public.current_user_company_ids()))
    with check (company_id in (select public.current_user_company_ids()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy service_role_all on public.arnie_computer_sessions
    for all to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy tenant_isolation on public.arnie_computer_grants
    for all to authenticated
    using (company_id in (select public.current_user_company_ids()))
    with check (company_id in (select public.current_user_company_ids()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy service_role_all on public.arnie_computer_grants
    for all to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy tenant_isolation on public.arnie_computer_actions
    for all to authenticated
    using (company_id in (select public.current_user_company_ids()))
    with check (company_id in (select public.current_user_company_ids()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy service_role_all on public.arnie_computer_actions
    for all to service_role using (true) with check (true);
exception when duplicate_object then null; end $$;
