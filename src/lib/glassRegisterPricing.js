// Pricing a damage register from the tenant's price book.
//
// Walter used to answer "what does this cost" with minutes per zone, a tech
// day rate and a markup — numbers this repo invented. HHH now sells the work
// by the zone, which is the unit the register already produces and the unit
// the tiers already vary:
//
//   Glass Restoration — Light Abrasion (L1)   $225/zone
//   Glass Restoration — Deep or Edge (L2)     $565/zone
//   Glass Restoration — Optical Finishing      $80/zone
//
// So the register is priced the way a takeoff area is: look at what is there,
// find the product the tenant sells for it, multiply. Nothing here knows what
// a zone costs — only which product to ask.
//
// This lives in src/lib rather than _shared because it needs
// glassProductMatch, which is a browser module. The LINE it produces is built
// by _shared/glassAreaLine so there is still one definition of what an
// estimate line looks like.

import { bestGlassProduct, missingGlassWork } from './glassProductMatch'
import { glassAreaToIntakeLine, round2 } from './glassAreaLine'
import { countableZones, splitBySeverity, excludedZones } from './windowEstimator'

/**
 * Which product a zone is resurfaced with.
 *
 * L0 is deliberately null. It is probably residue, it gets tried with a cloth
 * first, and it goes to the cleaning crew — splitBySeverity already routes it
 * and registerCounts reports it as to_clean. Pricing an L0 as restoration
 * charges $225 for work a rag does.
 *
 * `restoration` is NOT used here. It is a family probe — "does this tenant do
 * this trade at all" — and it matches every severity, so asking it for one
 * product returns whichever happens to sort first.
 */
export const ZONE_WORK = {
  L0: null,
  L1: 'restoration_light',
  L2: 'restoration_deep',
}

export const FINISH_WORK = 'optical_finish'

export function zoneWorkKey(zone) {
  return ZONE_WORK[zone?.severity] ?? null
}

/** The work keys a register actually needs, so nothing asks for a product it will not use. */
export function registerWorkKeys(zones) {
  const keys = new Set()
  for (const z of splitBySeverity(zones).restoration) {
    const k = zoneWorkKey(z)
    if (k) keys.add(k)
  }
  if (keys.size) keys.add(FINISH_WORK)
  return [...keys]
}

/**
 * A damage register, priced from the book.
 *
 * Resurfacing is one line per severity — eight light zones at $225 reads to a
 * customer, eight separate $225 lines does not. Finishing is a second pass
 * over the SAME zones, so its quantity is every zone resurfaced, not the sum
 * of the severity lines again.
 *
 * Returns what it could not price rather than falling back on a rate: that is
 * the entire reason this file replaced an engine that always had an answer.
 */
export function priceRegister(zones, { products = [], groups = [], recurring = false, segment = 'commercial' } = {}) {
  const list = Array.isArray(zones) ? zones : []
  const split = splitBySeverity(list)
  const restoration = split.restoration
  const opts = { groups, recurring, segment }

  const bySeverity = new Map()
  for (const z of restoration) {
    const sev = z?.severity
    bySeverity.set(sev, (bySeverity.get(sev) || 0) + 1)
  }

  const lines = []
  const unpriced = []

  // One line per severity, in the order the ladder reads.
  for (const sev of ['L1', 'L2']) {
    const count = bySeverity.get(sev) || 0
    if (!count) continue
    const work = ZONE_WORK[sev]
    const product = bestGlassProduct(products, { ...opts, work })
    if (!product) unpriced.push({ work, severity: sev, zones: count })
    lines.push(glassAreaToIntakeLine({
      area_name: `${sev} zones`,
      product,
      product_id: product?.id ?? null,
      product_qty: count,
    }))
  }

  // The finishing pass, over every zone that got resurfaced.
  if (restoration.length) {
    const product = bestGlassProduct(products, { ...opts, work: FINISH_WORK })
    if (!product) unpriced.push({ work: FINISH_WORK, severity: null, zones: restoration.length })
    lines.push(glassAreaToIntakeLine({
      area_name: 'Optical finishing',
      product,
      product_id: product?.id ?? null,
      product_qty: restoration.length,
    }))
  }

  const excluded = excludedZones(list).filter((z) => z?.not_restorable_reason && !z?.duplicate_of)

  return {
    lines,
    total: round2(lines.reduce((s, l) => s + (Number(l.line_total) || 0), 0)),
    zones_counted: restoration.length,
    // L0s. Not priced here at all — they are the cleaning crew's.
    to_clean: split.cleaning,
    // Marks nobody may touch, with the reason, so the bid can say why.
    excluded,
    // Work this tenant has no product for. The screen must say so.
    unpriced,
    counted: countableZones(list).length,
  }
}

/**
 * Work the tenant cannot price at all, for a register.
 *
 * Thin wrapper so a screen asks one question instead of assembling the work
 * keys itself and getting them subtly different from the pricing path.
 */
export function registerMissingWork(zones, { products = [], groups = [], recurring = false, segment = 'commercial' } = {}) {
  return missingGlassWork(products, registerWorkKeys(zones), { groups, recurring, segment })
}
