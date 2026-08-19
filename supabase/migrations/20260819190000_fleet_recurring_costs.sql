-- =====================================================================
-- Insurance, drivers, registration — the costs that arrive on a calendar.
--
-- Everything the fleet economics layer holds so far is an EVENT: a repair, a
-- tank of fuel, a set of tyres. Insurance and drivers are not events. They
-- arrive monthly or annually whether the machine turns a wheel or not, and
-- between them they are usually the second largest line in a fleet after
-- depreciation.
--
-- Two shapes, because both exist in real fleets and they behave differently:
--
--   PER UNIT     a policy or a driver attached to one machine. fleet_id set.
--                Exact, and the right answer when the business actually works
--                that way.
--
--   FLEET WIDE   one premium, one driver pool, covering everything.
--                fleet_id NULL, and the cost is allocated across assets.
--
-- Allocation is where this gets opinionated. Splitting a blanket policy evenly
-- across units is the obvious choice and usually the wrong one: an $83,000
-- truck and a $4,000 utility trailer do not represent the same risk, and
-- charging them the same premium makes the trailer look expensive to own and
-- the truck cheap. So the basis is explicit and stored per row — by value, by
-- usage, or evenly — and the person entering it chooses which reflects
-- reality. Evenly is offered because for driver pay it is often correct.
--
-- Periods carry effective dates rather than being edited in place. A premium
-- that goes up in March must not retroactively rewrite what the machine cost
-- to own in January; the lifecycle curve is built from history and would
-- quietly change shape.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.fleet_recurring_costs (
  id           bigserial PRIMARY KEY,
  company_id   integer NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- NULL means fleet-wide. The allocation columns below only apply then.
  fleet_id     integer REFERENCES public.fleet(id) ON DELETE CASCADE,

  cost_type    text NOT NULL
               CHECK (cost_type IN ('insurance','driver','registration','storage','licensing','telematics','other')),
  label        text,

  amount       numeric(12,2) NOT NULL CHECK (amount >= 0),
  -- Stored at the period it is actually billed at, not normalised on the way
  -- in. A user who pays $14,400 a year should see $14,400 a year on the
  -- screen they typed it into, and normalising at write time makes every
  -- later correction a puzzle.
  period       text NOT NULL DEFAULT 'monthly'
               CHECK (period IN ('weekly','monthly','quarterly','annual')),

  -- How a fleet-wide cost is spread. Ignored when fleet_id is set.
  --   even     equal share per asset. Right for a driver pool.
  --   value    proportional to what each machine is worth. Right for
  --            insurance — premium tracks replacement cost, not headcount.
  --   usage    proportional to hours or miles. Right for anything that
  --            accrues with use.
  allocation   text NOT NULL DEFAULT 'even'
               CHECK (allocation IN ('even','value','usage')),

  -- History rather than edit-in-place, so a rate change does not rewrite what
  -- ownership cost before it happened.
  effective_from date NOT NULL DEFAULT current_date,
  effective_to   date,

  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fleet_recurring_costs_dates CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX IF NOT EXISTS fleet_recurring_costs_company_idx
  ON public.fleet_recurring_costs (company_id, effective_from DESC);
CREATE INDEX IF NOT EXISTS fleet_recurring_costs_asset_idx
  ON public.fleet_recurring_costs (company_id, fleet_id)
  WHERE fleet_id IS NOT NULL;

COMMENT ON COLUMN public.fleet_recurring_costs.fleet_id IS
  'NULL = fleet-wide, spread across assets using `allocation`. Set = charged to that one asset.';
COMMENT ON COLUMN public.fleet_recurring_costs.allocation IS
  'Fleet-wide only. "value" suits insurance (premium tracks replacement cost); "even" suits a driver pool.';

ALTER TABLE public.fleet_recurring_costs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tenant_isolation ON public.fleet_recurring_costs
    FOR ALL TO authenticated
    USING (company_id in (select public.current_user_company_ids()))
    WITH CHECK (company_id in (select public.current_user_company_ids()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';
