// The one way a stored assessment becomes a priced bid.
//
// Two screens need this — the assessment list and the assessment detail — and
// an earlier draft of them each carried their own copy of the mapping. That is
// how the quote-line write ended up written three times in this repo before
// the copies drifted, so it lives here once instead.
//
// This file maps and delegates. It does not price: every figure comes back
// from windowEstimator.walterEstimate().

import { walterEstimate } from './windowEstimator'

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

  return { bid, zones, counts: registerCounts(zones, bid), rows: items.length }
}

/**
 * What a register is made of, in the four numbers a person actually asks for.
 *
 * The engine's `excluded` is every row it did not resurface — duplicate
 * photographs, L0s routed to cleaning and marks that must not be touched, all
 * together. That is the right number for the engine and the wrong one for a
 * screen: on the demo register it is 54 of 68, which reads like something
 * broke when 45 of those are simply the same scratches photographed twice.
 * So the kinds are separated here, once, rather than subtracted back apart on
 * each page.
 */
export function registerCounts(zones, bid) {
  const list = Array.isArray(zones) ? zones : []
  const dupes = list.filter((z) => z?.duplicate_of).length
  return {
    rows: list.length,
    dupes,
    // One entry per real mark, however many times it was photographed.
    marks: list.length - dupes,
    // Marks that will not be resurfaced at all, and for a stated reason —
    // a coating that cannot be abraded, a factory defect, a crack through.
    blocked: list.filter((z) => !z?.duplicate_of && z?.not_restorable_reason).length,
    to_resurface: bid?.restoration?.zones_counted ?? 0,
    to_clean: bid?.restoration?.zones_to_clean ?? 0,
  }
}
