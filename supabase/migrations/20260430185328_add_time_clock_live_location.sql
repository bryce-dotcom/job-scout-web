-- Live location pings while clocked in.
--
-- The Field Scout client posts a fresh GPS reading every ~15 min while a user
-- is on the clock. The Who's Working dashboard map prefers `last_*` over
-- `clock_in_*` so it can show where employees ACTUALLY are right now, not
-- just where they started their shift.
--
-- Three columns on time_clock (no separate pings table — we don't need
-- movement history for v1, and a single row per active shift keeps the
-- read query trivially cheap).

ALTER TABLE public.time_clock
  ADD COLUMN IF NOT EXISTS last_lat numeric,
  ADD COLUMN IF NOT EXISTS last_lng numeric,
  ADD COLUMN IF NOT EXISTS last_ping_at timestamptz;

-- Index so the dashboard map can quickly find recent pings per company.
CREATE INDEX IF NOT EXISTS idx_time_clock_last_ping_at
  ON public.time_clock(last_ping_at DESC NULLS LAST)
  WHERE clock_out IS NULL;
