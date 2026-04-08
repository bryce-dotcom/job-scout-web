// Runtime rate resolver for the RMP Wattsmart Express programs.
//
// Looks up the correct incentive rate ($/watt installed) for a given
// (program × business type × controls tier) combination by querying the
// prescriptive_measures table that was seeded from the official RMP UT
// Express Tool. If the lookup fails (missing row, offline, RLS hiccup,
// etc.) the resolver falls back to the hardcoded constants so Lenard
// never stops working mid-shift.
//
// Usage:
//   import { resolveRmpRate, mapLenardControlsToRmp, SBE_BUSINESS_TYPES } from '../lib/rmpMeasureLookup'
//   const { incentivePerWatt, maxProjectPercent, source } = await resolveRmpRate({
//     program: 'smbe',
//     businessType: 'Warehouse',
//     controlsTier: 'lllc',
//     isExterior: false,
//   })

import { supabase } from './supabase'

// ---------- Hardcoded fallback ----------
// These match the published RMP Wattsmart Express Lighting rates as of
// 2025-07-11. Kept in sync with the seed. Same values Lenard UT already had.
const FALLBACK = {
  smbe: {
    interior: { none: 1.5, control_ready: 2.0, nlc: 2.5, lllc: 3.5 },
    exterior: 2.4,
    cap: 0.75,
  },
  express: {
    interior: { none: 0.75, control_ready: 1.0, nlc: 1.25, lllc: 1.75 },
    exterior: 1.2,
    cap: 0.7,
  },
}

// ---------- Business type list (matches RMP Express Tool dropdown) ----------
export const SBE_BUSINESS_TYPES = [
  'Assembly',
  'Automotive Repair',
  'College or University',
  'Hospital',
  'Industrial Plant with Two Shifts',
  'Library',
  'Lodging',
  'Manufacturing',
  'Office <20,000 sf',
  'Office >100,000 sf',
  'Office 20,000 to 100,000 sf',
  'Other',
  'Other Health, Nursing, Medical Clinic',
  'Restaurant',
  'Retail',
  'Retail 5,000 to 50,000 sf',
  'Retail Big Box >50,000 sf One-Story',
  'Retail Boutique <5,000 sf',
  'Retail Mini Mart',
  'Retail Supermarket',
  'School K-12',
  'Warehouse',
]

// ---------- Controls tier mapping ----------
// Legacy Lenard controls types vs RMP tier IDs
const CONTROLS_MAP = {
  none: 'none',
  plug_play: 'control_ready', // Lenard called it plug_play; RMP calls it Control Ready
  networked: 'nlc',
  lllc: 'lllc',
  pending: null,                // no rate yet — rep needs to pick
}
export function mapLenardControlsToRmp(lenardType) {
  return CONTROLS_MAP[lenardType] || null
}

export const CONTROLS_TIER_OPTIONS = [
  { value: 'none', label: 'No Controls', smbeRate: 1.5, expressRate: 0.75 },
  { value: 'plug_play', label: 'Control Ready (Plug & Play)', smbeRate: 2.0, expressRate: 1.0 },
  { value: 'networked', label: 'Networked Lighting Control (NLC)', smbeRate: 2.5, expressRate: 1.25 },
  { value: 'lllc', label: 'Luminaire-Level Lighting Control (LLLC)', smbeRate: 3.5, expressRate: 1.75 },
]

// ---------- In-memory cache per session ----------
// Key: `${program}|${businessType}|${tier}|${isExterior}|${companyId}`
const cache = new Map()
export function clearRmpRateCache() { cache.clear() }

/**
 * Look up the per-watt incentive rate for an audit line item.
 *
 * @param {Object} args
 * @param {'smbe'|'express'} args.program
 * @param {string|null} args.businessType  e.g. 'Warehouse'
 * @param {string|null} args.controlsTier  'none'|'control_ready'|'nlc'|'lllc' (null = pending)
 * @param {boolean} args.isExterior        true = exterior fixture
 * @param {number|null} args.companyId
 * @returns {Promise<{incentivePerWatt:number, maxProjectPercent:number, source:'rmp_measure'|'hardcoded_fallback'|'pending'}>}
 */
export async function resolveRmpRate({
  program = 'smbe',
  businessType = null,
  controlsTier = null,
  isExterior = false,
  companyId = null,
} = {}) {
  // Pending: no rate until the rep picks a tier (unless exterior, which has
  // one flat rate regardless of controls).
  if (!isExterior && !controlsTier) {
    return { incentivePerWatt: 0, maxProjectPercent: FALLBACK[program]?.cap || 0.75, source: 'pending' }
  }

  const tier = isExterior ? 'exterior' : controlsTier
  const key = `${program}|${businessType || '-'}|${tier}|${isExterior}|${companyId || '-'}`
  if (cache.has(key)) return cache.get(key)

  // ---------- DB lookup ----------
  try {
    let q = supabase
      .from('prescriptive_measures')
      .select('incentive_amount, max_project_percent, annual_kwh_per_unit')
      .eq('rmp_is_sbe', program === 'smbe')
      .eq('rmp_controls_tier', tier)
      .limit(1)

    if (companyId) q = q.eq('company_id', companyId)
    // Business type only matters for interior measures; exterior rows have it null
    if (!isExterior && businessType) q = q.eq('rmp_business_type', businessType)

    const { data, error } = await q.maybeSingle()
    if (!error && data) {
      const result = {
        incentivePerWatt: parseFloat(data.incentive_amount) || 0,
        maxProjectPercent: parseFloat(data.max_project_percent) || FALLBACK[program].cap,
        annualKwhPerWatt: parseFloat(data.annual_kwh_per_unit) || 0,
        source: 'rmp_measure',
      }
      cache.set(key, result)
      return result
    }
  } catch (err) {
    console.warn('[rmpMeasureLookup] DB query failed, falling back:', err?.message || err)
  }

  // ---------- Fallback ----------
  const fallback = FALLBACK[program] || FALLBACK.smbe
  const rate = isExterior ? fallback.exterior : (fallback.interior[tier] || 0)
  const result = {
    incentivePerWatt: rate,
    maxProjectPercent: fallback.cap,
    annualKwhPerWatt: 0,
    source: 'hardcoded_fallback',
  }
  cache.set(key, result)
  return result
}

/**
 * Compute an audit line's uncapped incentive using the resolved rate.
 * Mirrors the RMP Express Tool X14 formula: qty × newW × CustomerIncentive
 *
 * @returns {Promise<number>}
 */
export async function computeLineIncentive(line, opts) {
  const qty = parseFloat(line.qty) || 0
  const newW = parseFloat(line.newW) || 0
  if (qty <= 0 || newW <= 0) return 0

  const isExterior = (line.location || line.category) === 'exterior'
  const controlsTier = isExterior ? 'exterior' : mapLenardControlsToRmp(line.controlsType)
  if (!isExterior && !controlsTier) return 0 // pending

  // RMP rule: if the existing fixture is already LED, zero out the incentive
  const existingName = (line.existingFixtureType || line.existingName || '').toLowerCase()
  if (/\bled\b/.test(existingName)) return 0

  const { incentivePerWatt } = await resolveRmpRate({
    program: opts.program,
    businessType: opts.businessType,
    controlsTier,
    isExterior,
    companyId: opts.companyId,
  })

  // Exterior fixtures cap at 285W installed per fixture (RMP wattage band cap)
  const effectiveW = isExterior ? Math.min(newW, 285) : newW
  return qty * effectiveW * incentivePerWatt
}
