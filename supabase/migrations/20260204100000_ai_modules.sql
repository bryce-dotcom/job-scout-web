-- Create ai_modules table for managing AI agent modules
CREATE TABLE IF NOT EXISTS ai_modules (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id),
  module_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  description TEXT,
  icon TEXT DEFAULT 'Bot',
  status TEXT DEFAULT 'active',
  default_menu_section TEXT NOT NULL,
  default_menu_parent TEXT,
  user_menu_section TEXT,
  user_menu_parent TEXT,
  sort_order INTEGER DEFAULT 0,
  capabilities_json JSONB DEFAULT '{}',
  config_json JSONB DEFAULT '{}',
  route_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_ai_modules_company_id ON ai_modules(company_id);
CREATE INDEX IF NOT EXISTS idx_ai_modules_status ON ai_modules(status);
CREATE INDEX IF NOT EXISTS idx_ai_modules_default_menu_section ON ai_modules(default_menu_section);

-- Enable RLS on ai_modules
ALTER TABLE ai_modules ENABLE ROW LEVEL SECURITY;

-- Open RLS policy for ai_modules
DROP POLICY IF EXISTS "Allow all access to ai_modules" ON ai_modules;
CREATE POLICY "Allow all access to ai_modules" ON ai_modules
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Insert Lenard - Lighting AI agent
INSERT INTO ai_modules (company_id, module_name, display_name, description, icon, status, default_menu_section, default_menu_parent, sort_order, route_path)
VALUES (
  3,
  'lenard',
  'Lenard - Lighting AI',
  'AI-powered lighting audits and energy savings calculations',
  'Bot',
  'active',
  'SALES_FLOW',
  'Quotes',
  10,
  '/agents/lenard'
);

-- Insert Freddy - Fleet AI agent
INSERT INTO ai_modules (company_id, module_name, display_name, description, icon, status, default_menu_section, default_menu_parent, sort_order, route_path)
VALUES (
  3,
  'freddy',
  'Freddy - Fleet AI',
  'AI fleet manager for vehicles equipment and maintenance',
  'Bot',
  'active',
  'OPERATIONS',
  NULL,
  20,
  '/agents/freddy'
);
