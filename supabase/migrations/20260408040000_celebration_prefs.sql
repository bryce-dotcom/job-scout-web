-- Celebration preferences for estimate approvals.
-- Company-wide default lives in the existing `settings` table under the
-- `celebration_enabled` key (default true). Seeded at runtime.
-- Per-employee override lives on the employees row.

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS celebration_opt_out boolean NOT NULL DEFAULT false;
