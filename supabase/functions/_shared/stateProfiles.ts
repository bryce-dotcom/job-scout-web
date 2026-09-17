// What an address tells us about a company, by state.
//
// The point of this file is that a new owner should type their address
// once and have the payroll, sales-tax and time-zone defaults land
// without a form. Every number here is a DEFAULT to be shown on a card
// and confirmed, never a silent write — and every number carries the
// year it was true. A table of tax rates that nobody re-checks is a
// liability; the `asOf` on each block is the reminder.
//
// Three confidence levels, and the card says which:
//   known     — statutory, stable, safe to prefill (state sales-tax rate,
//               whether the state has an income tax, the time zone)
//   estimate  — a published new-employer figure that the state will
//               replace with the company's own (SUI new-employer rate)
//   needs_you — cannot be derived (a local sales-tax add-on, an SUI rate
//               from a notice, an EIN). Named so the owner knows what is
//               still theirs to bring.

export interface StateProfile {
  code: string
  name: string
  tz: string
  /** Every state is one zone for our purposes; these have a sliver in another. */
  tzNote?: string
  /** Arizona keeps standard time all year. */
  noDst?: boolean
  incomeTax: { kind: 'none' } | { kind: 'flat'; ratePct: number; asOf: number } | { kind: 'graduated'; asOf: number }
  salesTax: { stateRatePct: number; asOf: number; localAddOn: boolean; note?: string; servicesTaxable: boolean }
  sui?: { wageBase: number; newEmployerRatePct: number; asOf: number; agency: string }
  /** Monopolistic workers' comp — the state fund is the only seller. */
  workersCompStateFund?: boolean
}

const central = 'America/Chicago', eastern = 'America/New_York', mountain = 'America/Denver', pacific = 'America/Los_Angeles'

// Income tax: the nine with none; flat-rate states with the rate in force;
// the rest graduated (the payroll tables carry those, not this file).
// Sales tax: the STATE rate. Nearly every state lets counties and cities
// add to it, so the card shows the state rate as a floor and asks for the
// local figure — it is on the last invoice from any supplier in town.
export const STATE_PROFILES: Record<string, StateProfile> = {
  AL: { code: 'AL', name: 'Alabama', tz: central, incomeTax: { kind: 'graduated', asOf: 2025 }, salesTax: { stateRatePct: 4, asOf: 2025, localAddOn: true, servicesTaxable: false } },
  AK: { code: 'AK', name: 'Alaska', tz: 'America/Anchorage', incomeTax: { kind: 'none' }, salesTax: { stateRatePct: 0, asOf: 2025, localAddOn: true, note: 'No state sales tax; some boroughs and cities levy their own.', servicesTaxable: false } },
  AZ: { code: 'AZ', name: 'Arizona', tz: 'America/Phoenix', noDst: true, incomeTax: { kind: 'flat', ratePct: 2.5, asOf: 2025 }, salesTax: { stateRatePct: 5.6, asOf: 2025, localAddOn: true, note: 'Arizona calls it Transaction Privilege Tax (TPT); contracting has its own rules.', servicesTaxable: false }, sui: { wageBase: 8000, newEmployerRatePct: 2.0, asOf: 2025, agency: 'Arizona DES' } },
  AR: { code: 'AR', name: 'Arkansas', tz: central, incomeTax: { kind: 'graduated', asOf: 2025 }, salesTax: { stateRatePct: 6.5, asOf: 2025, localAddOn: true, servicesTaxable: false } },
  CA: { code: 'CA', name: 'California', tz: pacific, incomeTax: { kind: 'graduated', asOf: 2025 }, salesTax: { stateRatePct: 7.25, asOf: 2025, localAddOn: true, servicesTaxable: false }, sui: { wageBase: 7000, newEmployerRatePct: 3.4, asOf: 2025, agency: 'California EDD' } },
  CO: { code: 'CO', name: 'Colorado', tz: mountain, incomeTax: { kind: 'flat', ratePct: 4.4, asOf: 2025 }, salesTax: { stateRatePct: 2.9, asOf: 2025, localAddOn: true, note: 'Home-rule cities collect their own; the combined rate in Denver is well above the state 2.9%.', servicesTaxable: false } },
  CT: { code: 'CT', name: 'Connecticut', tz: eastern, incomeTax: { kind: 'graduated', asOf: 2025 }, salesTax: { stateRatePct: 6.35, asOf: 2025, localAddOn: false, servicesTaxable: false } },
  DE: { code: 'DE', name: 'Delaware', tz: eastern, incomeTax: { kind: 'graduated', asOf: 2025 }, salesTax: { stateRatePct: 0, asOf: 2025, localAddOn: false, note: 'No sales tax.', servicesTaxable: false } },
  DC: { code: 'DC', name: 'District of Columbia', tz: eastern, incomeTax: { kind: 'graduated', asOf: 2025 }, salesTax: { stateRatePct: 6, asOf: 2025, localAddOn: false, servicesTaxable: false } },
  FL: { code: 'FL', name: 'Florida', tz: eastern, tzNote: 'The western panhandle is Central.', incomeTax: { kind: 'none' }, salesTax: { stateRatePct: 6, asOf: 2025, localAddOn: true, servicesTaxable: false }, sui: { wageBase: 7000, newEmployerRatePct: 2.7, asOf: 2025, agency: 'Florida DOR (reemployment tax)' } },
  GA: { code: 'GA', name: 'Georgia', tz: eastern, incomeTax: { kind: 'flat', ratePct: 5.19, asOf: 2025 }, salesTax: { stateRatePct: 4, asOf: 2025, localAddOn: true, servicesTaxable: false } },
  HI: { code: 'HI', name: 'Hawaii', tz: 'Pacific/Honolulu', noDst: true, incomeTax: { kind: 'graduated', asOf: 2025 }, salesTax: { stateRatePct: 4, asOf: 2025, localAddOn: true, note: 'Hawaii’s General Excise Tax applies to services too.', servicesTaxable: true } },
  ID: { code: 'ID', name: 'Idaho', tz: mountain, tzNote: 'The northern panhandle is Pacific.', incomeTax: { kind: 'flat', ratePct: 5.695, asOf: 2025 }, salesTax: { stateRatePct: 6, asOf: 2025, localAddOn: true, servicesTaxable: false } },
  IL: { code: 'IL', name: 'Illinois', tz: central, incomeTax: { kind: 'flat', ratePct: 4.95, asOf: 2025 }, salesTax: { stateRatePct: 6.25, asOf: 2025, localAddOn: true, servicesTaxable: false } },
  IN: { code: 'IN', name: 'Indiana', tz: eastern, tzNote: 'The northwest and southwest corners are Central.', incomeTax: { kind: 'flat', ratePct: 3.0, asOf: 2025 }, salesTax: { stateRatePct: 7, asOf: 2025, localAddOn: false, servicesTaxable: false } },
  IA: { code: 'IA', name: 'Iowa', tz: central, incomeTax: { kind: 'flat', ratePct: 3.8, asOf: 2025 }, salesTax: { stateRatePct: 6, asOf: 2025, localAddOn: true, servicesTaxable: false } },
  KS: { code: 'KS', name: 'Kansas', tz: central, tzNote: 'Four western counties are Mountain.', incomeTax: { kind: 'graduated', asOf: 2025 }, salesTax: { stateRatePct: 6.5, asOf: 2025, localAddOn: true, servicesTaxable: false } },
  KY: { code: 'KY', name: 'Kentucky', tz: eastern, tzNote: 'The western half is Central.', incomeTax: { kind: 'flat', ratePct: 4.0, asOf: 2025 }, salesTax: { stateRatePct: 6, asOf: 2025, localAddOn: false, servicesTaxable: false } },
  LA: { code: 'LA', name: 'Louisiana', tz: central, incomeTax: { kind: 'flat', ratePct: 3.0, asOf: 2025 }, salesTax: { stateRatePct: 5, asOf: 2025, localAddOn: true, servicesTaxable: false } },
  ME: { code: 'ME', name: 'Maine', tz: eastern, incomeTax: { kind: 'graduated', asOf: 2025 }, salesTax: { stateRatePct: 5.5, asOf: 2025, localAddOn: false, servicesTaxable: false } },
  MD: { code: 'MD', name: 'Maryland', tz: eastern, incomeTax: { kind: 'graduated', asOf: 2025 }, salesTax: { stateRatePct: 6, asOf: 2025, localAddOn: false, servicesTaxable: false } },
  MA: { code: 'MA', name: 'Massachusetts', tz: eastern, incomeTax: { kind: 'flat', ratePct: 5.0, asOf: 2025 }, salesTax: { stateRatePct: 6.25, asOf: 2025, localAddOn: false, servicesTaxable: false } },
  MI: { code: 'MI', name: 'Michigan', tz: eastern, tzNote: 'Four Upper Peninsula counties are Central.', incomeTax: { kind: 'flat', ratePct: 4.25, asOf: 2025 }, salesTax: { stateRatePct: 6, asOf: 2025, localAddOn: false, servicesTaxable: false } },
  MN: { code: 'MN', name: 'Minnesota', tz: central, incomeTax: { kind: 'graduated', asOf: 2025 }, salesTax: { stateRatePct: 6.875, asOf: 2025, localAddOn: true, servicesTaxable: false } },
  MS: { code: 'MS', name: 'Mississippi', tz: central, incomeTax: { kind: 'flat', ratePct: 4.4, asOf: 2025 }, salesTax: { stateRatePct: 7, asOf: 2025, localAddOn: true, servicesTaxable: false } },
  MO: { code: 'MO', name: 'Missouri', tz: central, incomeTax: { kind: 'graduated', asOf: 2025 }, salesTax: { stateRatePct: 4.225, asOf: 2025, localAddOn: true, servicesTaxable: false } },
  MT: { code: 'MT', name: 'Montana', tz: mountain, incomeTax: { kind: 'graduated', asOf: 2025 }, salesTax: { stateRatePct: 0, asOf: 2025, localAddOn: false, note: 'No sales tax.', servicesTaxable: false } },
  NE: { code: 'NE', name: 'Nebraska', tz: central, tzNote: 'The western panhandle is Mountain.', incomeTax: { kind: 'graduated', asOf: 2025 }, salesTax: { stateRatePct: 5.5, asOf: 2025, localAddOn: true, servicesTaxable: false } },
  NV: { code: 'NV', name: 'Nevada', tz: pacific, incomeTax: { kind: 'none' }, salesTax: { stateRatePct: 6.85, asOf: 2025, localAddOn: true, servicesTaxable: false }, sui: { wageBase: 41800, newEmployerRatePct: 2.95, asOf: 2025, agency: 'Nevada DETR' } },
  NH: { code: 'NH', name: 'New Hampshire', tz: eastern, incomeTax: { kind: 'none' }, salesTax: { stateRatePct: 0, asOf: 2025, localAddOn: false, note: 'No sales tax.', servicesTaxable: false } },
  NJ: { code: 'NJ', name: 'New Jersey', tz: eastern, incomeTax: { kind: 'graduated', asOf: 2025 }, salesTax: { stateRatePct: 6.625, asOf: 2025, localAddOn: false, servicesTaxable: false } },
  NM: { code: 'NM', name: 'New Mexico', tz: mountain, incomeTax: { kind: 'graduated', asOf: 2025 }, salesTax: { stateRatePct: 4.875, asOf: 2025, localAddOn: true, note: 'New Mexico’s Gross Receipts Tax applies to services too.', servicesTaxable: true } },
  NY: { code: 'NY', name: 'New York', tz: eastern, incomeTax: { kind: 'graduated', asOf: 2025 }, salesTax: { stateRatePct: 4, asOf: 2025, localAddOn: true, servicesTaxable: false } },
  NC: { code: 'NC', name: 'North Carolina', tz: eastern, incomeTax: { kind: 'flat', ratePct: 4.25, asOf: 2025 }, salesTax: { stateRatePct: 4.75, asOf: 2025, localAddOn: true, servicesTaxable: false } },
  ND: { code: 'ND', name: 'North Dakota', tz: central, tzNote: 'The southwest corner is Mountain.', incomeTax: { kind: 'graduated', asOf: 2025 }, salesTax: { stateRatePct: 5, asOf: 2025, localAddOn: true, servicesTaxable: false }, workersCompStateFund: true },
  OH: { code: 'OH', name: 'Ohio', tz: eastern, incomeTax: { kind: 'graduated', asOf: 2025 }, salesTax: { stateRatePct: 5.75, asOf: 2025, localAddOn: true, servicesTaxable: false }, workersCompStateFund: true },
  OK: { code: 'OK', name: 'Oklahoma', tz: central, incomeTax: { kind: 'graduated', asOf: 2025 }, salesTax: { stateRatePct: 4.5, asOf: 2025, localAddOn: true, servicesTaxable: false } },
  OR: { code: 'OR', name: 'Oregon', tz: pacific, tzNote: 'Most of Malheur County is Mountain.', incomeTax: { kind: 'graduated', asOf: 2025 }, salesTax: { stateRatePct: 0, asOf: 2025, localAddOn: false, note: 'No sales tax.', servicesTaxable: false } },
  PA: { code: 'PA', name: 'Pennsylvania', tz: eastern, incomeTax: { kind: 'flat', ratePct: 3.07, asOf: 2025 }, salesTax: { stateRatePct: 6, asOf: 2025, localAddOn: true, servicesTaxable: false } },
  RI: { code: 'RI', name: 'Rhode Island', tz: eastern, incomeTax: { kind: 'graduated', asOf: 2025 }, salesTax: { stateRatePct: 7, asOf: 2025, localAddOn: false, servicesTaxable: false } },
  SC: { code: 'SC', name: 'South Carolina', tz: eastern, incomeTax: { kind: 'graduated', asOf: 2025 }, salesTax: { stateRatePct: 6, asOf: 2025, localAddOn: true, servicesTaxable: false } },
  SD: { code: 'SD', name: 'South Dakota', tz: central, tzNote: 'The western half is Mountain.', incomeTax: { kind: 'none' }, salesTax: { stateRatePct: 4.2, asOf: 2025, localAddOn: true, note: 'South Dakota taxes most services.', servicesTaxable: true } },
  TN: { code: 'TN', name: 'Tennessee', tz: central, tzNote: 'East Tennessee is Eastern.', incomeTax: { kind: 'none' }, salesTax: { stateRatePct: 7, asOf: 2025, localAddOn: true, servicesTaxable: false } },
  TX: { code: 'TX', name: 'Texas', tz: central, tzNote: 'El Paso and Hudspeth counties are Mountain.', incomeTax: { kind: 'none' }, salesTax: { stateRatePct: 6.25, asOf: 2025, localAddOn: true, note: 'Texas taxes lawn care, pest control, janitorial and commercial repair/remodel labor; new construction and residential repair labor generally are not.', servicesTaxable: true }, sui: { wageBase: 9000, newEmployerRatePct: 2.7, asOf: 2025, agency: 'Texas Workforce Commission' } },
  UT: { code: 'UT', name: 'Utah', tz: mountain, incomeTax: { kind: 'flat', ratePct: 4.5, asOf: 2025 }, salesTax: { stateRatePct: 4.85, asOf: 2025, localAddOn: true, note: 'Every Utah location adds at least 1.25% local, so the floor is 6.1%; Salt Lake County runs about 7.25–7.75%.', servicesTaxable: false }, sui: { wageBase: 50700, newEmployerRatePct: 1.4, asOf: 2026, agency: 'Utah DWS' } },
  VT: { code: 'VT', name: 'Vermont', tz: eastern, incomeTax: { kind: 'graduated', asOf: 2025 }, salesTax: { stateRatePct: 6, asOf: 2025, localAddOn: true, servicesTaxable: false } },
  VA: { code: 'VA', name: 'Virginia', tz: eastern, incomeTax: { kind: 'graduated', asOf: 2025 }, salesTax: { stateRatePct: 4.3, asOf: 2025, localAddOn: true, note: 'A uniform 1% local tax applies everywhere, so the floor is 5.3%.', servicesTaxable: false } },
  WA: { code: 'WA', name: 'Washington', tz: pacific, incomeTax: { kind: 'none' }, salesTax: { stateRatePct: 6.5, asOf: 2025, localAddOn: true, note: 'Washington taxes construction labor and most services; the B&O tax is separate.', servicesTaxable: true }, workersCompStateFund: true },
  WV: { code: 'WV', name: 'West Virginia', tz: eastern, incomeTax: { kind: 'graduated', asOf: 2025 }, salesTax: { stateRatePct: 6, asOf: 2025, localAddOn: true, servicesTaxable: false } },
  WI: { code: 'WI', name: 'Wisconsin', tz: central, incomeTax: { kind: 'graduated', asOf: 2025 }, salesTax: { stateRatePct: 5, asOf: 2025, localAddOn: true, servicesTaxable: false } },
  WY: { code: 'WY', name: 'Wyoming', tz: mountain, incomeTax: { kind: 'none' }, salesTax: { stateRatePct: 4, asOf: 2025, localAddOn: true, servicesTaxable: false }, workersCompStateFund: true },
}

export const stateProfile = (code: string | null | undefined): StateProfile | null => STATE_PROFILES[String(code || '').toUpperCase()] || null

// ── the trade → what it implies ──────────────────────────────────────────
//
// NAICS is what the SBA, the bank and the insurer ask for and nobody knows
// by heart. Service types seed the pipeline's dropdowns; the owner renames
// them from Settings. Warranty months match src/pages/Onboarding.jsx (DLC's
// five-year LED parts warranty is why lighting gets 60).
export interface TradeProfile { key: string; label: string; naics: string; serviceTypes: string[]; agents: string[]; partsWarrantyMonths: number }
export const TRADES: TradeProfile[] = [
  { key: 'lighting',    label: 'Commercial Lighting & Electrical', naics: '238210', serviceTypes: ['Lighting Retrofit', 'Electrical', 'Service Call', 'Panel Upgrade'], agents: ['arnie-og', 'lenard-lighting'], partsWarrantyMonths: 60 },
  { key: 'electrical',  label: 'Electrical',                        naics: '238210', serviceTypes: ['Electrical', 'Service Call', 'Panel Upgrade', 'Lighting'], agents: ['arnie-og', 'lenard-lighting'], partsWarrantyMonths: 60 },
  { key: 'hvac',        label: 'HVAC',                              naics: '238220', serviceTypes: ['HVAC Repair', 'Installation', 'Maintenance', 'Service Call'], agents: ['arnie-og'], partsWarrantyMonths: 12 },
  { key: 'plumbing',    label: 'Plumbing',                          naics: '238220', serviceTypes: ['Plumbing Repair', 'Water Heater', 'Drain Cleaning', 'Service Call'], agents: ['arnie-og'], partsWarrantyMonths: 12 },
  { key: 'solar',       label: 'Solar',                             naics: '238210', serviceTypes: ['Solar Install', 'Service Call', 'Battery'], agents: ['arnie-og'], partsWarrantyMonths: 12 },
  { key: 'landscaping', label: 'Lawn & Landscaping',                naics: '561730', serviceTypes: ['Mowing', 'Fertilization', 'Cleanup', 'Landscaping', 'Irrigation'], agents: ['arnie-og', 'zach-yard-yeti'], partsWarrantyMonths: 12 },
  { key: 'cleaning',    label: 'Cleaning & Exterior',               naics: '561720', serviceTypes: ['Window Cleaning', 'Pressure Washing', 'Gutter Cleaning', 'Janitorial'], agents: ['arnie-og', 'walter-windows'], partsWarrantyMonths: 12 },
  { key: 'roofing',     label: 'Roofing',                           naics: '238160', serviceTypes: ['Roof Replacement', 'Roof Repair', 'Inspection', 'Gutters'], agents: ['arnie-og'], partsWarrantyMonths: 12 },
  { key: 'painting',    label: 'Painting',                          naics: '238320', serviceTypes: ['Interior Painting', 'Exterior Painting', 'Commercial'], agents: ['arnie-og'], partsWarrantyMonths: 12 },
  { key: 'flooring',    label: 'Flooring',                          naics: '238330', serviceTypes: ['Flooring Install', 'Refinishing', 'Repair'], agents: ['arnie-og'], partsWarrantyMonths: 12 },
  { key: 'excavation',  label: 'Excavation & Dirt Work',            naics: '238910', serviceTypes: ['Excavation', 'Grading', 'Trenching', 'Demolition'], agents: ['arnie-og'], partsWarrantyMonths: 12 },
  { key: 'gc',          label: 'General Contracting / Remodel',     naics: '236118', serviceTypes: ['Remodel', 'Repair', 'Addition', 'Service Call'], agents: ['arnie-og'], partsWarrantyMonths: 12 },
  { key: 'pest',        label: 'Pest Control',                      naics: '561710', serviceTypes: ['Treatment', 'Inspection', 'Recurring Service'], agents: ['arnie-og'], partsWarrantyMonths: 12 },
  { key: 'fleet',       label: 'Fleet / Transportation',            naics: '484110', serviceTypes: ['Haul', 'Delivery', 'Service Call'], agents: ['arnie-og', 'freddy-fleet'], partsWarrantyMonths: 12 },
  { key: 'other',       label: 'Field Service (other)',             naics: '238990', serviceTypes: ['Service Call', 'Installation', 'Repair', 'Maintenance'], agents: ['arnie-og'], partsWarrantyMonths: 12 },
]

/** The trade from the words the owner used: "we do LED retrofits and electrical" → lighting. */
export function tradeFor(said: string): TradeProfile {
  const s = String(said || '').toLowerCase()
  const pick = (k: string) => TRADES.find((t) => t.key === k)!
  if (/\b(light|led|retrofit|lighting)\b/.test(s)) return pick('lighting')
  if (/\b(electric|electrician)/.test(s)) return pick('electrical')
  if (/\b(hvac|heating|cooling|air condition|furnace)/.test(s)) return pick('hvac')
  if (/\b(plumb)/.test(s)) return pick('plumbing')
  if (/\b(solar|pv)\b/.test(s)) return pick('solar')
  if (/\b(lawn|landscap|mow|turf|irrigat|yard)/.test(s)) return pick('landscaping')
  if (/\b(clean|window|pressure wash|power wash|janitor|gutter)/.test(s)) return pick('cleaning')
  if (/\b(roof)/.test(s)) return pick('roofing')
  if (/\b(paint)/.test(s)) return pick('painting')
  if (/\b(floor|carpet|tile)/.test(s)) return pick('flooring')
  if (/\b(excavat|dirt|grading|trench|earthwork|demolition)/.test(s)) return pick('excavation')
  if (/\b(general contract|remodel|handyman|construction)/.test(s)) return pick('gc')
  if (/\b(pest|exterminat|termite)/.test(s)) return pick('pest')
  if (/\b(fleet|trucking|haul|transport|delivery)/.test(s)) return pick('fleet')
  return pick('other')
}

/** "LLC", "S corp", "sole prop", "partnership", "C corp" → the company row's entity_type + the tax form it files. */
export function entityFor(said: string): { entity_type: string; business_type: string; taxForm: string } | null {
  const s = String(said || '').toLowerCase().replace(/[.\-]/g, ' ')
  if (/\bs\s*corp/.test(s)) return { entity_type: 'S-Corp', business_type: 'S-Corp', taxForm: '1120-S' }
  if (/\bc\s*corp|corporation\b/.test(s)) return { entity_type: 'C-Corp', business_type: 'C-Corp', taxForm: '1120' }
  if (/partner/.test(s)) return { entity_type: 'Partnership', business_type: 'Partnership', taxForm: '1065' }
  if (/sole|myself|just me|individual|dba\b/.test(s)) return { entity_type: 'Sole Proprietor', business_type: 'Sole Proprietor', taxForm: 'Schedule C' }
  if (/\bllc\b|limited liability/.test(s)) return { entity_type: 'LLC', business_type: 'LLC', taxForm: 'Schedule C (single-member) or 1065 (multi-member) unless taxed as an S-Corp' }
  return null
}
