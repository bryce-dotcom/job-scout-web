/**
 * Utility Research Benchmark Framework
 *
 * Defines the research hierarchy that AI must satisfy when researching
 * utility programs. Each level builds on the previous — utilities first,
 * then programs, then details, measures, rates, and forms.
 *
 * No utility names are hardcoded. This framework works generically
 * for any utility in any US state.
 */

// ─── Constants ──────────────────────────────────────────────────────

export const MEASURE_CATEGORIES = [
  'Lighting',
  'HVAC',
  'Motors',
  'VFDs',
  'Refrigeration',
  'Building Envelope',
  'Controls',
  'Solar',
  'Batteries',
  'Custom',
  'Other'
]

export const FORM_TYPES = [
  'Application',
  'Worksheet',
  'Pre-approval',
  'W9',
  'Invoice',
  'Checklist',
  'Verification'
]

export const INCENTIVE_UNITS = [
  'per_fixture',
  'per_lamp',
  'per_watt_reduced',
  'per_kw',
  'flat',
  'per_ton',
  'per_unit'
]

export const PROGRAM_TYPES = [
  'Prescriptive',
  'Custom',
  'Midstream'
]

export const DELIVERY_MECHANISMS = [
  'Prescriptive',
  'Custom',
  'Midstream',
  'Direct Install',
  'SMBE',
  'SBDI'
]

export const FUNDING_STATUSES = [
  'Open',
  'Waitlisted',
  'Exhausted',
  'Paused'
]

// ─── Research Levels ────────────────────────────────────────────────

export const RESEARCH_LEVELS = [
  {
    level: 1,
    name: 'Utility Discovery',
    description: 'Find all utilities in the state (electric, gas, co-ops)',
    dataKey: 'providers',
    questions: [
      'What electric utilities serve this state?',
      'What gas utilities serve this state?',
      'What electric cooperatives serve this state?',
      'What is each utility\'s service territory?',
      'Does each utility have a rebate/incentive program?',
      'What is the main program website URL?',
      'What is the utility contact phone number?'
    ],
    requiredFields: ['provider_name', 'state', 'has_rebate_program'],
    optionalFields: ['service_territory', 'rebate_program_url', 'contact_phone', 'notes']
  },
  {
    level: 2,
    name: 'Program Discovery',
    description: 'All incentive/rebate programs for each utility',
    dataKey: 'programs',
    questions: [
      'What incentive/rebate programs does this utility offer?',
      'What is the latest program year/version?',
      'What program types are available (Prescriptive, Custom, Midstream)?',
      'What delivery mechanisms exist (Direct Install, SMBE, SBDI)?',
      'What is the program URL?',
      'Is there a downloadable PDF with program details?',
      'What business sizes does the program serve?',
      'What categories does the program cover (Lighting, HVAC, etc.)?'
    ],
    requiredFields: ['provider_name', 'program_name', 'program_type'],
    optionalFields: [
      'program_category', 'delivery_mechanism', 'business_size',
      'program_url', 'source_year', 'funding_status'
    ]
  },
  {
    level: 3,
    name: 'Program Details',
    description: 'Qualification rules, caps, documentation, stacking',
    dataKey: 'programs',
    questions: [
      'What are the business size / demand kW / annual kWh eligibility requirements?',
      'What is the maximum incentive cap (% of project cost)?',
      'What is the annual dollar cap per customer?',
      'What per-measure caps exist?',
      'What documents are required (W-9, invoices, photos, spec sheets, DLC certs)?',
      'Is pre-approval required before starting work?',
      'Is post-installation inspection required?',
      'Must the contractor be prequalified?',
      'Can incentives from different programs be stacked/combined?',
      'What are the specific stacking rules and exclusions?',
      'What is the current funding status (Open, Waitlisted, Exhausted)?',
      'What is the typical processing time in days?',
      'How are rebates paid (check, bill credit, direct deposit)?'
    ],
    requiredFields: ['program_name'],
    detailFields: [
      'max_cap_percent', 'annual_cap_dollars', 'required_documents',
      'pre_approval_required', 'post_inspection_required',
      'contractor_prequalification', 'stacking_allowed', 'stacking_rules',
      'funding_status', 'processing_time_days', 'rebate_payment_method',
      'eligible_sectors', 'eligible_building_types'
    ]
  },
  {
    level: 4,
    name: 'Measure Categories',
    description: 'Incentive rates per category within each program',
    dataKey: 'incentives',
    questions: [
      'What Lighting incentive rates are available?',
      'What HVAC incentive rates are available?',
      'What Motors/VFD incentive rates are available?',
      'What Refrigeration incentive rates are available?',
      'What Building Envelope incentive rates are available?',
      'What Controls/EMS incentive rates are available?',
      'What Solar/Battery incentive rates are available?',
      'What Custom/Calculated incentive paths are available?',
      'What is the calculation method (per watt reduced, per fixture, custom)?',
      'Are there tiered rates (Tier 1, Tier 2, Premium)?',
      'What are the cap amounts per measure?'
    ],
    requiredFields: ['provider_name', 'program_name', 'fixture_category', 'rate_value'],
    optionalFields: [
      'measure_category', 'measure_type', 'calc_method', 'rate_unit',
      'tier', 'cap_amount', 'cap_percent', 'equipment_requirements',
      'baseline_description', 'replacement_description'
    ]
  },
  {
    level: 5,
    name: 'Prescriptive Measures',
    description: 'Every specific line item from rebate tables',
    dataKey: 'prescriptive_measures',
    questions: [
      'What is the exact measure name from the utility docs?',
      'What is the utility\'s internal measure code?',
      'What baseline equipment is being replaced (type, wattage)?',
      'What replacement equipment is required (type, wattage)?',
      'What is the exact incentive dollar amount per unit?',
      'What is the incentive unit ($/watt, $/fixture, $/kW, flat)?',
      'Is DLC listing required? Which tier (Standard, Premium)?',
      'Is ENERGY STAR certification required?',
      'Are there minimum/maximum quantity limits?',
      'What location type applies (interior, exterior, refrigerated)?',
      'What application type (retrofit, new construction, both)?',
      'What page of the PDF is this measure documented on?'
    ],
    requiredFields: ['provider_name', 'program_name', 'measure_name', 'incentive_amount'],
    optionalFields: [
      'measure_code', 'measure_category', 'measure_subcategory',
      'baseline_equipment', 'baseline_wattage',
      'replacement_equipment', 'replacement_wattage',
      'incentive_unit', 'dlc_required', 'dlc_tier',
      'energy_star_required', 'application_type', 'location_type',
      'source_page'
    ],
    needsPdf: true
  },
  {
    level: 6,
    name: 'Rate Schedules',
    description: 'Published electric rate schedules and tariffs',
    dataKey: 'rate_schedules',
    questions: [
      'What is the schedule name and number (e.g. Schedule 6, GS-1)?',
      'What customer category (Residential, Small Commercial <50kW, Medium 50-200kW, Large >200kW, Industrial)?',
      'What rate type (Flat, Tiered, TOU, Seasonal)?',
      'What is the base $/kWh rate?',
      'What are peak and off-peak rates (for TOU schedules)?',
      'What are summer and winter rates (for seasonal schedules)?',
      'What is the demand charge in $/kW?',
      'What is the monthly customer/fixed charge?',
      'What is the tariff PDF URL?',
      'What is the effective date?'
    ],
    requiredFields: ['provider_name', 'schedule_name', 'rate_per_kwh'],
    optionalFields: [
      'customer_category', 'rate_type', 'peak_rate_per_kwh',
      'off_peak_rate_per_kwh', 'summer_rate_per_kwh', 'winter_rate_per_kwh',
      'demand_charge', 'customer_charge', 'time_of_use',
      'effective_date', 'source_url'
    ]
  },
  {
    level: 7,
    name: 'Forms & Documents',
    description: 'Application forms, worksheets, checklists',
    dataKey: 'forms',
    questions: [
      'Where is the rebate application form?',
      'Where is the prescriptive rebate worksheet/calculator?',
      'Is a pre-approval form required? Where is it?',
      'Is there a post-inspection checklist?',
      'Is there a measure verification form?',
      'Is a W-9 required? Where can it be downloaded?',
      'Is there an invoice template or requirements doc?'
    ],
    requiredFields: ['form_name', 'form_type'],
    optionalFields: ['form_url', 'version_year', 'is_required', 'form_notes'],
    needsPdf: true
  }
]

// ─── Validation Functions ───────────────────────────────────────────

/**
 * Check if a research level is complete for the given data.
 * Returns { complete: boolean, missing: string[], count: number, total: number }
 */
export function validateLevelComplete(level, data) {
  const levelDef = RESEARCH_LEVELS.find(l => l.level === level)
  if (!levelDef) return { complete: false, missing: ['Unknown level'], count: 0, total: 0 }

  const items = data[levelDef.dataKey] || []

  if (items.length === 0) {
    return {
      complete: false,
      missing: [`No ${levelDef.name} data found`],
      count: 0,
      total: 1
    }
  }

  const missing = []
  let filledFields = 0
  let totalFields = 0

  for (const item of items) {
    for (const field of levelDef.requiredFields) {
      totalFields++
      if (item[field] != null && item[field] !== '') {
        filledFields++
      } else {
        const label = `${field} missing on "${item[levelDef.requiredFields[0]] || 'unnamed item'}"`
        if (!missing.includes(label)) missing.push(label)
      }
    }

    // Check optional/detail fields for completeness scoring
    const optFields = levelDef.optionalFields || levelDef.detailFields || []
    for (const field of optFields) {
      totalFields++
      if (item[field] != null && item[field] !== '' && item[field] !== false) {
        filledFields++
      }
    }
  }

  return {
    complete: missing.length === 0,
    missing,
    count: filledFields,
    total: totalFields
  }
}

/**
 * Calculate overall completeness score across all levels.
 * Returns { score: number (0-100), levels: { [level]: { score, complete, missing } }, needsPdfUpload: string[] }
 */
export function calculateCompletenessScore(data) {
  const levels = {}
  let totalWeight = 0
  let weightedScore = 0
  const needsPdfUpload = []

  // Weight each level by importance
  const weights = { 1: 10, 2: 15, 3: 15, 4: 15, 5: 25, 6: 10, 7: 10 }

  for (const levelDef of RESEARCH_LEVELS) {
    const validation = validateLevelComplete(levelDef.level, data)
    const levelScore = validation.total > 0
      ? Math.round((validation.count / validation.total) * 100)
      : 0

    const weight = weights[levelDef.level] || 10
    totalWeight += weight
    weightedScore += (levelScore / 100) * weight

    levels[levelDef.level] = {
      name: levelDef.name,
      score: levelScore,
      complete: validation.complete,
      missing: validation.missing,
      itemCount: (data[levelDef.dataKey] || []).length
    }

    // Flag levels that need PDF upload for better data
    if (levelDef.needsPdf && levelScore < 50) {
      needsPdfUpload.push(levelDef.name)
    }
  }

  const overallScore = totalWeight > 0 ? Math.round((weightedScore / totalWeight) * 100) : 0

  return {
    score: overallScore,
    levels,
    needsPdfUpload
  }
}

/**
 * Build the system prompt section that references the benchmark hierarchy.
 * Used by the ai-utility-research edge function to guide Claude's research.
 */
export function buildBenchmarkPromptSection() {
  let prompt = `\n\nRESEARCH BENCHMARK HIERARCHY — You must attempt to fill every level:\n`

  for (const level of RESEARCH_LEVELS) {
    prompt += `\nLevel ${level.level}: ${level.name.toUpperCase()}\n`
    prompt += `${level.description}\n`
    prompt += `Questions to answer:\n`
    for (const q of level.questions) {
      prompt += `  - ${q}\n`
    }
    prompt += `Required fields: ${level.requiredFields.join(', ')}\n`
    if (level.needsPdf) {
      prompt += `NOTE: This level often requires actual PDF documents for complete data.\n`
    }
  }

  prompt += `\nFor each level, try to answer every question. If you cannot find data for a field, set it to null and note what's missing. The goal is maximum completeness.\n`

  return prompt
}
