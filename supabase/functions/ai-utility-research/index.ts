import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Utah benchmark — few-shot example showing controls progression, HVAC variety, rate tiers
const UTAH_BENCHMARK = {
  providers: [
    { provider_name: "Rocky Mountain Power", state: "UT", service_territory: "Most of Utah including Salt Lake City, Ogden, Provo", has_rebate_program: true, rebate_program_url: "https://www.rockymountainpower.net/savings-energy-choices/business.html", contact_phone: "1-888-221-7070", notes: "Largest electric utility in Utah, part of PacifiCorp/Berkshire Hathaway Energy" }
  ],
  programs: [
    { provider_name: "Rocky Mountain Power", program_name: "wattsmart Business Incentives (2025)", program_type: "Prescriptive", program_category: "Comprehensive", delivery_mechanism: "Prescriptive", business_size: "All", dlc_required: true, pre_approval_required: false, application_required: true, post_inspection_required: false, contractor_prequalification: false, program_url: "https://www.rockymountainpower.net/savings-energy-choices/business.html", max_cap_percent: 70, annual_cap_dollars: 500000, source_year: 2025, eligible_sectors: ["Commercial","Industrial","Agricultural","Institutional"], eligible_building_types: ["Office","Warehouse","Retail","Restaurant","School","Hospital","Manufacturing"], required_documents: ["Application","Invoice","Spec sheets","DLC certificate"], stacking_allowed: false, stacking_rules: "Cannot combine prescriptive with custom for same equipment", funding_status: "Open", processing_time_days: 60, rebate_payment_method: "Check", program_notes_ai: "Lighting incentives vary by controls level — no controls vs networked vs LLLC. SMBE delivery has higher per-watt rates. Submit within 90 days." },
    { provider_name: "Rocky Mountain Power", program_name: "wattsmart Small Business Direct Install (2025)", program_type: "Prescriptive", program_category: "Lighting", delivery_mechanism: "SMBE", business_size: "Small", dlc_required: true, pre_approval_required: false, application_required: false, post_inspection_required: false, contractor_prequalification: true, program_url: "https://www.rockymountainpower.net/savings-energy-choices/business.html", max_cap_percent: 100, annual_cap_dollars: 50000, source_year: 2025, eligible_sectors: ["Commercial"], eligible_building_types: ["Office","Retail","Restaurant"], required_documents: ["Contractor completion form"], stacking_allowed: false, stacking_rules: "Cannot combine with standard prescriptive", funding_status: "Open", processing_time_days: 14, rebate_payment_method: "Direct to contractor", program_notes_ai: "Higher $/watt rates but must use prequalified SMBE contractor. No customer application needed — contractor handles paperwork." }
  ],
  incentives: [
    { provider_name: "Rocky Mountain Power", program_name: "wattsmart Business Incentives (2025)", measure_category: "Lighting", measure_subcategory: "Interior Calculated", fixture_category: "Linear", measure_type: "LED Retrofit", calc_method: "Per Watt Reduced", rate: 0.60, rate_value: 0.60, rate_unit: "/watt", tier: "No Controls", cap_amount: null, cap_percent: 70, per_unit_cap: null, equipment_requirements: "DLC 5.1+ listed, minimum 100 lm/W", installation_requirements: "Professional installation", baseline_description: "Existing fluorescent T8/T12/CFL", replacement_description: "DLC-listed LED without controls", requirements: "Calculated watt reduction method", effective_date: "2025-01-01", expiration_date: "2025-12-31", min_watts: null, max_watts: null, notes: "Base rate — no lighting controls" },
    { provider_name: "Rocky Mountain Power", program_name: "wattsmart Business Incentives (2025)", measure_category: "Lighting", measure_subcategory: "Interior Calculated", fixture_category: "Linear", measure_type: "LED Retrofit", calc_method: "Per Watt Reduced", rate: 1.00, rate_value: 1.00, rate_unit: "/watt", tier: "Networked Controls", cap_amount: null, cap_percent: 70, per_unit_cap: null, equipment_requirements: "DLC 5.1+ listed + networked lighting controls", installation_requirements: "Professional installation + controls commissioning", baseline_description: "Existing fluorescent with no controls", replacement_description: "DLC LED with networked occupancy/daylight controls", requirements: "Must include networked controls system", effective_date: "2025-01-01", expiration_date: "2025-12-31", min_watts: null, max_watts: null, notes: "67% premium over no-controls rate for adding networked controls" },
    { provider_name: "Rocky Mountain Power", program_name: "wattsmart Business Incentives (2025)", measure_category: "Lighting", measure_subcategory: "Interior Calculated", fixture_category: "Linear", measure_type: "LED Retrofit", calc_method: "Per Watt Reduced", rate: 1.20, rate_value: 1.20, rate_unit: "/watt", tier: "LLLC", cap_amount: null, cap_percent: 70, per_unit_cap: null, equipment_requirements: "DLC 5.1+ listed + Luminaire Level Lighting Controls", installation_requirements: "Professional installation + LLLC commissioning", baseline_description: "Existing fluorescent with no controls", replacement_description: "DLC LED with integrated LLLC (luminaire-level sensing)", requirements: "Each fixture must have integrated occupancy + daylight sensor", effective_date: "2025-01-01", expiration_date: "2025-12-31", min_watts: null, max_watts: null, notes: "Highest rate — LLLC provides fixture-level granular control" },
    { provider_name: "Rocky Mountain Power", program_name: "wattsmart Business Incentives (2025)", measure_category: "HVAC", measure_subcategory: "VFD", fixture_category: "Other", measure_type: "Other", calc_method: "Per Unit", rate: 200, rate_value: 200, rate_unit: "/hp", tier: null, cap_amount: null, cap_percent: 70, per_unit_cap: 5000, equipment_requirements: "VFD on HVAC fan or pump motor 5-200 HP", installation_requirements: "Licensed electrician", baseline_description: "Constant speed HVAC fan or pump motor", replacement_description: "Variable frequency drive on existing motor", requirements: "Must be HVAC application with variable load", effective_date: "2025-01-01", expiration_date: "2025-12-31", min_watts: null, max_watts: null, notes: "Fan and pump applications only, not process motors" }
  ],
  rate_schedules: [
    { provider_name: "Rocky Mountain Power", schedule_name: "Schedule 23 - Small General Service", customer_category: "Small Commercial", rate_type: "Tiered", rate_per_kwh: 0.1194, peak_rate_per_kwh: null, off_peak_rate_per_kwh: null, summer_rate_per_kwh: 0.1258, winter_rate_per_kwh: 0.1130, demand_charge: null, min_demand_charge: null, customer_charge: 20, time_of_use: false, effective_date: "2025-01-01", source_url: "https://www.rockymountainpower.net/about/rates-regulation/utah-rates-tariffs.html", description: "Small commercial <35 kW demand", notes: "No demand charge, energy-only billing" },
    { provider_name: "Rocky Mountain Power", schedule_name: "Schedule 6 - General Service", customer_category: "Medium Commercial", rate_type: "Demand", rate_per_kwh: 0.0845, peak_rate_per_kwh: null, off_peak_rate_per_kwh: null, summer_rate_per_kwh: 0.0891, winter_rate_per_kwh: 0.0799, demand_charge: 9.50, min_demand_charge: 25, customer_charge: 35, time_of_use: false, effective_date: "2025-01-01", source_url: "https://www.rockymountainpower.net/about/rates-regulation/utah-rates-tariffs.html", description: "Medium commercial 35-999 kW demand", notes: "Demand charge applies, seasonal energy differential" },
    { provider_name: "Rocky Mountain Power", schedule_name: "Schedule 8 - Large General Service TOU", customer_category: "Large Commercial", rate_type: "Time-of-Use", rate_per_kwh: 0.0654, peak_rate_per_kwh: 0.0891, off_peak_rate_per_kwh: 0.0478, summer_rate_per_kwh: 0.0712, winter_rate_per_kwh: 0.0596, demand_charge: 15.25, min_demand_charge: 50, customer_charge: 75, time_of_use: true, effective_date: "2025-01-01", source_url: "https://www.rockymountainpower.net/about/rates-regulation/utah-rates-tariffs.html", description: "Large commercial 1000+ kW demand, TOU billing", notes: "Peak: 1-9 PM weekdays Jun-Sep. Off-peak all other hours." }
  ],
  prescriptive_measures: [
    { provider_name: "Rocky Mountain Power", program_name: "wattsmart Business Incentives (2025)", measure_code: "LT-001", measure_name: "Interior Calculated No Controls", measure_category: "Lighting", measure_subcategory: "Linear", baseline_equipment: "Fluorescent T8/T12/CFL interior fixtures", baseline_wattage: null, replacement_equipment: "DLC-listed LED fixtures or retrofit kits, no controls", replacement_wattage: null, incentive_amount: 0.60, incentive_unit: "per_watt_reduced", incentive_formula: "(baseline watts - replacement watts) x $0.60", max_incentive: null, location_type: "interior", application_type: "retrofit", dlc_required: true, dlc_tier: "Standard", energy_star_required: false, hours_requirement: 2500, source_page: null, needs_pdf_upload: true, notes: "Base lighting rate — calculated method" },
    { provider_name: "Rocky Mountain Power", program_name: "wattsmart Business Incentives (2025)", measure_code: "LT-002", measure_name: "Interior Calculated Networked Controls", measure_category: "Lighting", measure_subcategory: "Linear", baseline_equipment: "Fluorescent T8/T12/CFL interior fixtures, no controls", baseline_wattage: null, replacement_equipment: "DLC LED + networked occupancy/daylight controls", replacement_wattage: null, incentive_amount: 1.00, incentive_unit: "per_watt_reduced", incentive_formula: "(baseline watts - replacement watts) x $1.00", max_incentive: null, location_type: "interior", application_type: "retrofit", dlc_required: true, dlc_tier: "Standard", energy_star_required: false, hours_requirement: 2500, source_page: null, needs_pdf_upload: true, notes: "67% premium for networked controls" },
    { provider_name: "Rocky Mountain Power", program_name: "wattsmart Business Incentives (2025)", measure_code: "LT-003", measure_name: "Interior Calculated LLLC", measure_category: "Lighting", measure_subcategory: "Linear", baseline_equipment: "Fluorescent T8/T12/CFL interior fixtures, no controls", baseline_wattage: null, replacement_equipment: "DLC LED with integrated Luminaire Level Lighting Controls", replacement_wattage: null, incentive_amount: 1.20, incentive_unit: "per_watt_reduced", incentive_formula: "(baseline watts - replacement watts) x $1.20", max_incentive: null, location_type: "interior", application_type: "retrofit", dlc_required: true, dlc_tier: "Standard", energy_star_required: false, hours_requirement: 2500, source_page: null, needs_pdf_upload: true, notes: "Highest rate — LLLC integrated into each luminaire" },
    { provider_name: "Rocky Mountain Power", program_name: "wattsmart Business Incentives (2025)", measure_code: "LT-004", measure_name: "Interior Express No Controls", measure_category: "Lighting", measure_subcategory: "Linear", baseline_equipment: "Fluorescent T8/T12/CFL interior fixtures", baseline_wattage: null, replacement_equipment: "DLC-listed LED — express/deemed savings path", replacement_wattage: null, incentive_amount: 0.75, incentive_unit: "per_watt_reduced", incentive_formula: "Deemed wattage table x $0.75/watt", max_incentive: null, location_type: "interior", application_type: "retrofit", dlc_required: true, dlc_tier: "Standard", energy_star_required: false, hours_requirement: null, source_page: null, needs_pdf_upload: true, notes: "Express/deemed path — simpler application, fixed watt assumptions" },
    { provider_name: "Rocky Mountain Power", program_name: "wattsmart Small Business Direct Install (2025)", measure_code: "LT-005", measure_name: "SMBE Interior LLLC", measure_category: "Lighting", measure_subcategory: "Linear", baseline_equipment: "Fluorescent T8/T12/CFL interior fixtures", baseline_wattage: null, replacement_equipment: "DLC LED + LLLC, installed by SMBE contractor", replacement_wattage: null, incentive_amount: 3.50, incentive_unit: "per_watt_reduced", incentive_formula: "(baseline watts - replacement watts) x $3.50", max_incentive: null, location_type: "interior", application_type: "retrofit", dlc_required: true, dlc_tier: "Standard", energy_star_required: false, hours_requirement: null, source_page: null, needs_pdf_upload: true, notes: "SMBE delivery — highest rate, contractor handles everything" },
    { provider_name: "Rocky Mountain Power", program_name: "wattsmart Business Incentives (2025)", measure_code: "LT-006", measure_name: "Exterior Calculated No Controls", measure_category: "Lighting", measure_subcategory: "Outdoor Area", baseline_equipment: "HPS/MH outdoor area, wall pack, or flood fixtures", baseline_wattage: null, replacement_equipment: "DLC-listed LED exterior fixtures", replacement_wattage: null, incentive_amount: 0.35, incentive_unit: "per_watt_reduced", incentive_formula: "(baseline watts - replacement watts) x $0.35", max_incentive: null, location_type: "exterior", application_type: "retrofit", dlc_required: true, dlc_tier: "Standard", energy_star_required: false, hours_requirement: 4000, source_page: null, needs_pdf_upload: true, notes: "Exterior rate lower than interior — fewer operating hours assumed" },
    { provider_name: "Rocky Mountain Power", program_name: "wattsmart Business Incentives (2025)", measure_code: "HV-001", measure_name: "VFD for HVAC Fan/Pump Motor", measure_category: "HVAC", measure_subcategory: "VFD", baseline_equipment: "Constant speed HVAC fan or pump motor 5-200 HP", baseline_wattage: null, replacement_equipment: "Variable frequency drive installation", replacement_wattage: null, incentive_amount: 200, incentive_unit: "per_kw", incentive_formula: "$200 per motor HP", max_incentive: 5000, location_type: null, application_type: "retrofit", dlc_required: false, dlc_tier: null, energy_star_required: false, hours_requirement: 4000, source_page: null, needs_pdf_upload: true, notes: "HVAC fans and pumps only — not process motors" },
    { provider_name: "Rocky Mountain Power", program_name: "wattsmart Business Incentives (2025)", measure_code: "HV-002", measure_name: "Heat Pump Conversion from Electric Resistance", measure_category: "HVAC", measure_subcategory: "Heat Pump", baseline_equipment: "Electric resistance heating system", baseline_wattage: null, replacement_equipment: "Air-source or ground-source heat pump, COP >= 3.0", replacement_wattage: null, incentive_amount: 300, incentive_unit: "per_ton", incentive_formula: "$300 per ton of cooling capacity", max_incentive: 15000, location_type: null, application_type: "both", dlc_required: false, dlc_tier: null, energy_star_required: true, hours_requirement: null, source_page: null, needs_pdf_upload: true, notes: "Must replace electric resistance — not gas" },
    { provider_name: "Rocky Mountain Power", program_name: "wattsmart Business Incentives (2025)", measure_code: "HV-003", measure_name: "Unitary AC CEE Tier 2", measure_category: "HVAC", measure_subcategory: "Unitary AC", baseline_equipment: "Standard efficiency unitary AC or split system", baseline_wattage: null, replacement_equipment: "CEE Tier 2 high-efficiency unitary AC >= 14.5 EER", replacement_wattage: null, incentive_amount: 75, incentive_unit: "per_ton", incentive_formula: "$75 per ton of cooling capacity", max_incentive: 3750, location_type: null, application_type: "both", dlc_required: false, dlc_tier: null, energy_star_required: false, hours_requirement: null, source_page: null, needs_pdf_upload: true, notes: "CEE Tier 2 minimum — higher than ENERGY STAR baseline" }
  ],
  forms: [
    { provider_name: "Rocky Mountain Power", program_name: "wattsmart Business Incentives (2025)", form_name: "Business Incentive Application", form_type: "Application", form_url: "https://www.rockymountainpower.net/content/dam/pcorp/documents/en/rockymountainpower/savings-energy-choices/UT_Business_Application.pdf", version_year: 2025, is_required: true, form_notes: "Submit within 90 days of purchase" },
    { provider_name: "Rocky Mountain Power", program_name: "wattsmart Business Incentives (2025)", form_name: "Lighting Worksheet", form_type: "Worksheet", form_url: "https://www.rockymountainpower.net/content/dam/pcorp/documents/en/rockymountainpower/savings-energy-choices/UT_Lighting_Worksheet.pdf", version_year: 2025, is_required: true, form_notes: "Required for all lighting projects — lists baseline/replacement wattages" }
  ]
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { state, fetch_pdfs } = await req.json();

    if (!state) {
      return new Response(JSON.stringify({ success: false, error: 'State is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ success: false, error: 'API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 64000,
        system: `You are a utility rebate and electric rate research assistant. Research electric utility providers in a given US state: their commercial energy efficiency incentive programs (lighting, HVAC, motors, refrigeration, building envelope), published electric rate schedules, and available forms/documents.

Here is an EXAMPLE of complete, accurate research data for Utah. Your output for any state must match this EXACT level of detail, structure, and field population:

${JSON.stringify(UTAH_BENCHMARK, null, 0)}

KEY PATTERNS FROM THE EXAMPLE ABOVE — your output MUST follow these:
- LIGHTING CONTROLS PROGRESSION: Show separate measures for No Controls, Networked Controls, and LLLC (Luminaire Level Lighting Controls) at different $/watt rates. Also show Express/deemed vs Calculated paths if the utility offers both.
- DELIVERY MECHANISMS: Show Prescriptive (standard) vs SMBE/Direct Install (higher $/watt, contractor-managed). These are separate programs with different rates.
- INCENTIVE UNITS: Use per_watt_reduced for lighting (not per_fixture) when the utility uses $/watt. Include incentive_formula showing the calculation.
- HVAC VARIETY: Show VFD ($/HP), Heat Pump ($/ton), and Unitary AC ($/ton with CEE Tier) as separate measures.
- RATE SCHEDULES: Show 3 tiers — small (energy-only, ~12¢), medium (with demand charge, ~9¢ energy), large (TOU with peak/off-peak, demand charge).
- Programs: year in name like "Program Name (2025)", all boolean flags, eligible_sectors arrays, stacking_rules text, program_notes_ai with tips
- Prescriptive Measures: measure_code with prefix (LT-, HV-, MT-), descriptive measure_name, incentive_formula field showing calculation
- Forms: form_name, form_type, form_url (direct PDF link), version_year, is_required flag

CRITICAL GUIDELINES:
- Research the ACTUAL utilities for the requested state — do NOT return Utah data
- Every prescriptive_measure MUST have needs_pdf_upload: true (these are from general knowledge, not verified PDFs)
- Use descriptive measure names (e.g. "T8 4ft Linear to LED Tube" not just "Linear")
- Include measure_code with category prefix (LT-, HV-, MT-, RF-, BE-)
- rate_unit: "/watt" for per-watt-reduced, "/fixture" for per-fixture, "/unit" for equipment
- fixture_category: Linear|High Bay|Low Bay|Outdoor Area|Outdoor Wall|Decorative|Refrigeration|Other
- program_type: Prescriptive|Custom|Midstream
- business_size: Small|Medium|Large|All
- rate_per_kwh in dollars (e.g. 0.0845 for 8.45 cents/kWh)
- For unknown fields, set to null — do not omit the field
- Include at least 5-10 prescriptive measures per major utility program

Return ONLY valid JSON with this exact structure, no other text:
{
  "providers": [
    {
      "provider_name": "string",
      "state": "XX",
      "service_territory": "string describing coverage area",
      "has_rebate_program": true/false,
      "rebate_program_url": "url or empty string",
      "contact_phone": "phone or empty string",
      "notes": "string"
    }
  ],
  "programs": [
    {
      "provider_name": "must match a provider_name above",
      "program_name": "string — include year like 'Program Name (2026)'",
      "program_type": "Prescriptive|Custom|Midstream",
      "program_category": "Lighting|HVAC|Motors|Refrigeration|Building Envelope|Comprehensive",
      "delivery_mechanism": "Prescriptive|Custom|Midstream|Direct Install|SMBE|SBDI or null",
      "business_size": "Small|Medium|Large|All",
      "dlc_required": true/false,
      "pre_approval_required": true/false,
      "application_required": true/false,
      "post_inspection_required": true/false,
      "contractor_prequalification": true/false,
      "program_url": "url or empty string",
      "max_cap_percent": number or null,
      "annual_cap_dollars": number or null,
      "source_year": number or null,
      "eligible_sectors": ["Commercial","Industrial","Agricultural","Institutional","Multifamily"] or null,
      "eligible_building_types": ["Office","Warehouse","Retail","Restaurant","School","Hospital","Manufacturing"] or null,
      "required_documents": ["W9","Invoice","Pre-photo","Post-photo","Spec sheets","DLC certificate"] or null,
      "stacking_allowed": true/false,
      "stacking_rules": "string describing what can/cannot combine, or empty string",
      "funding_status": "Open|Waitlisted|Exhausted|Paused",
      "processing_time_days": number or null,
      "rebate_payment_method": "Check|Bill Credit|Direct Deposit or null",
      "program_notes_ai": "string — tips, gotchas, common rejection reasons for AI agents"
    }
  ],
  "incentives": [
    {
      "provider_name": "must match a provider_name above",
      "program_name": "must match a program_name above",
      "measure_category": "Lighting|HVAC|Motors|Refrigeration|Building Envelope|Controls|Other",
      "measure_subcategory": "string — e.g. LED Tube, VFD, Rooftop Unit, Walk-in Cooler, Insulation",
      "fixture_category": "Linear|High Bay|Low Bay|Outdoor Area|Outdoor Wall|Decorative|Refrigeration|Other",
      "measure_type": "LED Retrofit|LED New Construction|LED Exterior|Controls|DLC Listed|Other",
      "calc_method": "Per Watt Reduced|Per Fixture|Custom",
      "rate": number,
      "rate_value": number,
      "rate_unit": "/watt or /fixture or /unit",
      "tier": "string — e.g. Tier 1, Tier 2, Premium, or null",
      "cap_amount": number or null,
      "cap_percent": number or null,
      "per_unit_cap": number or null,
      "equipment_requirements": "string — e.g. Must be DLC 5.1 Premium, ENERGY STAR certified",
      "installation_requirements": "string — e.g. Must be installed by certified contractor",
      "baseline_description": "string — what existing equipment must be, e.g. Existing T12 fluorescent",
      "replacement_description": "string — what replacement must be, e.g. DLC-listed LED tube or fixture",
      "requirements": "string describing general eligibility requirements or empty string",
      "effective_date": "YYYY-MM-DD or null",
      "expiration_date": "YYYY-MM-DD or null",
      "min_watts": number or null,
      "max_watts": number or null,
      "notes": "string"
    }
  ],
  "rate_schedules": [
    {
      "provider_name": "must match a provider_name above",
      "schedule_name": "string — e.g. 'Schedule 6 - General Service'",
      "customer_category": "Residential|Small Commercial|Large Commercial|Industrial|Agricultural",
      "rate_type": "Flat|Tiered|Time-of-Use|Seasonal|Demand",
      "rate_per_kwh": number (in dollars, e.g. 0.0845),
      "peak_rate_per_kwh": number or null (on-peak for TOU),
      "off_peak_rate_per_kwh": number or null (off-peak for TOU),
      "summer_rate_per_kwh": number or null,
      "winter_rate_per_kwh": number or null,
      "demand_charge": number or null ($/kW),
      "min_demand_charge": number or null (minimum monthly),
      "customer_charge": number or null (fixed monthly charge),
      "time_of_use": true/false,
      "effective_date": "YYYY-MM-DD or empty string",
      "source_url": "url to tariff document or empty string",
      "description": "string",
      "notes": "string"
    }
  ],
  "prescriptive_measures": [
    {
      "provider_name": "must match a provider_name above",
      "program_name": "must match a program_name above",
      "measure_code": "utility's internal code or null",
      "measure_name": "exact name from utility docs, e.g. T8 4ft Linear to LED Tube",
      "measure_category": "Lighting|HVAC|Motors|Refrigeration|Building Envelope",
      "measure_subcategory": "Linear|High Bay|Low Bay|Outdoor Area|Outdoor Wall|Decorative|Refrigeration|VFD|RTU|Other",
      "baseline_equipment": "what is being replaced, e.g. T8 4ft 32W 2-lamp fluorescent",
      "baseline_wattage": number or null,
      "replacement_equipment": "what it becomes, e.g. DLC-listed LED Tube Type A/B 18W",
      "replacement_wattage": number or null,
      "incentive_amount": number,
      "incentive_unit": "per_fixture|per_lamp|per_watt_reduced|per_kw|flat|per_ton",
      "incentive_formula": "formula if complex calc, or null",
      "max_incentive": number or null,
      "location_type": "interior|exterior|parking|refrigerated or null",
      "application_type": "retrofit|new_construction|both",
      "dlc_required": true/false,
      "dlc_tier": "Standard|Premium or null",
      "energy_star_required": true/false,
      "hours_requirement": number or null,
      "source_page": "page reference from PDF or null",
      "needs_pdf_upload": true,
      "notes": "special conditions"
    }
  ],
  "forms": [
    {
      "provider_name": "must match a provider_name above",
      "program_name": "must match a program_name above or null for provider-level forms",
      "form_name": "string — e.g. 'Prescriptive Rebate Application'",
      "form_type": "Application|Worksheet|Pre-approval|W9|Invoice|Checklist|Verification",
      "form_url": "url to download form or empty string",
      "version_year": number or null,
      "is_required": true/false,
      "form_notes": "string"
    }
  ]
}`,
        messages: [{
          role: 'user',
          content: `Research all major electric utility providers in ${state} following the benchmark hierarchy (Levels 1-7):

Level 1 — UTILITIES: Find all electric/gas utilities and co-ops serving ${state}
Level 2 — PROGRAMS: All incentive/rebate programs per utility, with URLs and year
Level 3 — DETAILS: Qualification rules, caps, required docs, stacking, funding status
Level 4 — CATEGORIES: Incentive rates per measure category (Lighting, HVAC, Motors, Refrigeration, Building Envelope, Controls)
Level 5 — PRESCRIPTIVE MEASURES: Extract EVERY line item from rebate tables — specific fixture types, baseline/replacement wattages, exact $/unit amounts, DLC/ENERGY STAR requirements. Utilities often have 20-100+ measures per program.
Level 6 — RATES: All published rate schedules, TOU rates, seasonal rates, demand charges
Level 7 — FORMS: Application forms, rebate worksheets, pre-approval forms, checklists — include download URLs

Return the structured JSON as specified. Maximize completeness at every level.`
        }]
      })
    });

    const data = await response.json();

    if (data.error) {
      return new Response(JSON.stringify({ success: false, error: data.error.message || 'Anthropic API error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const content = data.content?.[0]?.text || '';

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const results = JSON.parse(jsonMatch[0]);

      // Backward compat: normalize "rates" → "incentives" if AI returns old key
      if (results.rates && !results.incentives) {
        results.incentives = results.rates;
        delete results.rates;
      }

      // Default rate_schedules to empty array if missing
      if (!results.rate_schedules) {
        results.rate_schedules = [];
      }

      // Ensure rate_value is populated on each incentive
      if (results.incentives) {
        for (const inc of results.incentives) {
          if (inc.rate_value == null && inc.rate != null) {
            inc.rate_value = inc.rate;
          }
          if (inc.rate == null && inc.rate_value != null) {
            inc.rate = inc.rate_value;
          }
        }
      }

      // Default prescriptive_measures to empty array if missing
      if (!results.prescriptive_measures) {
        results.prescriptive_measures = [];
      }

      // Default forms to empty array if missing
      if (!results.forms) {
        results.forms = [];
      }

      // Validate structure
      if (!results.providers || !results.programs || !results.incentives) {
        return new Response(JSON.stringify({ success: false, error: 'Invalid response structure', raw: content }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      // Phase 2: Smart PDF discovery — fetch program HTML pages and scrape PDF links
      if (fetch_pdfs && results.programs?.length > 0) {
        const programsWithUrls = results.programs.filter(
          (p: { program_url?: string }) => p.program_url && p.program_url.startsWith('http')
        ).slice(0, 5); // Check up to 5 program pages

        const pdfStartTime = Date.now();
        const PDF_TIME_LIMIT = 90000; // 90 seconds total
        const discoveredPdfs: { url: string; program_name: string; provider_name: string }[] = [];

        // Step 1: Fetch HTML pages and extract PDF links
        for (const prog of programsWithUrls) {
          if (Date.now() - pdfStartTime > PDF_TIME_LIMIT) break;

          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000);
            const htmlResponse = await fetch(prog.program_url, {
              signal: controller.signal,
              headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobScout/1.0)' }
            });
            clearTimeout(timeout);

            if (!htmlResponse.ok) {
              console.log(`HTML fetch failed for ${prog.program_url}: ${htmlResponse.status}`);
              continue;
            }

            const contentType = htmlResponse.headers.get('content-type') || '';

            // If the URL itself is a PDF (content-type check)
            if (contentType.includes('application/pdf')) {
              discoveredPdfs.push({
                url: prog.program_url,
                program_name: prog.program_name,
                provider_name: prog.provider_name
              });
              continue;
            }

            // Parse HTML to find PDF links
            const html = await htmlResponse.text();
            const pdfLinkRegex = /href=["']([^"']*\.pdf(?:\?[^"']*)?)['"]/gi;
            let match;
            const baseUrl = new URL(prog.program_url);
            const seenUrls = new Set<string>();

            while ((match = pdfLinkRegex.exec(html)) !== null) {
              let pdfUrl = match[1];

              // Resolve relative URLs
              if (pdfUrl.startsWith('/')) {
                pdfUrl = `${baseUrl.protocol}//${baseUrl.host}${pdfUrl}`;
              } else if (!pdfUrl.startsWith('http')) {
                const pathParts = baseUrl.pathname.split('/');
                pathParts.pop();
                pdfUrl = `${baseUrl.protocol}//${baseUrl.host}${pathParts.join('/')}/${pdfUrl}`;
              }

              // Filter: only keep PDFs that look like rebate/incentive documents
              const lowerUrl = pdfUrl.toLowerCase();
              const relevantTerms = [
                'rebate', 'incentive', 'prescriptive', 'measure', 'worksheet',
                'lighting', 'hvac', 'motor', 'commercial', 'business', 'energy',
                'efficiency', 'program', 'application', 'schedule', 'tariff', 'rate'
              ];
              const isRelevant = relevantTerms.some(term => lowerUrl.includes(term));

              if (isRelevant && !seenUrls.has(pdfUrl)) {
                seenUrls.add(pdfUrl);
                discoveredPdfs.push({
                  url: pdfUrl,
                  program_name: prog.program_name,
                  provider_name: prog.provider_name
                });
              }
            }
          } catch (htmlErr) {
            console.log(`HTML fetch error for ${prog.program_url}: ${(htmlErr as Error).message}`);
            continue;
          }
        }

        // Step 2: Fetch and parse discovered PDFs (max 3)
        const pdfsToProcess = discoveredPdfs.slice(0, 3);
        console.log(`Discovered ${discoveredPdfs.length} PDF links, processing ${pdfsToProcess.length}`);

        for (const pdfInfo of pdfsToProcess) {
          if (Date.now() - pdfStartTime > PDF_TIME_LIMIT) {
            console.log('PDF processing time limit reached');
            break;
          }

          try {
            const pdfController = new AbortController();
            const pdfTimeout = setTimeout(() => pdfController.abort(), 15000);
            const pdfResponse = await fetch(pdfInfo.url, {
              signal: pdfController.signal,
              headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobScout/1.0)' }
            });
            clearTimeout(pdfTimeout);

            if (!pdfResponse.ok) {
              console.log(`PDF fetch failed for ${pdfInfo.url}: ${pdfResponse.status}`);
              continue;
            }

            const pdfBuffer = await pdfResponse.arrayBuffer();
            const pdfBase64 = base64Encode(new Uint8Array(pdfBuffer));

            // Skip if too large (>20MB base64)
            if (pdfBase64.length > 20 * 1024 * 1024) {
              console.log(`PDF too large: ${pdfInfo.url}`);
              continue;
            }

            // Call Claude to extract measures from the PDF
            const pdfExtractResponse = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': ANTHROPIC_API_KEY,
                'anthropic-version': '2023-06-01',
                'anthropic-beta': 'pdfs-2024-09-25'
              },
              body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 64000,
                system: `Extract every prescriptive measure line item from this utility rebate/incentive PDF. Return JSON:
{
  "prescriptive_measures": [
    {
      "measure_code": "string or null",
      "measure_name": "exact name from document",
      "measure_category": "Lighting|HVAC|Motors|Refrigeration|Building Envelope",
      "measure_subcategory": "string",
      "baseline_equipment": "what is being replaced",
      "baseline_wattage": number or null,
      "replacement_equipment": "what replaces it",
      "replacement_wattage": number or null,
      "incentive_amount": number,
      "incentive_unit": "per_fixture|per_lamp|per_watt_reduced|per_kw|flat|per_ton",
      "application_type": "retrofit|new_construction|both",
      "dlc_required": true/false,
      "dlc_tier": "Standard|Premium or null",
      "energy_star_required": true/false,
      "location_type": "interior|exterior|parking|refrigerated or null",
      "source_page": "string or null",
      "notes": "string"
    }
  ]
}
Extract EVERY line item. Do not summarize or skip rows.`,
                messages: [{
                  role: 'user',
                  content: [
                    {
                      type: 'document',
                      source: {
                        type: 'base64',
                        media_type: 'application/pdf',
                        data: pdfBase64
                      }
                    },
                    {
                      type: 'text',
                      text: `Extract all prescriptive measure line items from this PDF for program "${pdfInfo.program_name}" by "${pdfInfo.provider_name}". Return structured JSON.`
                    }
                  ]
                }]
              })
            });

            const pdfData = await pdfExtractResponse.json();
            const pdfContent = pdfData.content?.[0]?.text || '';
            const pdfJsonMatch = pdfContent.match(/\{[\s\S]*\}/);

            if (pdfJsonMatch) {
              const pdfResults = JSON.parse(pdfJsonMatch[0]);
              if (pdfResults.prescriptive_measures?.length > 0) {
                for (const pm of pdfResults.prescriptive_measures) {
                  pm.provider_name = pdfInfo.provider_name;
                  pm.program_name = pdfInfo.program_name;
                  pm.needs_pdf_upload = false; // Verified from actual PDF
                  pm.source_pdf_url = pdfInfo.url;
                }
                results.prescriptive_measures = [
                  ...results.prescriptive_measures,
                  ...pdfResults.prescriptive_measures
                ];
                console.log(`Extracted ${pdfResults.prescriptive_measures.length} measures from PDF: ${pdfInfo.url}`);
              }
            }
          } catch (pdfErr) {
            console.log(`PDF extraction error for ${pdfInfo.url}: ${(pdfErr as Error).message}`);
            continue;
          }
        }
      }

      // Flag AI-only prescriptive measures that need PDF upload
      for (const pm of (results.prescriptive_measures as Record<string, unknown>[])) {
        if (pm.needs_pdf_upload === undefined || pm.needs_pdf_upload === null) {
          pm.needs_pdf_upload = true;
        }
      }

      // Calculate completeness score across benchmark levels
      const levelScores: Record<string, { name: string; score: number; count: number }> = {};
      const scoreLevels = [
        { level: 1, name: 'Utility Discovery', key: 'providers', required: ['provider_name', 'state', 'has_rebate_program'], optional: ['service_territory', 'rebate_program_url', 'contact_phone'] },
        { level: 2, name: 'Program Discovery', key: 'programs', required: ['provider_name', 'program_name', 'program_type'], optional: ['program_category', 'delivery_mechanism', 'program_url', 'source_year'] },
        { level: 3, name: 'Program Details', key: 'programs', required: ['program_name'], optional: ['max_cap_percent', 'annual_cap_dollars', 'required_documents', 'pre_approval_required', 'stacking_allowed', 'funding_status', 'processing_time_days'] },
        { level: 4, name: 'Measure Categories', key: 'incentives', required: ['provider_name', 'program_name', 'fixture_category', 'rate_value'], optional: ['measure_category', 'calc_method', 'rate_unit', 'tier', 'cap_amount'] },
        { level: 5, name: 'Prescriptive Measures', key: 'prescriptive_measures', required: ['provider_name', 'program_name', 'measure_name', 'incentive_amount'], optional: ['measure_code', 'baseline_equipment', 'baseline_wattage', 'replacement_equipment', 'incentive_unit', 'dlc_required', 'source_page'] },
        { level: 6, name: 'Rate Schedules', key: 'rate_schedules', required: ['provider_name', 'schedule_name', 'rate_per_kwh'], optional: ['customer_category', 'rate_type', 'peak_rate_per_kwh', 'demand_charge', 'source_url'] },
        { level: 7, name: 'Forms & Documents', key: 'forms', required: ['form_name', 'form_type'], optional: ['form_url', 'version_year', 'is_required'] }
      ];

      let totalWeighted = 0;
      let weightedFilled = 0;
      const weights: Record<number, number> = { 1: 10, 2: 15, 3: 15, 4: 15, 5: 25, 6: 10, 7: 10 };
      const missing_data: string[] = [];

      for (const sl of scoreLevels) {
        const items = (results as Record<string, unknown[]>)[sl.key] || [];
        let filled = 0;
        let total = 0;
        for (const item of items) {
          const rec = item as Record<string, unknown>;
          for (const f of [...sl.required, ...sl.optional]) {
            total++;
            if (rec[f] != null && rec[f] !== '' && rec[f] !== false) filled++;
          }
        }
        const score = total > 0 ? Math.round((filled / total) * 100) : 0;
        levelScores[sl.level] = { name: sl.name, score, count: items.length };
        const w = weights[sl.level] || 10;
        totalWeighted += w;
        weightedFilled += (score / 100) * w;
        if (items.length === 0) {
          missing_data.push(`Level ${sl.level} (${sl.name}): No data found`);
        } else if (score < 50) {
          missing_data.push(`Level ${sl.level} (${sl.name}): Only ${score}% complete — needs PDF upload`);
        }
      }

      const completeness_score = totalWeighted > 0 ? Math.round((weightedFilled / totalWeighted) * 100) : 0;

      return new Response(JSON.stringify({ success: true, results, completeness_score, level_scores: levelScores, missing_data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: false, error: 'Could not parse research results', raw: content }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
