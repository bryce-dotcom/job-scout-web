-- =====================================================================
-- What the machine at the other end can actually do.
--
-- A session recorded the device, the platform and the agent version — and
-- nothing about what that agent is able to do on that computer. On Windows
-- that gap is invisible because everything works. On a Mac it is the whole
-- story: watching a screen needs Screen Recording, Accessibility and Input
-- Monitoring, which are switches only the person can flip in System
-- Settings, and until they do, a recording comes back empty.
--
-- The agent has always known this and said so — in the terminal window, once,
-- at startup, which is the one place nobody is looking when they later
-- wonder why teaching did not work. Now it says it to the server too, and the
-- Computer tab can tell them.
--
-- Shape-checked on the way in rather than trusted: it arrives from a program
-- running on somebody else's computer.
-- =====================================================================

alter table public.arnie_computer_sessions
  add column if not exists capabilities jsonb;

comment on column public.arnie_computer_sessions.capabilities is
  'What the agent reported it can do: { perform, record, notes[] }. Null from agents older than 0.4.0.';
