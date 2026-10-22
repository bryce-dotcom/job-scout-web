-- Keep Arnie on the best model, automatically (Bryce, 2026-10-22: "how do we
-- keep arnie on the best ai possible, set up a routine or something that
-- checks and autoupdates").
--
-- arnie_model_state is the ONE row Arnie reads for his model (liveArnieModel,
-- cached five minutes; the code's ARNIE_MODEL if it is missing). The weekly
-- model watch writes it when a newer model passes the eval at least as well
-- and costs no more than 30% extra — no deploy — and keeps the previous model
-- for an instant rollback.
--
-- arnie_model_trials is every model it tried, with the eval and the cost,
-- so a model is tried once, not every week, and the decision can be read
-- back.
--
-- Service key only; RLS on, no policies.
create table if not exists public.arnie_model_state (
  id int primary key default 1 check (id = 1),
  model text not null,
  previous_model text,
  changed_at timestamptz not null default now(),
  reason text
);
insert into public.arnie_model_state (id, model, reason)
values (1, 'claude-sonnet-5-5', 'Set by hand 2026-10-21 after the Sonnet 4.5 / 5.5 / Opus 5.5 comparison (79/80).')
on conflict (id) do nothing;
alter table public.arnie_model_state enable row level security;

create table if not exists public.arnie_model_trials (
  id bigserial primary key,
  model text not null,
  ran_at timestamptz not null default now(),
  passed int,
  total int,
  cost_per_call numeric,
  baseline_model text,
  baseline_passed int,
  baseline_total int,
  baseline_cost_per_call numeric,
  decision text not null,      -- switched | kept | not_priced | failed
  note text
);
create index if not exists arnie_model_trials_model on public.arnie_model_trials (model);
alter table public.arnie_model_trials enable row level security;
