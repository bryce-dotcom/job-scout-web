-- Add adjustment tracking columns to time_clock
ALTER TABLE time_clock ADD COLUMN IF NOT EXISTS adjusted_by integer REFERENCES employees(id);
ALTER TABLE time_clock ADD COLUMN IF NOT EXISTS adjusted_at timestamptz;
ALTER TABLE time_clock ADD COLUMN IF NOT EXISTS adjustment_reason text;
ALTER TABLE time_clock ADD COLUMN IF NOT EXISTS original_clock_in timestamptz;
ALTER TABLE time_clock ADD COLUMN IF NOT EXISTS original_clock_out timestamptz;
ALTER TABLE time_clock ADD COLUMN IF NOT EXISTS original_total_hours numeric;
