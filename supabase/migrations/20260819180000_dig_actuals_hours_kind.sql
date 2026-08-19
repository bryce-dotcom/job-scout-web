-- Not all hours are the same hours.
--
-- dig_calibration exists to tune PRODUCTION RATES — how many bank yards a
-- machine moves in an hour. The only thing that can tune those is machine
-- hours: the excavator actually running.
--
-- time_clock records something different. It is a person's shift, and it
-- includes travel to site, fuelling, lunch, waiting on trucks, and whatever
-- else the day contained. On a typical day it is meaningfully longer than the
-- machine ran. Feeding shift hours into a production-rate factor would
-- systematically inflate it, and every future bid would drift up for a reason
-- nobody could see.
--
-- So actuals carry what KIND of hour they are. Shift hours are still worth
-- recording and still show on the variance report — they are how you find out
-- a job ate two days of standing around — but they do not touch the factor
-- unless somebody deliberately says they should.

ALTER TABLE public.dig_actuals
  ADD COLUMN IF NOT EXISTS hours_kind text DEFAULT 'machine',
  ADD COLUMN IF NOT EXISTS counts_toward_calibration boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS time_clock_id bigint;

COMMENT ON COLUMN public.dig_actuals.hours_kind IS
  'machine = the machine was running (calibrates production rates). shift = a person was on the clock (travel, lunch and waiting included).';
COMMENT ON COLUMN public.dig_actuals.counts_toward_calibration IS
  'False for shift hours pulled from the time clock until somebody confirms they represent machine time.';
COMMENT ON COLUMN public.dig_actuals.time_clock_id IS
  'Source row when these hours were pulled from time_clock, so the same shift cannot be imported twice.';

-- Rows imported from the time clock are shift hours and stay out of the
-- factor until a human says otherwise.
ALTER TABLE public.dig_actuals
  ADD CONSTRAINT dig_actuals_hours_kind_check
  CHECK (hours_kind IN ('machine', 'shift'));

CREATE INDEX IF NOT EXISTS idx_dig_actuals_work_type
  ON public.dig_actuals(company_id, work_type);

-- One import per shift.
CREATE UNIQUE INDEX IF NOT EXISTS uq_dig_actuals_time_clock
  ON public.dig_actuals(company_id, time_clock_id)
  WHERE time_clock_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
