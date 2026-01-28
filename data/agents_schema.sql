-- Job Scout Professional Agents Schema
-- Base Camp Marketplace Architecture
-- Run in Supabase SQL Editor

-- Agents table - available AI experts
CREATE TABLE agents (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  full_name TEXT NOT NULL,
  tagline TEXT,
  description TEXT,
  icon TEXT,
  avatar_url TEXT,
  trade_category TEXT,
  ai_capabilities TEXT[],
  price_monthly DECIMAL(10,2) DEFAULT 29.99,
  price_yearly DECIMAL(10,2) DEFAULT 299.99,
  is_free BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'coming_soon',
  display_order INTEGER DEFAULT 100,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Company agents - recruited agents per company
CREATE TABLE company_agents (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  agent_id INTEGER NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  custom_name TEXT,
  activated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  subscription_status TEXT DEFAULT 'active',
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, agent_id)
);

-- Enable RLS
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_agents ENABLE ROW LEVEL SECURITY;

-- Policies (permissive for now)
CREATE POLICY "agents_all" ON agents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "company_agents_all" ON company_agents FOR ALL USING (true) WITH CHECK (true);

-- Seed agents data
INSERT INTO agents (slug, name, title, full_name, tagline, description, icon, trade_category, ai_capabilities, is_free, price_monthly, price_yearly, status, display_order) VALUES
('lenard-lighting', 'Lenard', 'The Lighting Auditor', 'Lenard The Lighting Auditor', 'Snap. Identify. Save.', 'Your LED retrofit specialist. Lenard identifies fixtures from photos, counts bulbs, recommends LED replacements, and calculates utility rebates automatically.', 'lightbulb', 'Energy', ARRAY['fixture_identification', 'count_fixtures', 'recommend_led', 'calculate_rebate'], false, 49.99, 499.99, 'active', 1),
('freddy-fleet', 'Freddy', 'The Fleet Manager', 'Freddy The Fleet Manager', 'Vehicles verified. Maintenance managed.', 'Your fleet operations expert. Freddy tracks vehicles, schedules maintenance, manages rentals, and keeps your assets road-ready with photo documentation.', 'truck', 'Operations', ARRAY['vehicle_tracking', 'maintenance_scheduling', 'photo_inspections', 'rental_management'], false, 39.99, 399.99, 'active', 2),
('walter-windows', 'Walter', 'The Window Wizard', 'Walter The Window Wizard', 'Every pane accounted for.', 'Window counting made easy. Walter analyzes building photos to count panes, identify window types, and generate accurate cleaning quotes.', 'grid-3x3', 'Cleaning', ARRAY['count_panes', 'identify_window_type', 'generate_quote'], false, 29.99, 299.99, 'coming_soon', 3),
('paula-painter', 'Paula', 'The Paint Pro', 'Paula The Paint Pro', 'Surface area? Solved.', 'AI-powered painting estimates. Paula measures surfaces, identifies materials, and calculates paint requirements from your photos.', 'paintbrush', 'Painting', ARRAY['measure_surfaces', 'identify_materials', 'estimate_paint'], false, 29.99, 299.99, 'coming_soon', 4),
('roger-roofer', 'Roger', 'The Roof Reader', 'Roger The Roof Reader', 'Damage spotted from above.', 'Aerial roof analysis expert. Roger identifies materials, spots damage, and measures areas from drone or ground photos.', 'home', 'Roofing', ARRAY['identify_material', 'spot_damage', 'measure_area'], false, 39.99, 399.99, 'coming_soon', 5),
('clara-cleaner', 'Clara', 'The Clean Queen', 'Clara The Clean Queen', 'Space analyzed. Time estimated.', 'Commercial cleaning estimator. Clara identifies space types, estimates cleaning time, and generates accurate service quotes.', 'sparkles', 'Cleaning', ARRAY['identify_space_type', 'estimate_time', 'generate_quote'], false, 29.99, 299.99, 'coming_soon', 6),
('zack-landscaper', 'Zack', 'The Yard Yeti', 'Zack The Yard Yeti', 'Measure twice. Mow once.', 'Landscape measurement specialist. Zack calculates lawn area, identifies plants, and spots problem areas from aerial photos.', 'trees', 'Landscaping', ARRAY['measure_lawn', 'identify_plants', 'spot_issues'], false, 29.99, 299.99, 'coming_soon', 7),
('pete-plumber', 'Pete', 'The Pipe Whisperer', 'Pete The Pipe Whisperer', 'Leaks don''t lie to Pete.', 'Plumbing diagnostician. Pete identifies fixtures, spots potential leaks, and recommends repairs from your photos.', 'droplets', 'Plumbing', ARRAY['identify_fixtures', 'spot_leaks', 'recommend_repairs'], false, 39.99, 399.99, 'coming_soon', 8),
('eddie-electrician', 'Eddie', 'The Amp Analyst', 'Eddie The Amp Analyst', 'Code violations? Spotted.', 'Electrical system analyst. Eddie reads panels, identifies violations, and recommends upgrades from photos.', 'zap', 'Electrical', ARRAY['identify_panels', 'spot_violations', 'recommend_upgrades'], false, 39.99, 399.99, 'coming_soon', 9),
('mason-masonry', 'Mason', 'The Stone Sage', 'Mason The Stone Sage', 'Cracks tell stories.', 'Concrete and brick specialist. Mason spots cracks, assesses damage severity, and measures repair areas.', 'mountain', 'Masonry', ARRAY['spot_cracks', 'measure_area', 'assess_damage'], false, 29.99, 299.99, 'coming_soon', 10),
('frank-flooring', 'Frank', 'The Floor Finder', 'Frank The Floor Finder', 'Material ID in a snap.', 'Flooring identification expert. Frank identifies materials, measures areas, and spots damage needing repair.', 'square', 'Flooring', ARRAY['identify_material', 'measure_area', 'spot_damage'], false, 29.99, 299.99, 'coming_soon', 11),
('harry-hvac', 'Harry', 'The Climate Commander', 'Harry The Climate Commander', 'Knows your unit inside out.', 'HVAC equipment specialist. Harry identifies makes/models, reads data plates, and recommends service.', 'thermometer', 'HVAC', ARRAY['identify_equipment', 'read_model_numbers', 'recommend_service'], false, 39.99, 399.99, 'coming_soon', 12),
('gus-gutter', 'Gus', 'The Gutter Guru', 'Gus The Gutter Guru', 'Downspouts? Counted.', 'Gutter and drainage expert. Gus measures linear feet, counts downspouts, and spots clogs from photos.', 'cloud-rain', 'Exteriors', ARRAY['measure_gutters', 'count_downspouts', 'spot_clogs'], false, 29.99, 299.99, 'coming_soon', 13),
('sammy-safety', 'Sammy', 'The Safety Scout', 'Sammy The Safety Scout', 'Hazards have nowhere to hide.', 'Job site safety expert. Sammy identifies OSHA hazards, checks compliance, and generates safety reports.', 'shield-check', 'Safety', ARRAY['identify_hazards', 'check_compliance', 'generate_report'], false, 49.99, 499.99, 'coming_soon', 14),
('victor-verify', 'Victor', 'The Verification Agent', 'Victor The Verification Agent', 'Proof of work. Guaranteed.', 'Before/after comparison specialist. Victor documents work completion with photo verification and reports.', 'camera', 'Documentation', ARRAY['compare_photos', 'verify_completion', 'document_work'], false, 19.99, 199.99, 'coming_soon', 15);

-- For dev/testing, recruit both for company 3 (HHH Services)
INSERT INTO company_agents (company_id, agent_id)
SELECT 3, id FROM agents WHERE slug IN ('lenard-lighting', 'freddy-fleet');

-- Create indexes
CREATE INDEX idx_agents_slug ON agents(slug);
CREATE INDEX idx_agents_status ON agents(status);
CREATE INDEX idx_company_agents_company ON company_agents(company_id);
CREATE INDEX idx_company_agents_agent ON company_agents(agent_id);

SELECT 'Agents schema created successfully!' as result;
