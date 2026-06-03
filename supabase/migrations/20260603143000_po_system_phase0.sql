-- ====================================================================
-- PURCHASE ORDER SYSTEM — PHASE 0
--
-- All schema for the PO module lands in this single migration so the
-- application code in Phases 1A–1G never needs to touch the database
-- structure again. Pre-existing tables get nullable columns with safe
-- defaults so every existing flow continues working byte-for-byte.
--
-- Tables:
--   vendors                    — vendor master (currently free-text in
--                                manual_expenses.vendor + products.manufacturer)
--   purchase_orders            — PO header
--   purchase_order_lines       — PO body (one line per product on the PO)
--   purchase_order_line_jobs   — many-to-many: one PO line can fulfill
--                                multiple job_lines (aggregation)
--   po_receipts                — receiving event header (supports partial shipments)
--   po_receipt_lines           — what came in this specific receipt
--   bills                      — Accounts Payable
--   bill_payments              — payments against bills
--
-- Columns added:
--   jobs.parts_status                       — independent of status enum
--   products_services.default_vendor_id     — preferred supplier
--   products_services.vendor_sku            — vendor's part number
--   products_services.lead_time_days        — order → arrival window
--   products_services.reorder_point         — auto-suggest threshold
--   products_services.reorder_qty           — default qty to order
--   inventory.allocated_qty                 — committed to in-progress jobs
--   job_lines.allocated_qty                 — reserved for this job
--   job_lines.consumed_qty                  — used by this job
--   job_lines.po_line_id                    — back-link to the PO that fulfilled
--   manual_expenses.bill_id                 — link expenses to bills
--
-- Backfill: vendors created from distinct (company_id, manufacturer)
-- pairs found in products_services so users don't re-type names.
-- ====================================================================


-- ── 1. VENDORS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vendors (
  id                       bigserial PRIMARY KEY,
  company_id               bigint NOT NULL,
  name                     text NOT NULL,
  business_name            text,
  contact_name             text,
  email                    text,
  phone                    text,
  billing_address          text,
  default_payment_terms    text DEFAULT 'Net 30',
  default_tax_rate         numeric(5,3) DEFAULT 0,
  notes                    text,
  qb_vendor_id             text,
  qb_sync_at               timestamptz,
  active                   boolean DEFAULT true,
  created_at               timestamptz DEFAULT now(),
  updated_at               timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS vendors_company_idx       ON public.vendors (company_id);
CREATE INDEX IF NOT EXISTS vendors_company_name_idx  ON public.vendors (company_id, name);
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY vendors_company_isolation ON public.vendors
    USING (company_id IN (SELECT e.company_id FROM public.employees e WHERE e.email = auth.jwt()->>'email' AND e.active = true))
    WITH CHECK (company_id IN (SELECT e.company_id FROM public.employees e WHERE e.email = auth.jwt()->>'email' AND e.active = true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY vendors_service_role ON public.vendors FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMENT ON TABLE public.vendors IS
  'Vendor / supplier master. Replaces the free-text fields previously stored in manual_expenses.vendor and products_services.manufacturer.';


-- ── 2. PRODUCTS_SERVICES: vendor + reorder fields ────────────────────
ALTER TABLE public.products_services
  ADD COLUMN IF NOT EXISTS default_vendor_id bigint REFERENCES public.vendors(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vendor_sku        text,
  ADD COLUMN IF NOT EXISTS lead_time_days    integer,
  ADD COLUMN IF NOT EXISTS reorder_point     numeric(12,3),
  ADD COLUMN IF NOT EXISTS reorder_qty       numeric(12,3);
CREATE INDEX IF NOT EXISTS products_services_default_vendor_idx
  ON public.products_services (default_vendor_id);


-- ── 3. INVENTORY: allocated_qty ──────────────────────────────────────
ALTER TABLE public.inventory
  ADD COLUMN IF NOT EXISTS allocated_qty numeric(12,3) DEFAULT 0 NOT NULL;
COMMENT ON COLUMN public.inventory.allocated_qty IS
  'Portion of quantity already committed to in-progress jobs. available = quantity - allocated_qty.';


-- ── 4. JOB_LINES: allocation + consumption + PO backlink ─────────────
ALTER TABLE public.job_lines
  ADD COLUMN IF NOT EXISTS allocated_qty numeric(12,3) DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS consumed_qty  numeric(12,3) DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS po_line_id    bigint;  -- FK added after po_lines table exists


-- ── 5. JOBS: parts_status (independent of status enum) ───────────────
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS parts_status text DEFAULT 'not_needed';
DO $$ BEGIN
  ALTER TABLE public.jobs ADD CONSTRAINT jobs_parts_status_check
    CHECK (parts_status IN (
      'not_needed','in_stock','needs_order','ordered',
      'partial_received','received','allocated','consumed'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS jobs_parts_status_idx
  ON public.jobs (company_id, parts_status) WHERE parts_status <> 'not_needed';
COMMENT ON COLUMN public.jobs.parts_status IS
  'Procurement lifecycle, independent of job.status. Lets companies keep custom status pipelines while still tracking parts state.';


-- ── 6. PURCHASE_ORDERS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id                          bigserial PRIMARY KEY,
  company_id                  bigint NOT NULL,
  po_number                   text NOT NULL,
  vendor_id                   bigint NOT NULL REFERENCES public.vendors(id),
  job_id                      bigint REFERENCES public.jobs(id) ON DELETE SET NULL,  -- nullable: stock POs or multi-job POs
  status                      text NOT NULL DEFAULT 'draft'
                                CHECK (status IN ('draft','sent','partial_received','received','closed','cancelled')),
  subtotal                    numeric(12,2) DEFAULT 0,
  tax                         numeric(12,2) DEFAULT 0,
  shipping                    numeric(12,2) DEFAULT 0,
  total                       numeric(12,2) DEFAULT 0,
  expected_delivery_date      date,
  sent_at                     timestamptz,
  received_at                 timestamptz,
  closed_at                   timestamptz,
  created_by                  bigint REFERENCES public.employees(id) ON DELETE SET NULL,
  notes                       text,
  internal_notes              text,
  pdf_url                     text,
  vendor_acknowledgement_ref  text,
  created_at                  timestamptz DEFAULT now(),
  updated_at                  timestamptz DEFAULT now(),
  UNIQUE (company_id, po_number)
);
CREATE INDEX IF NOT EXISTS purchase_orders_company_status_idx ON public.purchase_orders (company_id, status);
CREATE INDEX IF NOT EXISTS purchase_orders_vendor_idx         ON public.purchase_orders (vendor_id);
CREATE INDEX IF NOT EXISTS purchase_orders_job_idx            ON public.purchase_orders (job_id);
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY purchase_orders_company_isolation ON public.purchase_orders
    USING (company_id IN (SELECT e.company_id FROM public.employees e WHERE e.email = auth.jwt()->>'email' AND e.active = true))
    WITH CHECK (company_id IN (SELECT e.company_id FROM public.employees e WHERE e.email = auth.jwt()->>'email' AND e.active = true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY purchase_orders_service_role ON public.purchase_orders FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── 7. PURCHASE_ORDER_LINES ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.purchase_order_lines (
  id                  bigserial PRIMARY KEY,
  company_id          bigint NOT NULL,
  po_id               bigint NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  product_id          bigint REFERENCES public.products_services(id) ON DELETE SET NULL,
  description         text NOT NULL,
  quantity_ordered    numeric(12,3) NOT NULL DEFAULT 0,
  quantity_received   numeric(12,3) NOT NULL DEFAULT 0,
  unit_cost           numeric(12,2) NOT NULL DEFAULT 0,
  line_total          numeric(12,2) NOT NULL DEFAULT 0,
  sort_order          integer DEFAULT 0,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS purchase_order_lines_po_idx       ON public.purchase_order_lines (po_id);
CREATE INDEX IF NOT EXISTS purchase_order_lines_product_idx  ON public.purchase_order_lines (product_id);
ALTER TABLE public.purchase_order_lines ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY pol_company_isolation ON public.purchase_order_lines
    USING (company_id IN (SELECT e.company_id FROM public.employees e WHERE e.email = auth.jwt()->>'email' AND e.active = true))
    WITH CHECK (company_id IN (SELECT e.company_id FROM public.employees e WHERE e.email = auth.jwt()->>'email' AND e.active = true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY pol_service_role ON public.purchase_order_lines FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Now backfill the FK on job_lines.po_line_id (table exists)
DO $$ BEGIN
  ALTER TABLE public.job_lines
    ADD CONSTRAINT job_lines_po_line_id_fkey
    FOREIGN KEY (po_line_id) REFERENCES public.purchase_order_lines(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── 8. PURCHASE_ORDER_LINE_JOBS (many-to-many for aggregation) ───────
CREATE TABLE IF NOT EXISTS public.purchase_order_line_jobs (
  id            bigserial PRIMARY KEY,
  company_id    bigint NOT NULL,
  po_line_id    bigint NOT NULL REFERENCES public.purchase_order_lines(id) ON DELETE CASCADE,
  job_line_id   bigint NOT NULL REFERENCES public.job_lines(id) ON DELETE CASCADE,
  job_id        bigint NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  quantity      numeric(12,3) NOT NULL,
  created_at    timestamptz DEFAULT now(),
  UNIQUE (po_line_id, job_line_id)
);
CREATE INDEX IF NOT EXISTS polj_po_line_idx   ON public.purchase_order_line_jobs (po_line_id);
CREATE INDEX IF NOT EXISTS polj_job_line_idx  ON public.purchase_order_line_jobs (job_line_id);
CREATE INDEX IF NOT EXISTS polj_job_idx       ON public.purchase_order_line_jobs (job_id);
ALTER TABLE public.purchase_order_line_jobs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY polj_company_isolation ON public.purchase_order_line_jobs
    USING (company_id IN (SELECT e.company_id FROM public.employees e WHERE e.email = auth.jwt()->>'email' AND e.active = true))
    WITH CHECK (company_id IN (SELECT e.company_id FROM public.employees e WHERE e.email = auth.jwt()->>'email' AND e.active = true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY polj_service_role ON public.purchase_order_line_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMENT ON TABLE public.purchase_order_line_jobs IS
  'Many-to-many between PO lines and job_lines. One PO line of 20 fixtures can fulfill 4 jobs needing 5 each. Used by the Procurement Queue aggregation flow and the receive-fan-out logic.';


-- ── 9. PO_RECEIPTS + PO_RECEIPT_LINES ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.po_receipts (
  id                     bigserial PRIMARY KEY,
  company_id             bigint NOT NULL,
  po_id                  bigint NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  received_at            timestamptz DEFAULT now(),
  received_by            bigint REFERENCES public.employees(id) ON DELETE SET NULL,
  packing_slip_number    text,
  notes                  text,
  photo_url              text,
  created_at             timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS po_receipts_po_idx ON public.po_receipts (po_id);
ALTER TABLE public.po_receipts ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY po_receipts_company_isolation ON public.po_receipts
    USING (company_id IN (SELECT e.company_id FROM public.employees e WHERE e.email = auth.jwt()->>'email' AND e.active = true))
    WITH CHECK (company_id IN (SELECT e.company_id FROM public.employees e WHERE e.email = auth.jwt()->>'email' AND e.active = true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY po_receipts_service_role ON public.po_receipts FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.po_receipt_lines (
  id                  bigserial PRIMARY KEY,
  company_id          bigint NOT NULL,
  receipt_id          bigint NOT NULL REFERENCES public.po_receipts(id) ON DELETE CASCADE,
  po_line_id          bigint NOT NULL REFERENCES public.purchase_order_lines(id) ON DELETE CASCADE,
  quantity_received   numeric(12,3) NOT NULL,
  condition_note      text,
  created_at          timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS po_receipt_lines_receipt_idx  ON public.po_receipt_lines (receipt_id);
CREATE INDEX IF NOT EXISTS po_receipt_lines_po_line_idx  ON public.po_receipt_lines (po_line_id);
ALTER TABLE public.po_receipt_lines ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY po_receipt_lines_company_isolation ON public.po_receipt_lines
    USING (company_id IN (SELECT e.company_id FROM public.employees e WHERE e.email = auth.jwt()->>'email' AND e.active = true))
    WITH CHECK (company_id IN (SELECT e.company_id FROM public.employees e WHERE e.email = auth.jwt()->>'email' AND e.active = true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY po_receipt_lines_service_role ON public.po_receipt_lines FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── 10. BILLS + BILL_PAYMENTS (Accounts Payable) ─────────────────────
CREATE TABLE IF NOT EXISTS public.bills (
  id              bigserial PRIMARY KEY,
  company_id      bigint NOT NULL,
  bill_number     text,
  vendor_id       bigint NOT NULL REFERENCES public.vendors(id),
  po_id           bigint REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  amount          numeric(12,2) NOT NULL DEFAULT 0,
  balance_due     numeric(12,2) NOT NULL DEFAULT 0,
  bill_date       date NOT NULL DEFAULT CURRENT_DATE,
  due_date        date,
  status          text NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open','partial','paid','void')),
  qb_bill_id      text,
  notes           text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bills_company_status_idx ON public.bills (company_id, status);
CREATE INDEX IF NOT EXISTS bills_vendor_idx         ON public.bills (vendor_id);
CREATE INDEX IF NOT EXISTS bills_po_idx             ON public.bills (po_id);
CREATE INDEX IF NOT EXISTS bills_due_date_idx       ON public.bills (company_id, due_date) WHERE status <> 'paid';
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY bills_company_isolation ON public.bills
    USING (company_id IN (SELECT e.company_id FROM public.employees e WHERE e.email = auth.jwt()->>'email' AND e.active = true))
    WITH CHECK (company_id IN (SELECT e.company_id FROM public.employees e WHERE e.email = auth.jwt()->>'email' AND e.active = true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY bills_service_role ON public.bills FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.bill_payments (
  id                bigserial PRIMARY KEY,
  company_id        bigint NOT NULL,
  bill_id           bigint NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  amount            numeric(12,2) NOT NULL,
  paid_at           timestamptz DEFAULT now(),
  method            text NOT NULL DEFAULT 'Check'
                      CHECK (method IN ('Check','ACH','Card','Cash','Wire','Other')),
  reference         text,
  notes             text,
  bank_account_id   bigint,  -- soft FK; bank_accounts is in books module
  created_at        timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bill_payments_bill_idx ON public.bill_payments (bill_id);
ALTER TABLE public.bill_payments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY bill_payments_company_isolation ON public.bill_payments
    USING (company_id IN (SELECT e.company_id FROM public.employees e WHERE e.email = auth.jwt()->>'email' AND e.active = true))
    WITH CHECK (company_id IN (SELECT e.company_id FROM public.employees e WHERE e.email = auth.jwt()->>'email' AND e.active = true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY bill_payments_service_role ON public.bill_payments FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── 11. MANUAL_EXPENSES: link to bills ───────────────────────────────
ALTER TABLE public.manual_expenses
  ADD COLUMN IF NOT EXISTS bill_id bigint REFERENCES public.bills(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS manual_expenses_bill_idx ON public.manual_expenses (bill_id);


-- ── 12. BACKFILL VENDORS from existing manufacturer values ───────────
-- Creates one vendor row per distinct (company_id, manufacturer) so
-- users don't have to retype names they already entered. Skip if
-- duplicates by name + company already exist.
INSERT INTO public.vendors (company_id, name, notes, active)
SELECT DISTINCT
       company_id,
       trim(manufacturer) AS name,
       'Auto-created from products_services.manufacturer during PO migration' AS notes,
       true AS active
  FROM public.products_services
 WHERE manufacturer IS NOT NULL
   AND trim(manufacturer) <> ''
   AND NOT EXISTS (
     SELECT 1 FROM public.vendors v
      WHERE v.company_id = public.products_services.company_id
        AND lower(v.name) = lower(trim(public.products_services.manufacturer))
   );

-- Link products to the newly-created vendor row (matches on name, case-insensitive).
UPDATE public.products_services p
   SET default_vendor_id = v.id
  FROM public.vendors v
 WHERE p.default_vendor_id IS NULL
   AND p.manufacturer IS NOT NULL
   AND v.company_id = p.company_id
   AND lower(v.name) = lower(trim(p.manufacturer));


NOTIFY pgrst, 'reload schema';
