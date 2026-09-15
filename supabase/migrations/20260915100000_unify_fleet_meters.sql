-- One odometer, not two.
--
-- fleet.mileage_hours is what the asset header shows and what four different
-- forms write: the add-asset form, the header's Update button, the fuel log,
-- CSV import. fleet_meter_readings is what everything built since reads: the
-- lifecycle engine, cost per mile, the PM schedule view, the maintenance panel.
--
-- Nothing joined them. On the demo fleet a 2015 F-150 at 162,800 miles was
-- valued as if it had never moved and told its owner it was "ageing faster than
-- it wears" — the exact opposite of the truth — because the reading its owner
-- typed lived in a column the engine never looked at. Every real tenant that
-- typed a mileage before telematics existed is in the same position.
--
-- Two triggers and a backfill, rather than editing the four writers: a fifth
-- writer will appear, and it will make the same mistake.
--
--   fleet → readings   a typed figure becomes a 'manual' reading in the column
--                      the asset's meter basis calls for. Manual readings are
--                      the anchor the engine trusts most, which is right — a
--                      person read it off the dash.
--
--   readings → fleet   a new reading lifts the header figure, never lowers it.
--                      A telematics unit installed at 3,898 miles reports its
--                      own 193, and GREATEST is what stops that overwriting the
--                      dash. The current-meters view applies the same rule.
--
-- pg_trigger_depth() keeps the two from chasing each other.

-- ---------------------------------------------------------------------
-- Typed figure → reading
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fleet_mileage_to_reading()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_basis text;
  v_current numeric;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF NEW.mileage_hours IS NULL OR NEW.mileage_hours <= 0 THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.mileage_hours IS NOT DISTINCT FROM OLD.mileage_hours THEN RETURN NEW; END IF;

  v_basis := COALESCE(NEW.meter_basis,
               CASE WHEN NEW.type = 'Equipment' THEN 'hours' ELSE 'miles' END);

  -- Only record it when it moves the meter. A re-save of the same figure, or
  -- a stale one below what telematics already reported, is not a reading.
  SELECT CASE WHEN v_basis = 'hours' THEN engine_hours ELSE odometer_miles END
    INTO v_current
    FROM public.fleet_current_meters
   WHERE fleet_id = NEW.id;
  IF v_current IS NOT NULL AND NEW.mileage_hours <= v_current THEN RETURN NEW; END IF;

  INSERT INTO public.fleet_meter_readings
    (company_id, fleet_id, recorded_at, engine_hours, odometer_miles, source, notes)
  VALUES
    (NEW.company_id, NEW.id, now(),
     CASE WHEN v_basis = 'hours' THEN NEW.mileage_hours END,
     CASE WHEN v_basis = 'hours' THEN NULL ELSE NEW.mileage_hours END,
     'manual', 'Entered on the asset');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fleet_mileage_to_reading ON public.fleet;
CREATE TRIGGER trg_fleet_mileage_to_reading
  AFTER INSERT OR UPDATE OF mileage_hours, meter_basis ON public.fleet
  FOR EACH ROW EXECUTE FUNCTION public.fleet_mileage_to_reading();

-- ---------------------------------------------------------------------
-- Reading → header figure
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fleet_reading_to_mileage()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_basis text;
  v_value numeric;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;

  SELECT COALESCE(meter_basis, CASE WHEN type = 'Equipment' THEN 'hours' ELSE 'miles' END)
    INTO v_basis FROM public.fleet WHERE id = NEW.fleet_id;
  v_value := CASE WHEN v_basis = 'hours' THEN NEW.engine_hours ELSE NEW.odometer_miles END;
  IF v_value IS NULL THEN RETURN NEW; END IF;

  UPDATE public.fleet
     SET mileage_hours = v_value
   WHERE id = NEW.fleet_id
     AND COALESCE(mileage_hours, 0) < v_value;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fleet_reading_to_mileage ON public.fleet_meter_readings;
CREATE TRIGGER trg_fleet_reading_to_mileage
  AFTER INSERT ON public.fleet_meter_readings
  FOR EACH ROW EXECUTE FUNCTION public.fleet_reading_to_mileage();

-- ---------------------------------------------------------------------
-- Backfill: every typed figure that never became a reading.
--
-- Dated to the asset's last update rather than now, because that is the best
-- available guess at when someone actually looked at the dash, and dating
-- every historical reading to the migration would make the fleet look like it
-- all got inspected on the same afternoon.
-- ---------------------------------------------------------------------
INSERT INTO public.fleet_meter_readings
  (company_id, fleet_id, recorded_at, engine_hours, odometer_miles, source, notes)
SELECT f.company_id, f.id, COALESCE(f.updated_at, f.created_at, now()),
       CASE WHEN COALESCE(f.meter_basis, CASE WHEN f.type = 'Equipment' THEN 'hours' ELSE 'miles' END) = 'hours'
            THEN f.mileage_hours END,
       CASE WHEN COALESCE(f.meter_basis, CASE WHEN f.type = 'Equipment' THEN 'hours' ELSE 'miles' END) = 'hours'
            THEN NULL ELSE f.mileage_hours END,
       'manual', 'Entered on the asset (backfilled)'
  FROM public.fleet f
 WHERE f.mileage_hours IS NOT NULL AND f.mileage_hours > 0
   AND NOT EXISTS (
     SELECT 1 FROM public.fleet_meter_readings r
      WHERE r.fleet_id = f.id AND r.source IN ('manual', 'import', 'maintenance')
   );
