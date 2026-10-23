// The one way a stored assessment becomes a priced bid.
//
// Two screens need this — the assessment list and the assessment detail — and
// an earlier draft of them each carried their own copy of the mapping. That is
// how the quote-line write ended up written three times in this repo before
// the copies drifted, so it lives here once instead.
//
// This file maps and delegates. It does not price: every figure comes back
// from windowEstimator.walterEstimate().

import { walterEstimate, registerCounts } from './windowEstimator'

/**
 * glass_damage_items rows → the zones the engine counts.
 *
 * `code` is the id a person reads ('A01') and the thing `duplicate_of` points
 * at, so it is what the engine must dedupe on. Falling back to the row id
 * keeps a register usable if someone saved a mark without a code.
 */
export function zonesFromRows(items) {
  return (Array.isArray(items) ? items : []).map((r) => ({
    id: r?.code || String(r?.id ?? ''),
    severity: r?.severity,
    edge: !!r?.edge,
    zone_scale: r?.zone_scale,
    duplicate_of: r?.duplicate_of,
    not_restorable_reason: r?.not_restorable_reason,
    lite_id: r?.lite_id,
    location: r?.location,
    face: r?.face,
  }))
}

/**
 * One assessment row (with its `glass_damage_items`, or items passed in)
 * priced by the engine.
 *
 * `vertical` decides which half runs: a cleaning-only visit must not be handed
 * a damage register to resurface, and a restoration-only one must not bill a
 * pane count nobody took.
 */
export function priceAssessment(assessment, itemRows) {
  const a = assessment || {}
  const items = itemRows || a.glass_damage_items || []
  const zones = zonesFromRows(items)
  const v = a.vertical || 'both'
  const wantsCleaning = v === 'cleaning' || v === 'both'
  const wantsRestoration = v === 'restoration' || v === 'both'

  const bid = walterEstimate({
    cleaning: wantsCleaning && a.panes
      ? {
          panes: a.panes,
          faces: a.faces ?? 2,
          condition: a.condition || 'maintenance',
          access: a.access || 'ground',
          tracks: a.tracks || 0,
          screens: a.screens || 0,
        }
      : null,
    restoration: wantsRestoration && zones.length
      ? { zones, access: a.access || 'ground' }
      : null,
    pricing: a.pricing || {},
    tier_spread: a.tier_spread || undefined,
    // The alternative the customer is actually choosing between. Given these,
    // the engine returns the comparison so no screen has to divide anything.
    replacement_low: a.replacement_cost_low || 0,
    replacement_high: a.replacement_cost_high || 0,
  })

  // The engine owns the register split now — it was raised from here and
  // moved in, so there is one rule rather than two that can drift. Called
  // directly rather than read off bid.restoration.register, because a
  // cleaning-only visit has no restoration block and still has a register.
  return { bid, zones, counts: registerCounts(zones), rows: items.length }
}
