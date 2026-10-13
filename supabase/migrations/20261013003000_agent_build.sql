-- Which BUILD of the agent is on that machine, not just which version number.
--
-- A version only changes when somebody remembers to change it, and somebody
-- did not: a build with eyes and a build without both reported "0.4.0". A
-- person was running the old one, allowed a screenshot, and it completed with
-- no picture — with nothing anywhere able to say why. This is a hash of the
-- agent's own sources, so it cannot be forgotten.
alter table public.arnie_computer_sessions
  add column if not exists agent_build text;
