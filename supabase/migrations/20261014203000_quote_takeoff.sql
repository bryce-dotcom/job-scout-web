-- The takeoff an estimate was built from, kept on the estimate.
--
-- Cole's flow (Arnie & Jenny plan, phase 1-2): Jenny builds the estimate from
-- a spoken takeoff by the company's estimating playbook, then TrakSmart gives
-- the real SRP rebate and the GMs have to be redone to fit it. Redoing them
-- needs to know which fixtures were on a lift and how each one mounts — the
-- takeoff, not the price lines. Shape:
--   { "playbook": "energy_scout_lighting", "state": "AZ", "items": [ ... ] }
-- Null for every estimate not built from a takeoff.
alter table public.quotes add column if not exists takeoff jsonb;

comment on column public.quotes.takeoff is
  'The site takeoff this estimate was built from by an estimating playbook (_shared/lightingPlaybook.ts): {playbook, state, items}. Used to redo the GMs when the real utility rebate arrives. Null when not built from a takeoff.';
