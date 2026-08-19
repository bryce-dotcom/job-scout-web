-- =====================================================================
-- Make the valuation cache key upsertable.
--
-- The unique index was built over COALESCE(make,''), COALESCE(model,'') and
-- so on, so it could tolerate nulls. Postgres accepts that happily, but
-- ON CONFLICT (col, col, ...) only matches an index over plain columns —
-- an expression index cannot be named that way. So every write failed with
-- 42P10 "no unique or exclusion constraint matching the ON CONFLICT
-- specification", AFTER the model had already searched the web and produced
-- a valuation. The research was paid for and then thrown away.
--
-- Rather than keep nulls and reach for a raw upsert, the columns lose their
-- nullability: an empty make and an absent make mean the same thing to a
-- cache key, and NULL is what made the key need an expression in the first
-- place. A plain unique index follows, which ON CONFLICT can name.
-- =====================================================================

UPDATE public.fleet_valuations SET make = '' WHERE make IS NULL;
UPDATE public.fleet_valuations SET model = '' WHERE model IS NULL;
UPDATE public.fleet_valuations SET model_year = 0 WHERE model_year IS NULL;
UPDATE public.fleet_valuations SET meter_low = 0 WHERE meter_low IS NULL;
UPDATE public.fleet_valuations SET meter_high = 0 WHERE meter_high IS NULL;

ALTER TABLE public.fleet_valuations ALTER COLUMN make       SET DEFAULT '';
ALTER TABLE public.fleet_valuations ALTER COLUMN model      SET DEFAULT '';
ALTER TABLE public.fleet_valuations ALTER COLUMN model_year SET DEFAULT 0;
ALTER TABLE public.fleet_valuations ALTER COLUMN meter_low  SET DEFAULT 0;
ALTER TABLE public.fleet_valuations ALTER COLUMN meter_high SET DEFAULT 0;

ALTER TABLE public.fleet_valuations ALTER COLUMN make       SET NOT NULL;
ALTER TABLE public.fleet_valuations ALTER COLUMN model      SET NOT NULL;
ALTER TABLE public.fleet_valuations ALTER COLUMN model_year SET NOT NULL;
ALTER TABLE public.fleet_valuations ALTER COLUMN meter_low  SET NOT NULL;
ALTER TABLE public.fleet_valuations ALTER COLUMN meter_high SET NOT NULL;

DROP INDEX IF EXISTS public.fleet_valuations_key;

CREATE UNIQUE INDEX IF NOT EXISTS fleet_valuations_key
  ON public.fleet_valuations
     (asset_class, make, model, model_year, meter_basis, meter_low, meter_high, source);

NOTIFY pgrst, 'reload schema';
