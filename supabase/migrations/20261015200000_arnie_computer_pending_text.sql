-- The text Arnie types, handed to the agent ONCE and then gone.
--
-- Typing never worked. arnie-computer deliberately kept the value out of
-- arnie_computer_actions (an audit table has no business holding what somebody
-- typed into a box — it stores the length), but nothing else carried it either,
-- so every 'type' reached the agent with no text, typed nothing, and reported
-- success. Found live on Bryce's PC, 2026-10-15.
--
-- So the text lives here, apart from the log: written when the action is asked
-- for, read and DELETED by the server in the same breath it hands the action to
-- the agent, and swept if never collected. RLS on with no policy at all — only
-- the service role (the arnie-computer function) can see a row; no browser,
-- no admin screen, no select('*') anywhere.
create table if not exists public.arnie_computer_pending_text (
  action_id   bigint primary key references public.arnie_computer_actions(id) on delete cascade,
  company_id  bigint not null,
  employee_id bigint not null,
  value       text not null,
  created_at  timestamptz not null default now()
);

alter table public.arnie_computer_pending_text enable row level security;
revoke all on public.arnie_computer_pending_text from anon, authenticated;

comment on table public.arnie_computer_pending_text is
  'Text for a queued type action, until the agent collects it (then deleted). Service role only.';
