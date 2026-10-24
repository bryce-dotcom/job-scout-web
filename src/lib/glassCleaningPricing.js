// Pricing a window-cleaning takeoff from the tenant's price book.
//
// The twin of glassRegisterPricing.js, for the other half of what Walter
// sells. The register counts damage zones; this counts windows. Both end the
// same way: look at what is there, find the product the tenant already sells
// for it, multiply. Neither knows what anything costs.
//
// What this replaces is windowEstimator.cleaningMinutes — panes times faces
// times 3.5 minutes a pane-face, times an access multiplier, times a
// condition multiplier, over a crew rate. Six invented numbers to arrive at a
// figure HHH had already typed into the book eight hundred and twenty-eight
// times. The multipliers are the worst of it, because each one quietly
// contradicts a real product:
//
//   access 1.7x   →  "Commercial Exterior Ladder Windows" $5 against $4
//   condition 3.4 →  "Post Construction Window Cleaning (More than 6ft)" $20
//   faces 2       →  $3 interior and $6 exterior are not one price doubled
//
// So faces are two rows, condition picks a different product, and reach picks
// a different product. Nothing multiplies anything.
//
// Lives in src/lib rather than _shared because it needs glassProductMatch and
// the window catalogue, both browser modules. The LINE it produces is built by
// _shared/glassAreaLine so there is still one definition of an estimate line.

import { bestGlassProduct, glassMatchAmbiguity, missingGlassWork } from './glassProductMatch'
import { glassAreaToIntakeLine, round2 } from './glassAreaLine'
import { rowPanes, rowExtras, rowSizeBand, accessFor, accessWorkKey } from './windowTypes'

/** Post-construction is a different product per size band, not a modifier. */
export const POST_CONSTRUCTION_WORK = {
  under_4: 'post_construction_small',
  over_4: 'post_construction_medium',
  over_6: 'post_construction_large',
}

/**
 * Which product cleans this row of glass, one face of it.
 *
 * The order matters and each step is a replacement, never a multiplier:
 *
 *   1. Post-construction is its own complete product. Scraping stucco and
 *      adhesive off new glass is not a maintenance clean with a factor on it;
 *      HHH sells it three times by size and that is the product being sold.
 *   2. Reach replaces the base product where the tenant prices reach — which
 *      is commercial only. A house is $6 outside whether the window is over
 *      the porch or over the garage, because the $6 already assumes somebody
 *      carried a ladder. accessWorkKey is where that asymmetry lives.
 *   3. Otherwise the plain product for the face. Interior and exterior are
 *      separate products at separate prices, so the face chooses, it does not
 *      double.
 *
 * Hard water is NOT here. It is an add-on, because the glass still has to be
 * cleaned before the scale comes off — $2.50 for scale removal on top of a $6
 * clean is a sensible number, and $2.50 INSTEAD of the clean is not. The old
 * engine had it as a 3.4x condition multiplier, which is the same mistake in
 * the other direction.
 */
export function cleaningWorkKey(row, type, face) {
  if (row?.condition === 'post_construction') {
    const band = rowSizeBand(row, type)
    return POST_CONSTRUCTION_WORK[band] || 'post_construction_medium'
  }
  const segment = row?.segment || 'residential'
  const access = row?.access || accessFor({
    floor: row?.floor, face, reach_in: row?.reach_in, segment,
  })
  const reach = accessWorkKey(access, face, segment)
  if (reach) return reach
  return face === 'in' ? 'interior' : 'exterior'
}

/** Which faces of this row get cleaned. 'both' is two products, not a multiplier. */
export function rowFaces(row) {
  const f = row?.face
  if (f === 'in') return ['in']
  if (f === 'out') return ['out']
  if (f === 'both' || f == null) return ['in', 'out']
  return ['out']
}

/**
 * Add-ons a row carries, as work keys.
 *
 * Screens and tracks come from the catalogue — a slider always has a track, a
 * picture window never has a screen — so nobody has to remember them. The old
 * takeoff asked for a screen count and a track count as free numbers on the
 * assessment, which is how a patio door track, the dirtiest track on the
 * house, got left off a bid by being left blank.
 *
 * Anything else the rep adds is explicit in row.addons.
 */
export function rowAddonWork(row, type) {
  const { screens, tracks } = rowExtras(row, type)
  const out = []
  if (screens > 0) out.push({ work: 'screens', qty: screens })
  if (tracks > 0) out.push({ work: 'tracks', qty: tracks })
  if (row?.condition === 'hard_water') {
    const { panes } = rowPanes(row, type)
    if (panes > 0) out.push({ work: 'hard_water', qty: panes })
  }
  for (const a of row?.addons || []) {
    const work = typeof a === 'string' ? a : a?.work
    if (!work) continue
    const qty = typeof a === 'string' ? rowPanes(row, type).panes : Number(a?.qty)
    if (Number.isFinite(qty) && qty > 0) out.push({ work, qty })
  }
  return out
}

/** Every work key a takeoff needs, so nothing asks for a product it will not use. */
export function takeoffWorkKeys(rows, types) {
  const byCode = typeIndex(types)
  const keys = new Set()
  for (const row of rows || []) {
    const type = byCode.get(row?.type_code) || null
    const { panes } = rowPanes(row, type)
    if (panes > 0) for (const face of rowFaces(row)) keys.add(cleaningWorkKey(row, type, face))
    for (const a of rowAddonWork(row, type)) keys.add(a.work)
  }
  return [...keys]
}

function typeIndex(types) {
  return new Map((types || []).filter((t) => t?.type_code).map((t) => [t.type_code, t]))
}

/**
 * A counted takeoff, priced from the book.
 *
 * Lines are aggregated by product, not by row. Fourteen areas of residential
 * exterior glass is ONE line of 86 panes at $6, which is what a customer can
 * read; fourteen separate $6 lines is a document nobody checks. The rows are
 * still returned so a screen can show the walk, and each line carries which
 * areas fed it.
 *
 * Returns what it could not price, and where the book is ambiguous, rather
 * than falling back on a rate. That is the whole reason this file exists.
 */
export function priceTakeoff(rows, {
  products = [], groups = [], types = [], recurring = false,
} = {}) {
  const list = Array.isArray(rows) ? rows : []
  const byCode = typeIndex(types)

  // work key -> { qty, areas }
  const demand = new Map()
  // `panes` is pieces of glass; `pane_faces` is what gets billed, which is
  // twice that when both sides are in scope. Keeping one number for both read
  // "20 panes" on a ten-window house and made the count look like the error.
  const counts = { units: 0, panes: 0, pane_faces: 0, screens: 0, tracks: 0, rows: 0, lites_billed: 0 }
  // A type_code the catalogue has no row for. unitPanes falls back to one pane
  // a unit, which is a sane floor and a silent halving on anything with two
  // sashes — so it is reported, the way an unpriced work key is.
  const unknownTypes = new Set()

  const want = (work, qty, areaName, segment) => {
    if (!(qty > 0)) return
    const key = `${work}::${segment}`
    const at = demand.get(key) || { work, segment, qty: 0, areas: [] }
    at.qty += qty
    if (areaName && !at.areas.includes(areaName)) at.areas.push(areaName)
    demand.set(key, at)
  }

  for (const row of list) {
    const type = byCode.get(row?.type_code) || null
    if (!type && row?.type_code) unknownTypes.add(row.type_code)
    const segment = row?.segment || 'residential'
    const panes = rowPanes(row, type)
    const areaName = row?.area_name || type?.type_name || null
    counts.rows += 1
    counts.units += panes.units
    counts.panes += panes.panes
    if (panes.basis === 'lites') counts.lites_billed += panes.panes

    for (const face of rowFaces(row)) {
      if (panes.panes > 0) {
        counts.pane_faces += panes.panes
        want(cleaningWorkKey(row, type, face), panes.panes, areaName, segment)
      }
    }
    for (const a of rowAddonWork(row, type)) {
      if (a.work === 'screens') counts.screens += a.qty
      if (a.work === 'tracks') counts.tracks += a.qty
      want(a.work, a.qty, areaName, segment)
    }
  }

  const lines = []
  const unpriced = []
  const ambiguities = []

  for (const at of demand.values()) {
    const opts = { groups, recurring, segment: at.segment, work: at.work }
    const product = bestGlassProduct(products, opts)
    if (!product) unpriced.push({ work: at.work, segment: at.segment, quantity: at.qty, areas: at.areas })
    const amb = glassMatchAmbiguity(products, opts)
    if (amb) ambiguities.push(amb)
    lines.push({
      ...glassAreaToIntakeLine({
        area_name: at.work,
        segment: at.segment,
        product,
        product_id: product?.id ?? null,
        product_qty: at.qty,
      }),
      work: at.work,
      segment: at.segment,
      areas: at.areas,
      ambiguous: !!amb,
    })
  }

  // Cheapest-to-read order: the glass first, then what hangs off it.
  const ORDER = ['interior', 'exterior', 'interior_exterior']
  lines.sort((a, b) => {
    const ai = ORDER.indexOf(a.work), bi = ORDER.indexOf(b.work)
    if (ai !== bi) return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi)
    return String(a.item_name).localeCompare(String(b.item_name))
  })

  return {
    lines,
    total: round2(lines.reduce((s, l) => s + (Number(l.line_total) || 0), 0)),
    counts,
    // Work this tenant has no product for. The screen must say so.
    unpriced,
    // Work the book prices twice at different figures. A person chooses.
    ambiguities,
    // Window types the catalogue is missing. Counted at one pane a unit,
    // which halves anything with two sashes — so it is said out loud.
    unknown_types: [...unknownTypes],
  }
}

/** Work the tenant cannot price at all, for a takeoff. */
export function takeoffMissingWork(rows, { products = [], groups = [], types = [], recurring = false, segment } = {}) {
  return missingGlassWork(products, takeoffWorkKeys(rows, types), { groups, recurring, segment })
}
