-- Don The Dirt Digger — excavation estimating tables.
--
-- Shape mirrors Zach's lawn_* family: a site record, versioned takeoffs, the
-- quantity rows, a per-company price book, and a calibration loop fed by
-- as-builts. The estimating math lives in src/lib/digEstimator.js — nothing
-- here computes a price, these tables only persist inputs and results.
--
-- Verticals are toggles, not a fork (DON_EXCAVATOR_PLAN.md §2.5): one engine,
-- and dig_settings.verticals decides which work types the UI offers.

-- ---------------------------------------------------------------------
-- 1. Sites — one row per project location
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dig_sites (
  id                bigserial PRIMARY KEY,
  company_id        bigint NOT NULL,
  customer_id       bigint,
  lead_id           bigint,
  site_name         text,
  address           text,
  city              text,
  state             text,
  zip               text,
  latitude          double precision,
  longitude         double precision,
  site_polygon      jsonb,             -- GeoJSON from the trace tool
  site_area_sf      numeric,
  map_static_url    text,
  default_soil_class text DEFAULT 'common_earth',
  water_table_depth_ft numeric,
  rock_expected     boolean DEFAULT false,
  access_notes      text,              -- gates, overhead lines, staging room
  utility_notes     text,              -- 811 ticket, known conflicts
  haul_destination  text,
  haul_round_trip_miles numeric,
  notes             text,
  active            boolean DEFAULT true,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 2. Plans — uploaded sheets, and what the reader pulled off them
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dig_plans (
  id                bigserial PRIMARY KEY,
  company_id        bigint NOT NULL,
  site_id           bigint REFERENCES public.dig_sites(id) ON DELETE CASCADE,
  storage_path      text,              -- project-documents bucket
  file_name         text,
  sheet_number      text,              -- 'C-301'
  sheet_title       text,
  discipline        text,              -- grading | utility | site | detail
  revision          text,
  page_number       integer DEFAULT 1,
  scale_text        text,              -- as printed: '1" = 20'
  scale_px_per_ft   numeric,           -- set by the calibration tap
  extraction_status text DEFAULT 'pending',   -- pending|reading|done|failed
  extraction        jsonb,             -- raw structured output from don-read-plan
  extracted_at      timestamptz,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 3. Takeoffs — a versioned bid attempt against a site
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dig_takeoffs (
  id                bigserial PRIMARY KEY,
  company_id        bigint NOT NULL,
  site_id           bigint REFERENCES public.dig_sites(id) ON DELETE CASCADE,
  name              text,
  revision_label    text,              -- 'Rev 2 — addendum 1'
  status            text DEFAULT 'draft',     -- draft|final|sent|won|lost
  quote_id          bigint,            -- back-link once pushed to the pipeline
  job_id            bigint,
  -- Bid settings snapshot, so an old bid still reprices the way it was sent.
  settings          jsonb DEFAULT '{}'::jsonb,
  price_book_snapshot jsonb,
  -- Rollup from digEstimator.estimateDig(), stored for list views.
  totals            jsonb,
  total_bcy         numeric,
  total_lcy         numeric,
  total_loads       integer,
  total_machine_hours numeric,
  bid_total         numeric,
  ready_to_send     boolean DEFAULT false,
  notes             text,
  created_by        bigint,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 4. Takeoff items — THE quantity rows
-- ---------------------------------------------------------------------
-- Provenance columns (source / source_ref / confidence / confirmed_by) are
-- not optional decoration. "Where did this number come from" is the whole
-- trust story with a contractor, and a bid will not send while an AI guess
-- below the confidence threshold is still unconfirmed.
CREATE TABLE IF NOT EXISTS public.dig_takeoff_items (
  id                bigserial PRIMARY KEY,
  company_id        bigint NOT NULL,
  takeoff_id        bigint REFERENCES public.dig_takeoffs(id) ON DELETE CASCADE,
  sort_order        integer DEFAULT 0,
  work_type         text NOT NULL,     -- keys of WORK_TYPES in digEstimator.js
  label             text,
  soil_class        text,
  -- Geometry inputs. Which ones matter depends on the work type's geometry.
  length_ft         numeric,
  width_ft          numeric,
  depth_ft          numeric,
  perimeter_ft      numeric,
  area_sf           numeric,
  top_area_sf       numeric,
  bottom_area_sf    numeric,
  count             numeric,
  protection        text,              -- sloped | shored | box | none
  slope_ratio       numeric,
  overdig_each_side_ft numeric,
  volume_bcy_input  numeric,           -- for work types entered as raw volume
  -- Equipment + haul overrides (fall back to takeoff/site defaults)
  equipment         text,
  truck             text,
  -- Computed by digEstimator, persisted so lists and PDFs need no recompute.
  volume_bcy        numeric,
  volume_lcy        numeric,
  volume_ccy        numeric,
  loads             integer,
  tons              numeric,
  machine_hours     numeric,
  -- Pricing
  rate_code         text,
  unit_of_measure   text,
  quantity          numeric,
  unit_price        numeric,
  extension         numeric,
  cost              numeric,
  kind              text,              -- labor | materials (feeds the invoice split)
  -- Provenance
  source            text DEFAULT 'manual',   -- manual|plan|ai_photo|handwritten|measured
  source_ref        text,              -- 'C-401 pipe schedule row 3'
  plan_id           bigint REFERENCES public.dig_plans(id) ON DELETE SET NULL,
  confidence        numeric,
  confirmed_by      bigint,
  confirmed_at      timestamptz,
  warnings          jsonb,
  notes             text,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 5. Price book — per-company unit prices and production rates
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dig_rates (
  id                bigserial PRIMARY KEY,
  company_id        bigint NOT NULL,
  code              text,
  label             text NOT NULL,
  work_type         text,
  vertical          text,              -- which toggle seeded/owns this row
  uom               text NOT NULL DEFAULT 'CY',   -- CY|LCY|CCY|LF|SF|TON|LOAD|HR|DAY|EA
  unit_price        numeric DEFAULT 0,
  cost              numeric DEFAULT 0,
  kind              text DEFAULT 'labor',
  min_charge        numeric,
  hours_per_day     numeric DEFAULT 8,
  -- Production side
  equipment         text,
  production_rate   numeric,           -- in uom per hour
  operator_rate     numeric,
  mobilization      numeric,
  active            boolean DEFAULT true,
  sort_order        integer DEFAULT 0,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 6. Soil profiles — per-company overrides of the seed table
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dig_soil_profiles (
  id                bigserial PRIMARY KEY,
  company_id        bigint NOT NULL,
  soil_class        text NOT NULL,
  label             text,
  swell             numeric,
  shrink            numeric,
  osha_type         text,
  max_slope_ratio   numeric,
  bank_density_pcy  numeric,
  difficulty        numeric,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 7. Actuals — what the machine really did
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dig_actuals (
  id                bigserial PRIMARY KEY,
  company_id        bigint NOT NULL,
  takeoff_id        bigint REFERENCES public.dig_takeoffs(id) ON DELETE SET NULL,
  takeoff_item_id   bigint REFERENCES public.dig_takeoff_items(id) ON DELETE SET NULL,
  job_id            bigint,
  work_type         text,
  soil_class        text,
  work_date         date,
  estimated_hours   numeric,
  actual_hours      numeric,
  estimated_loads   integer,
  actual_loads      integer,
  actual_tons       numeric,
  equipment         text,
  source            text DEFAULT 'manual',   -- manual|time_clock|handwritten
  notes             text,
  created_by        bigint,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 8. Calibration — the learned factors
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dig_calibration (
  id                bigserial PRIMARY KEY,
  company_id        bigint NOT NULL,
  work_type         text NOT NULL,
  soil_class        text,
  factor            numeric DEFAULT 1,
  sample_n          integer DEFAULT 0,
  raw_factor        numeric,
  last_computed_at  timestamptz,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 9. Settings — one row per company
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dig_settings (
  id                bigserial PRIMARY KEY,
  company_id        bigint NOT NULL UNIQUE,
  -- Which job shapes this company does. All three core ones on by default so
  -- nobody lands in an empty app.
  verticals         jsonb DEFAULT '{"trenching":true,"sitework":true,"foundation":true,"demolition":false,"land_clearing":false}'::jsonb,
  default_soil_class text DEFAULT 'common_earth',
  default_truck     text DEFAULT 'tri_axle',
  default_equipment text DEFAULT 'ex_160',
  default_overdig_ft numeric DEFAULT 2,
  efficiency        numeric DEFAULT 0.83,
  overhead_percent  numeric DEFAULT 0.10,
  profit_percent    numeric DEFAULT 0.10,
  tax_rate          numeric DEFAULT 0,
  mobilization      numeric DEFAULT 0,
  confidence_threshold numeric DEFAULT 0.7,
  price_book_seeded jsonb DEFAULT '{}'::jsonb,   -- which vertical packs are installed
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Indexes — every lookup starts with company_id
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_dig_sites_company        ON public.dig_sites(company_id);
CREATE INDEX IF NOT EXISTS idx_dig_sites_customer       ON public.dig_sites(company_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_dig_sites_lead           ON public.dig_sites(company_id, lead_id);
CREATE INDEX IF NOT EXISTS idx_dig_plans_site           ON public.dig_plans(company_id, site_id);
CREATE INDEX IF NOT EXISTS idx_dig_takeoffs_site        ON public.dig_takeoffs(company_id, site_id);
CREATE INDEX IF NOT EXISTS idx_dig_takeoffs_quote       ON public.dig_takeoffs(company_id, quote_id);
CREATE INDEX IF NOT EXISTS idx_dig_items_takeoff        ON public.dig_takeoff_items(company_id, takeoff_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_dig_rates_company        ON public.dig_rates(company_id, active);
CREATE INDEX IF NOT EXISTS idx_dig_rates_work_type      ON public.dig_rates(company_id, work_type);
CREATE INDEX IF NOT EXISTS idx_dig_soil_company         ON public.dig_soil_profiles(company_id);
CREATE INDEX IF NOT EXISTS idx_dig_actuals_takeoff      ON public.dig_actuals(company_id, takeoff_id);
CREATE INDEX IF NOT EXISTS idx_dig_actuals_job          ON public.dig_actuals(company_id, job_id);
CREATE INDEX IF NOT EXISTS idx_dig_calibration_lookup   ON public.dig_calibration(company_id, work_type, soil_class);

-- One calibration row per company/work_type/soil_class.
CREATE UNIQUE INDEX IF NOT EXISTS uq_dig_calibration
  ON public.dig_calibration(company_id, work_type, coalesce(soil_class, ''));

-- One soil override per company/class.
CREATE UNIQUE INDEX IF NOT EXISTS uq_dig_soil_profile
  ON public.dig_soil_profiles(company_id, soil_class);

-- ---------------------------------------------------------------------
-- RLS — on from the first migration, not bolted on later
-- ---------------------------------------------------------------------
ALTER TABLE public.dig_sites          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dig_plans          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dig_takeoffs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dig_takeoff_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dig_rates          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dig_soil_profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dig_actuals        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dig_calibration    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dig_settings       ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'dig_sites','dig_plans','dig_takeoffs','dig_takeoff_items',
    'dig_rates','dig_soil_profiles','dig_actuals','dig_calibration','dig_settings'
  ]
  LOOP
    BEGIN
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON public.%I FOR ALL TO authenticated
           USING (company_id in (select public.current_user_company_ids()))
           WITH CHECK (company_id in (select public.current_user_company_ids()))', t);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
