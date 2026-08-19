-- One person cannot be on two clocks at once.
--
-- Since 1 May, 15 pairs of punches overlapped in time and 90 hours were counted
-- twice. Mike Thompson has 11.5 hours double-counted on one day in May; Derrick
-- Mctavish 9.0 on 14 August; Cameron McDonough 10.6 on 21 May. Some overlap the
-- SAME job, which is a second clock-in on top of a punch that never closed.
--
-- FieldScout already guards this (checkCanClockIn), but only in the browser, and
-- deliberately falls through when the guard itself errors — "a failed guard must
-- never cost someone a punch". Two tabs, two devices, a retry, or an offline
-- queue replay all get past it. Payroll pays whatever is in this table, so the
-- rule belongs where it cannot be bypassed.
--
-- Verified before writing this: 4 open punches exist right now, all belonging to
-- different employees, so the index creates cleanly.
--
-- employee_id alone is the key — employees are per-tenant rows, so one id can
-- only ever belong to one company.
CREATE UNIQUE INDEX IF NOT EXISTS idx_time_clock_one_open_per_employee
  ON time_clock (employee_id)
  WHERE clock_out IS NULL;

COMMENT ON INDEX idx_time_clock_one_open_per_employee IS
  'One open punch per employee. A second clock-in while one is still open raises 23505; FieldScout catches that and tells the tech they are already clocked in.';
