-- =====================================================================
-- Fleet economics: what an asset costs to own, and when to let it go.
--
-- Freddy could say where a machine was and when its next PM fell due, but
-- nothing about whether owning it still made sense. The two biggest line
-- items in a fleet -- depreciation and utilisation -- had nowhere to live:
-- `fleet` carried no purchase price, no in-service date, no make/model, no
-- meter history. FreddyCosts read `purchase_price` and `current_value` off
-- rows that have never had those columns, so its TCO and fleet-value tiles
-- were arithmetic on undefined.
--
-- This adds the four things a replacement decision needs:
--   1. acquisition facts        -> columns on fleet
--   2. a real meter history     -> fleet_engine_events + fleet_meter_readings
--   3. a real cost history      -> fleet_repairs (repairs, tires, damage)
--   4. what it's worth today    -> fleet_valuations (shared, model-keyed)
--
-- RLS convention here is `company_id in (select current_user_company_ids())`.
-- belongs_to_company() was dropped from production; referencing it fails the
-- migration. fleet_valuations is deliberately NOT tenant-scoped -- see below.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Acquisition + identity on fleet
--
-- Nullable throughout on purpose. A tenant with 40 machines will not
-- backfill them by hand, so every consumer must treat these as optional and
-- degrade to "unknown" rather than to zero. A lifecycle bar that silently
-- reads a null purchase price as $0 is worse than no bar.
-- ---------------------------------------------------------------------
ALTER TABLE public.fleet ADD COLUMN IF NOT EXISTS purchase_price      numeric(12,2);
ALTER TABLE public.fleet ADD COLUMN IF NOT EXISTS purchase_date       date;
ALTER TABLE public.fleet ADD COLUMN IF NOT EXISTS hours_at_purchase   numeric(10,1);
ALTER TABLE public.fleet ADD COLUMN IF NOT EXISTS miles_at_purchase   numeric(12,1);
ALTER TABLE public.fleet ADD COLUMN IF NOT EXISTS make                text;
ALTER TABLE public.fleet ADD COLUMN IF NOT EXISTS model               text;
ALTER TABLE public.fleet ADD COLUMN IF NOT EXISTS model_year          integer;
ALTER TABLE public.fleet ADD COLUMN IF NOT EXISTS serial_vin          text;
ALTER TABLE public.fleet ADD COLUMN IF NOT EXISTS salvage_value       numeric(12,2);

-- The valuation join key. `fleet.type` is a free-text label users can set to
-- anything, so it can't key a shared price curve. asset_class is a closed
-- vocabulary; type stays as the human label.
--
-- Split on how value actually behaves: hour-metered iron depreciates on
-- hours, road vehicles on miles, and trailers barely depreciate at all.
ALTER TABLE public.fleet ADD COLUMN IF NOT EXISTS asset_class text;

DO $$ BEGIN
  ALTER TABLE public.fleet ADD CONSTRAINT fleet_asset_class_check CHECK (
    asset_class IS NULL OR asset_class IN (
      'skid_steer','excavator','mini_excavator','backhoe','track_loader',
      'wheel_loader','dozer','telehandler','boom_lift','scissor_lift',
      'dump_truck','box_truck','pickup','service_truck','van',
      'trailer','compactor','generator','attachment','other'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Whether this asset is valued and metered by hours or by miles. Derived from
-- asset_class on write, but stored so a user can override the odd case (a
-- pickup that lives on a job site and runs a PTO all day is an hours asset).
ALTER TABLE public.fleet ADD COLUMN IF NOT EXISTS meter_basis text;
DO $$ BEGIN
  ALTER TABLE public.fleet ADD CONSTRAINT fleet_meter_basis_check
    CHECK (meter_basis IS NULL OR meter_basis IN ('hours','miles'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON COLUMN public.fleet.hours_at_purchase IS
  'Meter reading when acquired. Used hours already spent are not this owner''s depreciation.';
COMMENT ON COLUMN public.fleet.asset_class IS
  'Closed vocabulary keying fleet_valuations. fleet.type stays the free-text human label.';

-- ---------------------------------------------------------------------
-- 2. Engine events -- the raw record hours are derived FROM
--
-- Watchdog's /engine_change_logs returns on/off events, not a cumulative
-- meter, and it returns only the most recent ~30. Anything not captured
-- before it rolls off is gone for good, so this table is the durable copy.
--
-- Storing raw events rather than only computed totals is the whole point:
-- when the hours maths turns out wrong -- and on the first pass at pairing
-- ignition events it will be -- it can be recomputed from source instead of
-- being permanently baked into a running total nobody can audit.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fleet_engine_events (
  id           bigserial PRIMARY KEY,
  company_id   integer NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  fleet_id     integer REFERENCES public.fleet(id) ON DELETE SET NULL,
  device_id    text    NOT NULL,
  external_id  text    NOT NULL,          -- provider's event id; the dedupe key
  engine_on    boolean NOT NULL,
  occurred_at  timestamptz NOT NULL,
  latitude     numeric(10,7),
  longitude    numeric(10,7),
  address      text,
  raw          jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Provider event ids are globally unique, so this both dedupes re-polls and
-- makes the sync safely re-runnable.
CREATE UNIQUE INDEX IF NOT EXISTS fleet_engine_events_natural_key
  ON public.fleet_engine_events (company_id, external_id);
CREATE INDEX IF NOT EXISTS fleet_engine_events_pairing_idx
  ON public.fleet_engine_events (company_id, device_id, occurred_at);

-- ---------------------------------------------------------------------
-- 3. Meter readings -- cumulative hours/miles over time
--
-- One row per asset per computation, holding CUMULATIVE totals. Deltas come
-- from differencing consecutive rows, which keeps "what does the meter read
-- right now" a single-row lookup instead of a sum over all history.
--
-- engine_hours and idle_hours are both cumulative and idle is a SUBSET of
-- engine: idle = engine-on time that no trip accounts for. Working hours are
-- engine_hours - idle_hours. Kept separate because idle is the number that
-- makes the lifecycle argument -- hours accrued while parked depreciate the
-- machine without earning anything.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fleet_meter_readings (
  id             bigserial PRIMARY KEY,
  company_id     integer NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  fleet_id       integer NOT NULL REFERENCES public.fleet(id) ON DELETE CASCADE,
  recorded_at    timestamptz NOT NULL,
  engine_hours   numeric(12,2),
  idle_hours     numeric(12,2),
  odometer_miles numeric(12,1),
  -- 'telematics' is derived from engine events / trips. 'manual' is a human
  -- reading the dash. 'maintenance' is a figure captured on a work order.
  -- A human reading always beats a derived one for the same instant: the
  -- meter on the machine is the thing buyers will look at.
  source         text NOT NULL DEFAULT 'telematics'
                 CHECK (source IN ('telematics','manual','maintenance','import')),
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS fleet_meter_readings_natural_key
  ON public.fleet_meter_readings (company_id, fleet_id, recorded_at, source);
CREATE INDEX IF NOT EXISTS fleet_meter_readings_latest_idx
  ON public.fleet_meter_readings (company_id, fleet_id, recorded_at DESC);

-- Current meter per asset, without every caller re-deriving "latest row".
CREATE OR REPLACE VIEW public.fleet_current_meters
  WITH (security_invoker = true) AS
  SELECT DISTINCT ON (r.company_id, r.fleet_id)
    r.company_id, r.fleet_id, r.recorded_at,
    r.engine_hours, r.idle_hours, r.odometer_miles, r.source,
    GREATEST(COALESCE(r.engine_hours,0) - COALESCE(r.idle_hours,0), 0) AS working_hours
  FROM public.fleet_meter_readings r
  ORDER BY r.company_id, r.fleet_id, r.recorded_at DESC;

GRANT SELECT ON public.fleet_current_meters TO authenticated;

-- ---------------------------------------------------------------------
-- 4. Repairs -- because a cost curve needs more than one repair per asset
--
-- Repairs currently live as four columns on `fleet`: repair_id, repair_date,
-- repair_cost, repair_description. One repair per vehicle, for its entire
-- life. Any curve built on that is fiction, and tires -- the fifth-largest
-- fleet expense -- have nowhere to go at all.
--
-- Separate from fleet_maintenance on purpose: scheduled PM is a predictable
-- cost of keeping an asset healthy, while repairs are the unplanned spend
-- that climbs as it ages. Averaging them together flattens exactly the
-- signal the replacement decision depends on.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fleet_repairs (
  id                 bigserial PRIMARY KEY,
  company_id         integer NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  fleet_id           integer NOT NULL REFERENCES public.fleet(id) ON DELETE CASCADE,
  repair_date        date NOT NULL,
  category           text NOT NULL DEFAULT 'repair'
                     CHECK (category IN ('repair','tires','damage','warranty','other')),
  description        text,
  cost               numeric(12,2),
  vendor             text,
  invoice_number     text,
  -- Meter readings at time of repair. Cost-per-hour curves need spend placed
  -- on the meter, not just on the calendar: two machines a year apart in age
  -- can be thousands of hours apart in wear.
  hours_at_repair    numeric(12,2),
  odometer_at_repair numeric(12,1),
  downtime_days      numeric(6,2),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fleet_repairs_asset_idx
  ON public.fleet_repairs (company_id, fleet_id, repair_date DESC);

-- Carry across whatever the single-repair columns hold, so the one repair
-- each asset was allowed to have isn't stranded. Guarded so re-running the
-- migration can't duplicate it.
INSERT INTO public.fleet_repairs (company_id, fleet_id, repair_date, description, cost, category)
SELECT f.company_id, f.id, f.repair_date, f.repair_description, f.repair_cost, 'repair'
  FROM public.fleet f
 WHERE f.repair_date IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.fleet_repairs r
      WHERE r.fleet_id = f.id AND r.repair_date = f.repair_date
   );

-- The legacy repair_* columns on fleet are intentionally left in place. Code
-- still reads them, and dropping them here would break FleetDetail before the
-- UI moves over. They become the migration's next step, not its problem.

-- ---------------------------------------------------------------------
-- 5. Valuations -- shared, model-keyed, deliberately NOT tenant-scoped
--
-- What a 2019 262D with 3,000 hours is worth does not depend on who owns it.
-- Keying this per tenant would mean paying for the same market research once
-- per customer; keyed by model, fifty tenants with the same machine share one
-- lookup per quarter. That is the difference between a feature that costs
-- pennies and one that can't ship.
--
-- Consequence: these rows carry no company_id and are readable by every
-- authenticated user. Nothing tenant-identifying may ever be written here --
-- it is market data, not customer data. Writes are service-role only, since
-- one bad row would poison every tenant's numbers.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fleet_valuations (
  id            bigserial PRIMARY KEY,
  asset_class   text NOT NULL,
  make          text,
  model         text,
  model_year    integer,
  -- Banded rather than exact: comps cluster, and a band both matches how
  -- auction data actually arrives and keeps the cache from fragmenting into
  -- one row per machine.
  meter_basis   text NOT NULL CHECK (meter_basis IN ('hours','miles')),
  meter_low     numeric(12,1),
  meter_high    numeric(12,1),
  value_low     numeric(12,2),
  value_typical numeric(12,2),
  value_high    numeric(12,2),
  currency      text NOT NULL DEFAULT 'USD',
  -- 'curve'    seeded class residual curve; always available, roughly right
  -- 'ai_comps' researched from recent sold listings, with citations
  -- 'manual'   a human who knows better
  source        text NOT NULL DEFAULT 'curve'
                CHECK (source IN ('curve','ai_comps','manual')),
  confidence    numeric(3,2),
  comps         jsonb NOT NULL DEFAULT '[]'::jsonb,   -- cited listings behind the number
  researched_at timestamptz NOT NULL DEFAULT now(),
  -- Used equipment prices move slowly; a quarter is plenty, and it caps spend.
  expires_at    timestamptz NOT NULL DEFAULT (now() + interval '90 days'),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS fleet_valuations_key
  ON public.fleet_valuations (
    asset_class, COALESCE(make,''), COALESCE(model,''),
    COALESCE(model_year,0), meter_basis,
    COALESCE(meter_low,0), COALESCE(meter_high,0), source
  );
CREATE INDEX IF NOT EXISTS fleet_valuations_lookup_idx
  ON public.fleet_valuations (asset_class, make, model, model_year);

-- A tenant's own opinion of what THEIR machine is worth -- an appraisal, a
-- real offer, a recent sale of the sister unit. Tenant-scoped, and it beats
-- anything derived, because they know something the market data doesn't.
CREATE TABLE IF NOT EXISTS public.fleet_value_overrides (
  id           bigserial PRIMARY KEY,
  company_id   integer NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  fleet_id     integer NOT NULL REFERENCES public.fleet(id) ON DELETE CASCADE,
  value        numeric(12,2) NOT NULL,
  as_of        date NOT NULL DEFAULT current_date,
  basis        text,          -- 'appraisal' | 'offer' | 'comparable sale' | free text
  notes        text,
  created_by   integer,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fleet_value_overrides_asset_idx
  ON public.fleet_value_overrides (company_id, fleet_id, as_of DESC);

-- ---------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------
ALTER TABLE public.fleet_engine_events   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_meter_readings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_repairs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_value_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_valuations      ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fleet_engine_events','fleet_meter_readings','fleet_repairs','fleet_value_overrides']
  LOOP
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%I FOR ALL TO authenticated
         USING (company_id in (select public.current_user_company_ids()))
         WITH CHECK (company_id in (select public.current_user_company_ids()))', t);
  END LOOP;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Market data: everyone reads, nobody but the service role writes.
DO $$ BEGIN
  CREATE POLICY valuations_readable ON public.fleet_valuations
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';
