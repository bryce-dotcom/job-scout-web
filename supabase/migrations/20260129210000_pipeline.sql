-- Pipeline Feature: Pipedrive-style Kanban board
-- Tables: pipeline_stages, deals, deal_activities

-- Pipeline Stages (customizable per company)
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  win_probability INTEGER DEFAULT 0, -- 0-100%
  color TEXT DEFAULT '#5a6349',
  is_won BOOLEAN DEFAULT false,
  is_lost BOOLEAN DEFAULT false,
  rotting_days INTEGER DEFAULT 14, -- days before deal is considered "rotting"
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Deals (the cards on the Kanban board)
CREATE TABLE IF NOT EXISTS deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  stage_id UUID REFERENCES pipeline_stages(id) ON DELETE SET NULL,

  -- Deal info
  title TEXT NOT NULL,
  value DECIMAL(12,2) DEFAULT 0,
  currency TEXT DEFAULT 'USD',

  -- Linked records (using INTEGER to match existing table schemas)
  lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  audit_id INTEGER REFERENCES lighting_audits(id) ON DELETE SET NULL,
  quote_id INTEGER REFERENCES quotes(id) ON DELETE SET NULL,
  job_id INTEGER REFERENCES jobs(id) ON DELETE SET NULL,

  -- Assignment
  owner_id INTEGER REFERENCES employees(id) ON DELETE SET NULL,

  -- Deal details
  expected_close_date DATE,
  win_probability INTEGER, -- override stage probability

  -- Status
  status TEXT DEFAULT 'open', -- open, won, lost
  won_at TIMESTAMPTZ,
  lost_at TIMESTAMPTZ,
  lost_reason TEXT,
  won_notes TEXT,

  -- Contact info (can be overridden from lead/customer)
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  organization TEXT,

  -- Notes
  notes TEXT,

  -- Position for ordering within stage
  position INTEGER DEFAULT 0,

  -- Timestamps
  last_activity_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Deal Activities (timeline of events)
CREATE TABLE IF NOT EXISTS deal_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,

  -- Activity type
  activity_type TEXT NOT NULL, -- note, call, email, meeting, task, stage_change, created, won, lost

  -- Activity details
  subject TEXT,
  description TEXT,

  -- For stage changes
  from_stage_id UUID REFERENCES pipeline_stages(id),
  to_stage_id UUID REFERENCES pipeline_stages(id),

  -- For scheduled activities
  scheduled_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  is_completed BOOLEAN DEFAULT false,

  -- Who did it
  created_by INTEGER REFERENCES employees(id),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_company ON pipeline_stages(company_id);
CREATE INDEX IF NOT EXISTS idx_deals_company ON deals(company_id);
CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage_id);
CREATE INDEX IF NOT EXISTS idx_deals_owner ON deals(owner_id);
CREATE INDEX IF NOT EXISTS idx_deals_status ON deals(status);
CREATE INDEX IF NOT EXISTS idx_deals_lead ON deals(lead_id);
CREATE INDEX IF NOT EXISTS idx_deals_customer ON deals(customer_id);
CREATE INDEX IF NOT EXISTS idx_deal_activities_deal ON deal_activities(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_activities_company ON deal_activities(company_id);

-- Enable RLS
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_activities ENABLE ROW LEVEL SECURITY;

-- RLS Policies for pipeline_stages
CREATE POLICY "pipeline_stages_select" ON pipeline_stages
  FOR SELECT USING (
    company_id IN (
      SELECT e.company_id FROM employees e
      WHERE e.email = auth.jwt()->>'email' AND e.active = true
    )
  );

CREATE POLICY "pipeline_stages_insert" ON pipeline_stages
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT e.company_id FROM employees e
      WHERE e.email = auth.jwt()->>'email' AND e.active = true
    )
  );

CREATE POLICY "pipeline_stages_update" ON pipeline_stages
  FOR UPDATE USING (
    company_id IN (
      SELECT e.company_id FROM employees e
      WHERE e.email = auth.jwt()->>'email' AND e.active = true
    )
  );

CREATE POLICY "pipeline_stages_delete" ON pipeline_stages
  FOR DELETE USING (
    company_id IN (
      SELECT e.company_id FROM employees e
      WHERE e.email = auth.jwt()->>'email' AND e.active = true
    )
  );

-- RLS Policies for deals
CREATE POLICY "deals_select" ON deals
  FOR SELECT USING (
    company_id IN (
      SELECT e.company_id FROM employees e
      WHERE e.email = auth.jwt()->>'email' AND e.active = true
    )
  );

CREATE POLICY "deals_insert" ON deals
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT e.company_id FROM employees e
      WHERE e.email = auth.jwt()->>'email' AND e.active = true
    )
  );

CREATE POLICY "deals_update" ON deals
  FOR UPDATE USING (
    company_id IN (
      SELECT e.company_id FROM employees e
      WHERE e.email = auth.jwt()->>'email' AND e.active = true
    )
  );

CREATE POLICY "deals_delete" ON deals
  FOR DELETE USING (
    company_id IN (
      SELECT e.company_id FROM employees e
      WHERE e.email = auth.jwt()->>'email' AND e.active = true
    )
  );

-- RLS Policies for deal_activities
CREATE POLICY "deal_activities_select" ON deal_activities
  FOR SELECT USING (
    company_id IN (
      SELECT e.company_id FROM employees e
      WHERE e.email = auth.jwt()->>'email' AND e.active = true
    )
  );

CREATE POLICY "deal_activities_insert" ON deal_activities
  FOR INSERT WITH CHECK (
    company_id IN (
      SELECT e.company_id FROM employees e
      WHERE e.email = auth.jwt()->>'email' AND e.active = true
    )
  );

CREATE POLICY "deal_activities_update" ON deal_activities
  FOR UPDATE USING (
    company_id IN (
      SELECT e.company_id FROM employees e
      WHERE e.email = auth.jwt()->>'email' AND e.active = true
    )
  );

CREATE POLICY "deal_activities_delete" ON deal_activities
  FOR DELETE USING (
    company_id IN (
      SELECT e.company_id FROM employees e
      WHERE e.email = auth.jwt()->>'email' AND e.active = true
    )
  );

-- Insert default pipeline stages for existing companies
INSERT INTO pipeline_stages (company_id, name, position, win_probability, color, rotting_days)
SELECT
  c.id,
  stage.name,
  stage.position,
  stage.win_probability,
  stage.color,
  stage.rotting_days
FROM companies c
CROSS JOIN (
  VALUES
    ('Lead In', 0, 10, '#6b7280', 7),
    ('Contact Made', 1, 20, '#3b82f6', 10),
    ('Needs Analysis', 2, 40, '#8b5cf6', 14),
    ('Proposal Sent', 3, 60, '#f59e0b', 14),
    ('Negotiation', 4, 80, '#ef4444', 21),
    ('Won', 5, 100, '#22c55e', 999),
    ('Lost', 6, 0, '#64748b', 999)
) AS stage(name, position, win_probability, color, rotting_days)
WHERE NOT EXISTS (
  SELECT 1 FROM pipeline_stages ps WHERE ps.company_id = c.id
);

-- Mark Won and Lost stages
UPDATE pipeline_stages SET is_won = true WHERE name = 'Won';
UPDATE pipeline_stages SET is_lost = true WHERE name = 'Lost';
