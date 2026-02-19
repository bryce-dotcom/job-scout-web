-- Conrad Connect - AI Email Marketing Agent (Constant Contact Integration)

-- 1. Insert Conrad into agents catalog
INSERT INTO agents (slug, name, title, full_name, tagline, description, icon, trade_category, ai_capabilities, price_monthly, price_yearly, is_free, status, display_order)
VALUES (
  'conrad-connect',
  'Conrad',
  'Email Marketing Specialist',
  'Conrad Connect',
  'Your AI email marketing assistant — keeps customers connected',
  'Conrad helps you create and send professional email campaigns to your customers and leads using Constant Contact. He writes compelling emails with AI, syncs your contacts automatically, tracks engagement, and suggests the best times to follow up.',
  'Mail',
  'Marketing',
  ARRAY['AI email copywriting', 'Smart send-time optimization', 'Contact list management', 'Campaign performance insights', 'Automated follow-up suggestions'],
  14.99, 149.99, false, 'active', 30
);

-- 2. Constant Contact OAuth integration (one per company)
CREATE TABLE cc_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  cc_account_id TEXT,
  connected_by INTEGER REFERENCES employees(id),
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'disconnected' CHECK (status IN ('active', 'disconnected', 'expired')),
  sync_contacts_enabled BOOLEAN DEFAULT true,
  last_contact_sync TIMESTAMPTZ,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id)
);

-- 3. Email templates (reusable, AI-generated or manual)
CREATE TABLE email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  subject TEXT,
  html_content TEXT,
  text_content TEXT,
  category TEXT DEFAULT 'custom' CHECK (category IN ('follow_up', 'quote_reminder', 'seasonal', 'newsletter', 'win_back', 'custom')),
  variables JSONB DEFAULT '[]',
  ai_generated BOOLEAN DEFAULT false,
  cc_template_id TEXT,
  created_by INTEGER REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Email campaigns (mirrors CC campaigns + our metadata)
CREATE TABLE email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  template_id UUID REFERENCES email_templates(id),
  name TEXT NOT NULL,
  subject TEXT,
  from_name TEXT,
  from_email TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'cancelled')),
  cc_campaign_id TEXT,
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  recipient_list_type TEXT DEFAULT 'all' CHECK (recipient_list_type IN ('all', 'customers', 'leads', 'segment', 'manual')),
  recipient_filter JSONB DEFAULT '{}',
  recipient_count INTEGER DEFAULT 0,
  stats JSONB DEFAULT '{}',
  last_stats_poll TIMESTAMPTZ,
  created_by INTEGER REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Contact mapping (Job Scout customers/leads → CC contact IDs)
CREATE TABLE cc_contact_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  cc_contact_id TEXT NOT NULL,
  email TEXT NOT NULL,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  sync_status TEXT DEFAULT 'synced' CHECK (sync_status IN ('synced', 'error', 'unsubscribed'))
);

-- 6. Email automations (our own trigger engine — CC doesn't support API-created automations)
CREATE TABLE email_automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('audit_completed', 'quote_sent', 'quote_no_response', 'job_completed', 'customer_anniversary', 'seasonal')),
  trigger_config JSONB DEFAULT '{}',
  template_id UUID REFERENCES email_templates(id),
  active BOOLEAN DEFAULT true,
  last_triggered TIMESTAMPTZ,
  times_triggered INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_cc_integrations_company ON cc_integrations(company_id);
CREATE INDEX idx_email_templates_company ON email_templates(company_id);
CREATE INDEX idx_email_templates_category ON email_templates(category);
CREATE INDEX idx_email_campaigns_company ON email_campaigns(company_id);
CREATE INDEX idx_email_campaigns_status ON email_campaigns(status);
CREATE INDEX idx_cc_contact_map_company ON cc_contact_map(company_id);
CREATE INDEX idx_cc_contact_map_customer ON cc_contact_map(customer_id);
CREATE INDEX idx_cc_contact_map_lead ON cc_contact_map(lead_id);
CREATE INDEX idx_cc_contact_map_cc_id ON cc_contact_map(cc_contact_id);
CREATE INDEX idx_email_automations_company ON email_automations(company_id);
CREATE INDEX idx_email_automations_trigger ON email_automations(trigger_type);

-- Enable RLS
ALTER TABLE cc_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE cc_contact_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_automations ENABLE ROW LEVEL SECURITY;

-- RLS policies (permissive for now, matching existing pattern)
CREATE POLICY "cc_integrations_all" ON cc_integrations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "email_templates_all" ON email_templates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "email_campaigns_all" ON email_campaigns FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "cc_contact_map_all" ON cc_contact_map FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "email_automations_all" ON email_automations FOR ALL USING (true) WITH CHECK (true);

-- Recruit Conrad for dev company (HHH Services, company_id=3) like Lenard/Freddy
INSERT INTO company_agents (company_id, agent_id)
SELECT 3, id FROM agents WHERE slug = 'conrad-connect';

-- Insert ai_module entry for Conrad
INSERT INTO ai_modules (company_id, module_name, display_name, description, icon, status, default_menu_section, default_menu_parent, sort_order, route_path)
VALUES (
  3,
  'conrad-connect',
  'Conrad - Email Marketing AI',
  'AI email marketing agent powered by Constant Contact',
  'Mail',
  'active',
  'SALES_FLOW',
  NULL,
  30,
  '/agents/conrad-connect'
);
