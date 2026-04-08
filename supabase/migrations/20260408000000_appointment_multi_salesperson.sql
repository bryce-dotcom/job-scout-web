-- Multi-salesperson assignment for appointments and leads
-- Allows assigning more than one rep to a scheduled lead.
-- Backwards compatible: salesperson_id stays as the "primary" rep so all
-- existing reports, commissions, and queries that read it keep working.

ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS salesperson_ids bigint[] NOT NULL DEFAULT '{}';

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS salesperson_ids bigint[] NOT NULL DEFAULT '{}';

-- Backfill: any existing appointment / lead that already has a single
-- salesperson_id gets that id mirrored into the array so the multi-rep UI
-- shows the existing assignment correctly without losing data.
UPDATE appointments
  SET salesperson_ids = ARRAY[salesperson_id]
  WHERE salesperson_id IS NOT NULL
    AND (salesperson_ids IS NULL OR salesperson_ids = '{}');

UPDATE leads
  SET salesperson_ids = ARRAY[salesperson_id]
  WHERE salesperson_id IS NOT NULL
    AND (salesperson_ids IS NULL OR salesperson_ids = '{}');

CREATE INDEX IF NOT EXISTS appointments_salesperson_ids_gin
  ON appointments USING gin (salesperson_ids);
CREATE INDEX IF NOT EXISTS leads_salesperson_ids_gin
  ON leads USING gin (salesperson_ids);
