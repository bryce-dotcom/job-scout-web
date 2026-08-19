-- Stated tons and loads need somewhere to live.
--
-- dig_takeoff_items.tons and .loads are ENGINE OUTPUT — derived from volume.
-- But a delivery ticket says "40 ton" and a field note says "14 loads to the
-- pit", and those are measured facts that should beat anything derived. With
-- nowhere to store them, a road_base line read off a note saved with no
-- geometry, recomputed its tonnage from a volume of zero, and priced at $0.
--
-- Two input columns, mirroring volume_bcy_input, keep the stated value and
-- the derived value from ever being the same field.

ALTER TABLE public.dig_takeoff_items
  ADD COLUMN IF NOT EXISTS tons_input  numeric,
  ADD COLUMN IF NOT EXISTS loads_input numeric;

COMMENT ON COLUMN public.dig_takeoff_items.tons_input IS
  'Tonnage stated on a ticket or note. Beats the value derived from volume.';
COMMENT ON COLUMN public.dig_takeoff_items.loads_input IS
  'Load count somebody actually counted. Beats the value derived from volume.';

NOTIFY pgrst, 'reload schema';
