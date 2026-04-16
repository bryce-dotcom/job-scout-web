-- Create invoice_lines table to give invoices their own immutable line item history,
-- independent of the source job_lines (which can be edited later).
-- Mirrors the structure used in JobDetail.jsx convertJobToInvoice (insert into invoice_lines).

CREATE TABLE IF NOT EXISTS invoice_lines (
  id           bigserial PRIMARY KEY,
  company_id   bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id   bigint NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  item_id      bigint REFERENCES products_services(id) ON DELETE SET NULL,
  line_number  integer,
  description  text,
  quantity     numeric(12,3) DEFAULT 1,
  unit_price   numeric(12,2) DEFAULT 0,
  discount     numeric(12,2) DEFAULT 0,
  line_total   numeric(12,2) DEFAULT 0,
  sort_order   integer DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz
);

CREATE INDEX IF NOT EXISTS invoice_lines_invoice_idx ON invoice_lines(invoice_id);
CREATE INDEX IF NOT EXISTS invoice_lines_company_idx ON invoice_lines(company_id);
CREATE INDEX IF NOT EXISTS invoice_lines_item_idx    ON invoice_lines(item_id);

ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "invoice_lines select by company" ON invoice_lines
    FOR SELECT USING (company_id = get_user_company_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "invoice_lines insert by company" ON invoice_lines
    FOR INSERT WITH CHECK (company_id = get_user_company_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "invoice_lines update by company" ON invoice_lines
    FOR UPDATE USING (company_id = get_user_company_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "invoice_lines delete by company" ON invoice_lines
    FOR DELETE USING (company_id = get_user_company_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
