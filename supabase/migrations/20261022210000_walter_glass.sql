-- Walter The Window Wizard — glass assessment tables.
--
-- Shape mirrors Don's dig_* family: a record of the visit, the rows that were
-- counted on it, and a per-company settings row. Nothing here computes a
-- price. Every number in a Walter bid comes from src/lib/windowEstimator.js;
-- these tables persist the INPUTS and the stored rollup, so a list view does
-- not have to re-run the engine for every row and an old bid still reprices
-- the way it was sent.
--
-- Cleaning and restoration are two verticals over the one engine, not two
-- engines, so there is one assessment table with a `vertical` column rather
-- than a cleaning table and a restoration table. AGR billed construction
-- residue removal as a specialist package; scraping stucco and adhesive off
-- glass IS post-construction window cleaning, which the crew already does.
-- Splitting the tables would have hidden exactly that.

-- ---------------------------------------------------------------------
-- 1. Assessments — one visit, one bid attempt
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.glass_assessments (
  id                bigserial PRIMARY KEY,
  company_id        bigint NOT NULL,
  customer_id       bigint,
  lead_id           bigint,
  quote_id          bigint,            -- back-link once pushed to the pipeline
  job_id            bigint,
  site_name         text,
  address           text,
  city              text,
  state             text,
  zip               text,
  assessment_date   date,
  -- 'cleaning' | 'restoration' | 'both'. Which half of the engine runs.
  vertical          text DEFAULT 'both',
  status            text DEFAULT 'draft',    -- draft|final|sent|won|lost
  -- Keys into ACCESS_PROFILES / CONDITION_PROFILES in windowEstimator.js.
  access            text DEFAULT 'ground',
  condition         text DEFAULT 'maintenance',
  -- What the glass actually is. A coating on the room side cannot be abraded,
  -- which turns a mark into a warranty question instead of a bid line.
  glass_make        text,                    -- 'Sierra Pacific'
  glass_product     text,                    -- 'Cardinal LoE3-366'
  coatings          text[],                  -- 'i89', 'Neat'
  -- Cleaning-side quantities.
  panes             integer,
  faces             integer DEFAULT 2,       -- 2 = inside and out
  tracks            integer DEFAULT 0,
  screens           integer DEFAULT 0,
  -- The company's pricing as it stood when this bid was sent, so reopening an
  -- old assessment does not silently reprice it at today's rates.
  pricing           jsonb DEFAULT '{}'::jsonb,
  tier_spread       jsonb,
  -- Rollup from walterEstimate(), stored for list views.
  expected_total    numeric,
  tier_favourable   numeric,
  tier_difficult    numeric,
  zones_counted     integer,
  zones_to_clean    integer,
  zones_excluded    integer,
  tech_days         numeric,
  -- Restoration is sold against the cost of replacing the glass instead.
  replacement_cost_low  numeric,
  replacement_cost_high numeric,
  notes             text,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 2. Damage register — one row per MARK, duplicates included
-- ---------------------------------------------------------------------
-- The duplicates are the point. AGR's register logged 68 marks across 23 photo
-- groups because the same scratch was photographed from several angles; bidding
-- the 68 would have roughly tripled the tech days. So every row is kept and
-- `duplicate_of` carries the code of the mark it repeats, which is what
-- countableZones() reads. A register that silently dropped its duplicates
-- could never show a customer why 68 is 23.
CREATE TABLE IF NOT EXISTS public.glass_damage_items (
  id                bigserial PRIMARY KEY,
  company_id        bigint NOT NULL,
  assessment_id     bigint REFERENCES public.glass_assessments(id) ON DELETE CASCADE,
  code              text,                    -- 'A01' — the id a person reads
  location          text,                    -- 'Great room, south elevation'
  lite_id           text,                    -- which pane, for setup-per-face
  face              text,                    -- 'in' | 'out'
  -- L0 probably residue · L1 light abrasion · L2 deep or near an edge.
  -- L0 is routed to the cleaning side by the engine, never resurfaced.
  severity          text DEFAULT 'L1',
  edge              boolean DEFAULT false,
  zone_scale        numeric,                 -- >1 when the zone beats the default
  glass_size        text,
  zone_size         text,
  duplicate_of      text,                    -- the `code` this one repeats
  -- 'coated_surface' | 'factory_defect' | 'through_crack'
  not_restorable_reason text,
  photo_path        text,                    -- project-documents bucket
  price_note        text,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 3. Settings — the company's own numbers
-- ---------------------------------------------------------------------
-- Deliberately empty of defaults. The engine's seeds are documented in
-- windowEstimator.js and apply when a company has said nothing; AGR's figures
-- are one worked example on one job, not a default for the thousands of
-- businesses this ships to. The tech day rate in particular is the single
-- biggest input to a restoration bid and nobody here has a real one yet.
CREATE TABLE IF NOT EXISTS public.glass_settings (
  company_id        bigint PRIMARY KEY,
  pricing           jsonb DEFAULT '{}'::jsonb,
  tier_spread       jsonb,
  minutes           jsonb DEFAULT '{}'::jsonb,
  verticals         text[] DEFAULT ARRAY['cleaning','restoration'],
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------
-- 4. Indexes
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_glass_assessments_company ON public.glass_assessments(company_id);
CREATE INDEX IF NOT EXISTS idx_glass_assessments_created ON public.glass_assessments(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_glass_damage_assessment  ON public.glass_damage_items(assessment_id);
CREATE INDEX IF NOT EXISTS idx_glass_damage_company     ON public.glass_damage_items(company_id);

-- ---------------------------------------------------------------------
-- 5. Tenancy
-- ---------------------------------------------------------------------
-- Every tenant table here is RLS-on deliberately: on 2026-10-16 roughly 90 of
-- them were found DISABLED. These three are on from birth.
ALTER TABLE public.glass_assessments   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.glass_damage_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.glass_settings      ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['glass_assessments','glass_damage_items','glass_settings']
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

-- ---------------------------------------------------------------------
-- 6. The catalog row
-- ---------------------------------------------------------------------
-- Walter's catalog entry described window cleaning and never mentioned glass
-- restoration, which is half of what he does and the half that carries the
-- margin. Status stays coming_soon: the storefront has claimed unbuilt
-- features before, and it will not do it again here. It flips when the
-- workspace actually works end to end.
UPDATE public.agents
   SET description = 'Glass, counted and priced. Walter bids window cleaning by the pane and glass scratch restoration by the damage zone, over one set of arithmetic — then quotes it in three tiers, because what is under construction residue is not known until someone stands there with a test patch.',
       ai_capabilities = ARRAY[
         'count_panes',
         'identify_window_type',
         'assess_glass_damage',
         'three_tier_bid',
         'generate_quote'
       ]
 WHERE slug = 'walter-windows';
