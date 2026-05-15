-- ====================================================================
-- Add-on services that justify customer out-of-pocket without inflating
-- the utility incentive base.
--
-- The "Give-Me" engine in Lenard currently lets a rep type a custom
-- amount with no service description — that's the line that looks
-- bad. Replacement: a catalog of named services HHH already performs
-- but doesn't itemize today (utility incentive processing, facility
-- audit, M&V reporting, etc.). Salesperson picks from the catalog;
-- each pick is auto-tagged out-of-utility-scope so it never inflates
-- the incentive math.
--
-- Schema:
--   products_services.in_utility_scope (boolean, default true) —
--     when false, this product/service is "customer add-on only" and
--     should be excluded from the utility-incentive base + utility
--     invoice scope.
--   products_services.floor_price / ceiling_price — optional min/max
--     pricing range so reps can adjust within reasonable bounds
--     without giving away services for free or inflating beyond
--     defensible levels.
--   job_lines.in_utility_scope / quote_lines.in_utility_scope /
--     invoice_lines.in_utility_scope — denormalized at line-creation
--     time so the answer is locked even if the catalog changes later.
--
-- Seed: ~21 add-on services for HHH (company_id = 3) only. Other
-- companies seed their own when they enable utility invoicing.
-- ====================================================================

-- ----- Schema changes ------------------------------------------------
ALTER TABLE public.products_services
  ADD COLUMN IF NOT EXISTS in_utility_scope boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS floor_price      numeric,
  ADD COLUMN IF NOT EXISTS ceiling_price    numeric,
  ADD COLUMN IF NOT EXISTS suggest_in_lenard boolean NOT NULL DEFAULT false;

-- Per-line scope flags (denormalized so the audit trail is locked at
-- the moment of creation, not whatever the catalog says later).
ALTER TABLE public.job_lines
  ADD COLUMN IF NOT EXISTS in_utility_scope boolean DEFAULT true;
ALTER TABLE public.quote_lines
  ADD COLUMN IF NOT EXISTS in_utility_scope boolean DEFAULT true;
ALTER TABLE public.invoice_lines
  ADD COLUMN IF NOT EXISTS in_utility_scope boolean DEFAULT true;

-- Per-customer + per-business-unit opt-in for the utility-invoice
-- feature (so customers + BUs that don't qualify don't see it).
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS utility_invoicing_enabled boolean DEFAULT NULL;
COMMENT ON COLUMN public.customers.utility_invoicing_enabled IS
  'Per-customer override for the utility-invoice feature. NULL = inherit from business unit default. true/false = explicit override.';

CREATE INDEX IF NOT EXISTS idx_products_services_addon_category
  ON public.products_services (company_id, suggest_in_lenard, active)
  WHERE suggest_in_lenard = true AND active = true;

-- ----- Seed catalog for HHH (company_id = 3) -------------------------
-- All in product_category = 'Add-On Service', in_utility_scope = false,
-- suggest_in_lenard = true. Salesperson sees them as suggestions in
-- the Give-Me engine; the line items show up on customer invoices but
-- are excluded from utility-invoice scope.
DO $$
DECLARE
  hhh_co integer := 3;
  rec RECORD;
BEGIN
  FOR rec IN SELECT * FROM (VALUES
    -- (name, description, default_price, floor, ceiling)
    ('Utility Incentive Processing Fee',
     'Includes utility application paperwork, follow-up with utility company (SRP / RMP), incentive disbursement coordination, and project verification submissions. Approximately 5-10 hours of office time per project.',
     350,  250,  500),
    ('Facility Lighting Audit',
     'Pre-project facility walkthrough, fixture inventory, photometric measurement, and existing-system documentation. Used to design the optimal retrofit scope and qualify your facility for the utility incentive program.',
     750,  500, 3000),
    ('Photometric Design / Lighting Layout',
     'Custom lighting design for your facility, ensuring foot-candle compliance with current codes, glare modeling, and optimal fixture placement.',
     250,  150,  500),
    ('Energy Savings Projection Report',
     'Detailed kWh / cost / CO2 model showing projected annual savings. Includes monthly breakdown and 10-year projection your facilities team or CFO can use for budget approval.',
     200,  100,  300),
    ('ROI / Payback Analysis Document',
     'Formal payback period, IRR, and NPV analysis customized to your facility''s usage patterns and current utility rates.',
     150,  100,  200),
    ('Spec & Cut Sheet Package',
     'Assembled fixture documentation package including manufacturer cut sheets, DLC certifications, and warranty documents for your facility records.',
     100,   50,  150),
    ('Project Management Fee',
     'Dedicated project management for the install: scheduling, coordination with your facilities team, change-order handling, daily progress reporting, and quality control inspections.',
     500,  200, 1000),
    ('Mobilization / Site Setup',
     'First-day staging, equipment delivery, parking permits, site protection, and initial coordination with on-site personnel.',
     300,  150,  500),
    ('After-Hours / Weekend Premium',
     'Premium for installation outside normal business hours to avoid disrupting your operations. Covers crew overtime, supervisor presence, and after-hours dispatch overhead.',
     750,  300, 1500),
    ('Permit Handling Fee',
     'Pulling building permits, coordinating with your jurisdiction''s inspector, scheduling required inspections, and producing final sign-off documentation. Permit cost itself is passed through separately.',
     200,  100,  300),
    ('PCB / Hazmat Disposal',
     'Certified disposal of pre-1979 PCB-containing ballasts and other hazardous materials. Includes EPA-compliant manifest documentation. Priced per fixture.',
      50,   25,  100),
    ('Travel Fee (over 30 miles)',
     'Travel surcharge for jobs more than 30 miles from our service base. Covers crew travel time, vehicle wear, and per-diem for multi-day out-of-area projects. Priced per round-trip mile beyond 30 miles.',
     150,   75,  500),
    ('Extended Warranty (3-year)',
     '3-year extended warranty on top of the standard 1-year manufacturer warranty. Covers parts AND labor on any failure within the warranty period.',
     250,  150,  400),
    ('Extended Warranty (5-year)',
     '5-year extended warranty on top of the standard 1-year manufacturer warranty. Covers parts AND labor on any failure within the warranty period. Best value for long-life installations.',
     500,  300,  800),
    ('Annual Lighting Tune-Up',
     'Yearly inspection and maintenance visit: fixture cleaning, sensor recalibration, dimming verification, and any necessary minor adjustments. Helps preserve the energy savings you signed up for.',
     400,  200,  600),
    ('Smart Controls Programming Setup',
     'Configuration of occupancy sensors, daylight harvesting, dimming schedules, and zoning. Includes initial commissioning and 30-day fine-tuning visit.',
     500,  200, 1500),
    ('Lighting Controls Training',
     'On-site training for your facility staff on operating the new lighting controls. Includes a quick-reference guide for your team.',
     200,  150,  300),
    ('M&V (Measurement & Verification) Report',
     '12-month post-install verification that documented the actual energy savings achieved vs the projected savings. Includes utility-bill analysis and signed report. Required by some utility programs for larger incentives.',
     500,  300,  800),
    ('Title 24 / IECC Energy Code Compliance Package',
     'Full energy-code compliance documentation for your jurisdiction. Includes signed forms, photometric calculations, and any required submittals.',
     300,  200,  500),
    ('179D Tax Deduction Documentation Support',
     'Documentation package supporting the federal 179D commercial-building energy-efficiency tax deduction (up to $1.88/sqft). Your CPA uses this to claim the deduction on your tax return.',
     500,  250, 1000),
    ('Sustainability / ESG Reporting Package',
     'Annualized sustainability metrics: kWh saved, CO2 emissions avoided, water saved (if applicable), and equivalent-trees-planted figures. Suitable for your sustainability or annual report.',
     250,  100,  500),
    ('Priority Response SLA',
     '4-hour response on warranty calls (vs standard 24-hour). Annual fee. Best for facilities where lighting downtime impacts operations or safety.',
     400,  200,  600)
  ) AS t(name, description, default_price, floor, ceiling) LOOP
    INSERT INTO public.products_services (
      company_id, name, description, type, product_category,
      unit_price, floor_price, ceiling_price,
      in_utility_scope, suggest_in_lenard, taxable, active,
      cost, markup_percent
    )
    SELECT
      hhh_co, rec.name, rec.description, 'service', 'Add-On Service',
      rec.default_price, rec.floor, rec.ceiling,
      false, true, false, true,
      0, 100
    WHERE NOT EXISTS (
      SELECT 1 FROM public.products_services
       WHERE company_id = hhh_co AND name = rec.name AND product_category = 'Add-On Service'
    );
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
