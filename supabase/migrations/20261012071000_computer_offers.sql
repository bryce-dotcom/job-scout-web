-- =====================================================================
-- "Arnie offers, you accept."
--
-- Everything needed to put Arnie's hands on a computer was built and tested —
-- the rail, the leash, the agent, the recorder, the audit — and then nothing
-- ever queued an action, because the only way to let him touch a program was
-- to go to a settings page and fill in a form: program name, site, tier. A
-- person reading "allow chrome on rockymountainpower.net — watch, click or
-- full?" out of context cannot weigh that question. So nobody answered it,
-- and a finished feature sat unreachable.
--
-- The fix is not a better form. It is to ask at the moment the answer is
-- obvious: he says what he wants to do and what he needs for it, together, and
-- accepting is one tap.
--
--   needs_grant   he has NO permission for this program and is asking for it.
--                 Distinct from 'refused' because it is a question, and from
--                 'needs_approval' because answering yes has to WRITE
--                 something rather than just unblock a row.
--   wants_tier    the narrowest tier that can do the action he asked for.
--                 Stored so accepting cannot quietly widen into access the
--                 job never needed.
--
-- It expires like an approval does: an offer made by a 7am routine and
-- accepted at 6pm would open a program for a job that finished hours ago.
-- =====================================================================

alter table public.arnie_computer_actions
  add column if not exists wants_tier text
    check (wants_tier is null or wants_tier in ('watch', 'click', 'full'));

do $$ begin
  alter table public.arnie_computer_actions drop constraint if exists arnie_computer_actions_decision_check;
  alter table public.arnie_computer_actions add constraint arnie_computer_actions_decision_check
    check (decision in (
      'queued', 'allowed', 'refused', 'awaiting_human',
      'needs_approval', 'needs_grant', 'failed', 'expired'));
end $$;

-- The badge and the offer list both ask "what is waiting on this person", and
-- that is now three decisions rather than two.
create index if not exists arnie_computer_actions_waiting_idx
  on public.arnie_computer_actions (employee_id, decision)
  where decision in ('needs_approval', 'needs_grant', 'awaiting_human');

-- ── and the grant has to say which action spent it ────────────────────
--
-- A 'once' grant is spent by the server the instant it queues the action it
-- was given for. The agent then re-checks the leash on its own machine a
-- second later, saw a grant already marked consumed, and refused the very
-- action it had just been allowed to do. "Allow once" could not run anything
-- at all — and it is the default on every offer, so nothing could.
--
-- Recording which action spent it fixes that without softening anything: the
-- agent is holding exactly one action and knows its id, so a spent grant is
-- live for that action and for nothing else. A server trying to reuse the
-- permission for a second action is still refused on the machine, which is
-- exactly what that local check exists to do.
alter table public.arnie_computer_grants
  add column if not exists consumed_by bigint references public.arnie_computer_actions(id) on delete set null;
