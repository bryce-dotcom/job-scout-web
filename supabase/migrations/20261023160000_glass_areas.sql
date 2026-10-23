-- Walter's takeoff — the twin of audit_areas.
--
-- Walter priced glass from rates this repo invented: a crew rate, minutes per
-- pane, an access multiplier, a condition multiplier. HHH's price book already
-- knew better and in more detail than the model did. Post-construction is not
-- a 2.8x multiplier, it is a product at $20, $6 or $4 by pane size. Hard water
-- is not a 3.4x multiplier, it is $2.50. Reaching the tenth floor is not an
-- access factor, it is "Commercial Windows (LIFT Up To 10 Floors)" at $5. None
-- of that is guessable and all of it was typed by the tenant before we arrived.
--
-- So Walter works the way Lenard does: the takeoff records WHAT IS THERE, the
-- rep picks the product the tenant sells for it, and the line is quantity times
-- THAT price. This table is where an area of glass meets a product, exactly as
-- audit_areas is where a lighting area meets led_replacement_id.
--
-- Interior and exterior are SEPARATE products at different prices ($3 and $6
-- residential, $2 and $4 commercial), so they are separate rows. Faces are not
-- a multiplier here and never were one in the price book.

CREATE TABLE IF NOT EXISTS public.glass_areas (
  id                bigserial PRIMARY KEY,
  company_id        bigint NOT NULL,
  assessment_id     bigint REFERENCES public.glass_assessments(id) ON DELETE CASCADE,

  -- ── where ────────────────────────────────────────────────────────────
  area_name         text,                 -- 'Great room, south elevation'
  elevation         text,                 -- 'south' | 'west' | …
  floor             integer,              -- which storey; drives the LIFT products
  -- Residential and commercial are different products at different prices, and
  -- "exterior" alone cannot choose between $6 and $4. The person standing at
  -- the building knows which it is, so they record it.
  segment           text DEFAULT 'residential',   -- 'residential' | 'commercial'
  access            text DEFAULT 'ground',        -- ground|ladder|lift|scaffold|rope
  photos            jsonb,
  photo_path        text,

  -- ── what is there ────────────────────────────────────────────────────
  pane_count        integer,
  face              text DEFAULT 'out',   -- 'in' | 'out' — a separate product each
  condition         text,                 -- maintenance|first_clean|post_construction|hard_water
  tracks            integer DEFAULT 0,
  screens           integer DEFAULT 0,
  glass_type        text,
  notes             text,

  -- ── what we sell ─────────────────────────────────────────────────────
  -- The same three columns audit_areas carries, and for the same reason: what
  -- the area RECORDED it sold beats any price recomputed later, because the
  -- customer signed a document showing it.
  product_id        bigint REFERENCES public.products_services(id) ON DELETE SET NULL,
  product_qty       numeric,
  unit_price        numeric,
  line_total        numeric,
  -- A recurring plan is priced from the (Subscription) twin of the product,
  -- about a tenth of the one-off rate. Nothing in products_services says which
  -- is which, so the takeoff has to say what it is asking for.
  recurring         boolean DEFAULT false,

  -- ── state ────────────────────────────────────────────────────────────
  confirmed         boolean DEFAULT false,
  override_notes    text,
  sort_order        integer,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now()
);

-- The damage register gets a product too, matched per severity. Until somebody
-- adds an architectural glass restoration product to the book this will be
-- null on every row at HHH — they sell Shower Glass Restoration at $15 and
-- nothing by damage zone — and the screen is expected to SAY so rather than
-- fall back on a rate.
ALTER TABLE public.glass_damage_items
  ADD COLUMN IF NOT EXISTS product_id bigint
  REFERENCES public.products_services(id) ON DELETE SET NULL;
ALTER TABLE public.glass_damage_items
  ADD COLUMN IF NOT EXISTS unit_price numeric;
ALTER TABLE public.glass_damage_items
  ADD COLUMN IF NOT EXISTS line_total numeric;

CREATE INDEX IF NOT EXISTS idx_glass_areas_company    ON public.glass_areas(company_id);
CREATE INDEX IF NOT EXISTS idx_glass_areas_assessment ON public.glass_areas(assessment_id);
CREATE INDEX IF NOT EXISTS idx_glass_areas_product    ON public.glass_areas(product_id);

-- Every tenant table here is RLS-on from birth; about 90 were found DISABLED
-- on 2026-10-16 and that is not happening to a new one.
ALTER TABLE public.glass_areas ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  BEGIN
    EXECUTE 'CREATE POLICY tenant_isolation ON public.glass_areas FOR ALL TO authenticated
               USING (company_id in (select public.current_user_company_ids()))
               WITH CHECK (company_id in (select public.current_user_company_ids()))';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;
