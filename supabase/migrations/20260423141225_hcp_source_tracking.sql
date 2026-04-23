-- Source-system tracking for imported records.
--
-- Why: today the HCP migrator inserts new rows but doesn't remember
-- where they came from. That makes re-running the importer non-idempotent
-- (we'd duplicate everything) and makes it impossible to backfill missing
-- fields by walking back to the source. Adding (source_system, source_id)
-- to every imported entity gives us a deterministic upsert key and a
-- reconciliation handle for the trust report.
--
-- We also add the line-item fidelity columns the HCP importer was
-- silently dropping: kind (labor/materials), taxable, unit_of_measure.
-- description, labor_cost, and item_name already exist.

ALTER TABLE customers       ADD COLUMN IF NOT EXISTS source_system text;
ALTER TABLE customers       ADD COLUMN IF NOT EXISTS source_id     text;
ALTER TABLE jobs            ADD COLUMN IF NOT EXISTS source_system text;
ALTER TABLE jobs            ADD COLUMN IF NOT EXISTS source_id     text;
ALTER TABLE quotes          ADD COLUMN IF NOT EXISTS source_system text;
ALTER TABLE quotes          ADD COLUMN IF NOT EXISTS source_id     text;
ALTER TABLE quote_lines     ADD COLUMN IF NOT EXISTS source_system text;
ALTER TABLE quote_lines     ADD COLUMN IF NOT EXISTS source_id     text;
ALTER TABLE job_lines       ADD COLUMN IF NOT EXISTS source_system text;
ALTER TABLE job_lines       ADD COLUMN IF NOT EXISTS source_id     text;
ALTER TABLE invoices        ADD COLUMN IF NOT EXISTS source_system text;
ALTER TABLE invoices        ADD COLUMN IF NOT EXISTS source_id     text;
ALTER TABLE payments        ADD COLUMN IF NOT EXISTS source_system text;
ALTER TABLE payments        ADD COLUMN IF NOT EXISTS source_id     text;
ALTER TABLE leads           ADD COLUMN IF NOT EXISTS source_system text;
ALTER TABLE leads           ADD COLUMN IF NOT EXISTS source_id     text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_src   ON customers   (company_id, source_system, source_id) WHERE source_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_src        ON jobs        (company_id, source_system, source_id) WHERE source_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_src      ON quotes      (company_id, source_system, source_id) WHERE source_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_quote_lines_src ON quote_lines (company_id, source_system, source_id) WHERE source_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_job_lines_src   ON job_lines   (company_id, source_system, source_id) WHERE source_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_src    ON invoices    (company_id, source_system, source_id) WHERE source_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_src    ON payments    (company_id, source_system, source_id) WHERE source_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_src       ON leads       (company_id, source_system, source_id) WHERE source_id IS NOT NULL;

ALTER TABLE quote_lines     ADD COLUMN IF NOT EXISTS kind             text;
ALTER TABLE quote_lines     ADD COLUMN IF NOT EXISTS taxable          boolean;
ALTER TABLE quote_lines     ADD COLUMN IF NOT EXISTS unit_of_measure  text;
ALTER TABLE job_lines       ADD COLUMN IF NOT EXISTS kind             text;
ALTER TABLE job_lines       ADD COLUMN IF NOT EXISTS taxable          boolean;
ALTER TABLE job_lines       ADD COLUMN IF NOT EXISTS unit_of_measure  text;

-- Migration job tracking (foundation for the in-app import wizard).
-- One row per import run per tenant: lets the UI stream progress
-- and lets us produce a trust report afterward.
CREATE TABLE IF NOT EXISTS migration_jobs (
  id           bigserial PRIMARY KEY,
  company_id   integer NOT NULL,
  source       text    NOT NULL,
  status       text    NOT NULL DEFAULT 'queued',
  started_at   timestamptz,
  finished_at  timestamptz,
  error        text,
  counts       jsonb   NOT NULL DEFAULT '{}'::jsonb,
  report       jsonb,
  triggered_by uuid,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_migration_jobs_company ON migration_jobs (company_id, created_at DESC);

-- RLS deliberately left off for now — only the service role writes
-- migration_jobs (the importer Edge Function will use it). Tenant
-- read access will be added once the in-app wizard wiring lands.
