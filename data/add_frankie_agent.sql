-- Add Frankie (AI CFO) to the agents table
INSERT INTO agents (slug, name, title, full_name, tagline, description, icon, trade_category, ai_capabilities, is_free, price_monthly, price_yearly, status, display_order)
VALUES (
  'frankie-finance',
  'Frankie',
  'The AI CFO',
  'Frankie The AI CFO',
  'Your numbers, crystal clear.',
  'AI-powered financial intelligence. Frankie analyzes cash flow, tracks AR/AP aging, detects expense anomalies, automates collection reminders, calculates job profitability, and answers financial questions in plain English.',
  'dollar-sign',
  'Financial',
  ARRAY['cash_flow_analysis', 'ar_ap_tracking', 'expense_anomaly_detection', 'collection_automation', 'job_profitability', 'what_if_scenarios', 'financial_qa'],
  false,
  49.99,
  499.99,
  'active',
  3
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  title = EXCLUDED.title,
  full_name = EXCLUDED.full_name,
  tagline = EXCLUDED.tagline,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  trade_category = EXCLUDED.trade_category,
  ai_capabilities = EXCLUDED.ai_capabilities,
  price_monthly = EXCLUDED.price_monthly,
  price_yearly = EXCLUDED.price_yearly,
  status = EXCLUDED.status,
  display_order = EXCLUDED.display_order,
  updated_at = NOW();

-- Create collection_reminders table for tracking sent reminders
CREATE TABLE IF NOT EXISTS collection_reminders (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
  customer_id INTEGER REFERENCES customers(id),
  method TEXT NOT NULL DEFAULT 'email',
  urgency TEXT,
  amount_due DECIMAL(12,2),
  days_overdue INTEGER,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'sent',
  message TEXT,
  response TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS policies for collection_reminders
DO $$ BEGIN
  CREATE POLICY "collection_reminders_company_isolation"
    ON collection_reminders FOR ALL
    USING (company_id IN (
      SELECT e.company_id FROM employees e
      WHERE e.user_id = auth.uid()
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE collection_reminders ENABLE ROW LEVEL SECURITY;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_collection_reminders_company ON collection_reminders(company_id);
CREATE INDEX IF NOT EXISTS idx_collection_reminders_invoice ON collection_reminders(invoice_id);
