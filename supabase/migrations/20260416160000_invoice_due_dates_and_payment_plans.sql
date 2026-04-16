-- Invoice due dates + payment plans (Tracy's feedback e345e2f7)
--
-- 1) Adds due_date to invoices (referenced by InvoiceDetail PDF and Frankie
--    Collections but never persisted before). Backfills existing rows to
--    created_at + 30 days (Net-30) so downstream views work immediately.
-- 2) Adds payment_plans table for recurring scheduled payments tied to a
--    parent invoice. When the underlying invoice's balance hits zero, the
--    plan is marked complete and stops appearing in collections lists.

-- ── 1) due_date on invoices ─────────────────────────────────────
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS due_date date;

-- Backfill: existing invoices default to created_at + 30 days
UPDATE invoices
SET due_date = (created_at::date + INTERVAL '30 days')::date
WHERE due_date IS NULL;

CREATE INDEX IF NOT EXISTS invoices_due_date_idx
  ON invoices(due_date)
  WHERE payment_status <> 'Paid';

-- ── 2) payment_plans ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_plans (
  id              bigserial PRIMARY KEY,
  company_id      bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id      bigint NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  customer_id     bigint REFERENCES customers(id) ON DELETE SET NULL,
  payment_method_id bigint REFERENCES customer_payment_methods(id) ON DELETE SET NULL,
  -- Schedule
  frequency       text NOT NULL DEFAULT 'monthly',  -- weekly, bi-weekly, monthly, quarterly
  installment_amount numeric(12,2) NOT NULL,
  total_installments integer NOT NULL,
  installments_completed integer NOT NULL DEFAULT 0,
  start_date      date NOT NULL,
  next_charge_date date,
  end_date        date,
  -- Status + audit
  status          text NOT NULL DEFAULT 'active',   -- active, paused, completed, cancelled
  auto_charge     boolean NOT NULL DEFAULT false,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz,
  completed_at    timestamptz
);

CREATE INDEX IF NOT EXISTS payment_plans_invoice_idx ON payment_plans(invoice_id);
CREATE INDEX IF NOT EXISTS payment_plans_company_idx ON payment_plans(company_id);
CREATE INDEX IF NOT EXISTS payment_plans_next_charge_idx
  ON payment_plans(next_charge_date)
  WHERE status = 'active';

ALTER TABLE payment_plans ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "payment_plans select by company" ON payment_plans
    FOR SELECT USING (company_id = get_user_company_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "payment_plans insert by company" ON payment_plans
    FOR INSERT WITH CHECK (company_id = get_user_company_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "payment_plans update by company" ON payment_plans
    FOR UPDATE USING (company_id = get_user_company_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "payment_plans delete by company" ON payment_plans
    FOR DELETE USING (company_id = get_user_company_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- When an invoice flips to Paid, auto-complete any active plans tied to it.
CREATE OR REPLACE FUNCTION complete_payment_plans_on_invoice_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.payment_status = 'Paid' AND (OLD.payment_status IS NULL OR OLD.payment_status <> 'Paid') THEN
    UPDATE payment_plans
       SET status = 'completed',
           completed_at = now(),
           updated_at = now()
     WHERE invoice_id = NEW.id
       AND status = 'active';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_complete_payment_plans_on_invoice_paid ON invoices;
CREATE TRIGGER trg_complete_payment_plans_on_invoice_paid
  AFTER UPDATE OF payment_status ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION complete_payment_plans_on_invoice_paid();
