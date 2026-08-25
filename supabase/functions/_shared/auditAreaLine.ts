// Turning an audit area into an estimate line — ONE definition.
//
// This rule was written four times and every copy answered it differently:
//
//   LightingAuditDetail  led_product.price, else watts x cost-per-watt.
//                        Carries notes, photos and a description.
//   NewLightingAudit     watts x cost-per-watt only. No product price, no
//                        description. Carries notes and photos.
//   LeadDetail           watts x cost-per-watt only. Carries photos but NOT
//                        the tech's notes, and no description.
//   backfill-audit-      its own copy again.
//   estimates
//
// Three of the four ignore the catalogue price entirely, and all four go
// NEGATIVE when existing_wattage is 0 — a new install, or an area where the
// rep picked an LED product without recording what was there before. That
// produced estimates with negative line totals across "all reps and projects".
//
// Cost-per-watt was never a price. It is a back-derivation: take the headline
// total, divide it across the lines by wattage. It only ever existed because
// audit_areas recorded no price. Now it does (unit_price, product_qty,
// line_total), so this is the precedence:
//
//   1. What the area RECORDED it sold. Lenard computed it, the customer signed
//      a document showing it, and it is stored. Nothing beats it.
//   2. The catalogue price for the chosen product, times the fixture count.
//   3. Cost-per-watt, clamped at zero — legacy areas only, saved before the
//      pricing columns existed. It is a guess, and it is labelled as one.
//
// Dependency-free so Deno and the browser share one copy. The app imports it
// through src/lib/auditAreaLine.js.

const num = (v: unknown, d = 0): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}

export function round2(n: unknown): number {
  const v = Number(n)
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0
}

/**
 * The tech's words and pictures. Kept together because every path that drops
 * one tends to drop the other, and crews have reported losing both.
 */
export function areaAnnotations(area: any): { notes: string | null; photos: any[] } {
  const notes = String(area?.override_notes ?? '').trim()
  const photos = Array.isArray(area?.photos) ? area.photos.filter(Boolean) : []
  return { notes: notes || null, photos }
}

/** Watts this area removes. Never negative: a missing baseline is 0, not a credit. */
export function areaWattsReduced(area: any): number {
  const fixtures = num(area?.fixture_count, 1)
  return Math.max(0, (num(area?.existing_wattage) - num(area?.led_wattage)) * fixtures)
}

/**
 * Units of the replacement product this area buys. product_qty when the area
 * recorded one (it differs from fixture_count only for genuinely per-lamp
 * products); otherwise the fixture count.
 */
export function areaOrderQty(area: any): number {
  if (area?.product_qty != null) return num(area.product_qty, 1) || 1
  return num(area?.fixture_count, 1) || 1
}

/**
 * Cost-per-watt for the LEGACY fallback only. Returns 0 when the areas carry
 * real prices, so nothing back-derives a number it already knows.
 */
export function auditCostPerWatt(areas: any[], quoteAmount: number): number {
  const list = areas || []
  const totalWatts = list.reduce((s: number, a: any) => s + areaWattsReduced(a), 0)
  if (totalWatts <= 0) return 0
  return num(quoteAmount) / totalWatts
}

/** True when this area can be priced without guessing. */
export function areaHasRecordedPrice(area: any): boolean {
  return area?.unit_price != null || area?.line_total != null ||
    area?.led_product?.price != null
}

/**
 * One audit area as an estimate-intake line.
 *
 * `describe` is optional and produces the customer-facing description
 * (area, mounting height, existing to LED swap, controls). Pass the page's
 * own describeArea so the wording stays where it is authored.
 */
export function auditAreaToIntakeLine(
  area: any,
  opts: { costPerWatt?: number; describe?: (a: any) => string | null } = {},
): Record<string, unknown> {
  const { costPerWatt = 0, describe } = opts
  const qty = areaOrderQty(area)

  let price: number
  if (area?.unit_price != null) {
    price = num(area.unit_price)
  } else if (area?.led_product?.price != null) {
    price = num(area.led_product.price)
  } else {
    // Legacy guess. Per FIXTURE, so it multiplies by qty like a real price.
    const perFixtureWatts = Math.max(0, num(area?.existing_wattage) - num(area?.led_wattage))
    price = perFixtureWatts * num(costPerWatt)
  }

  const total = area?.line_total != null ? num(area.line_total) : qty * price
  const { notes, photos } = areaAnnotations(area)

  return {
    item_name: area?.led_product?.name || `${area?.area_name || 'Area'} - LED Retrofit`,
    description: describe ? (describe(area) || null) : null,
    item_id: area?.led_replacement_id == null ? null : Number(area.led_replacement_id),
    quantity: qty,
    price: round2(price),
    line_total: round2(total),
    notes,
    photos,
  }
}

/**
 * Every area of an audit as intake lines. quoteAmount is only consulted for
 * legacy areas that recorded no price at all.
 */
export function auditAreasToIntakeLines(
  areas: any[],
  opts: { quoteAmount?: number; describe?: (a: any) => string | null } = {},
): Record<string, unknown>[] {
  const list = areas || []
  const needsFallback = list.some((a) => !areaHasRecordedPrice(a))
  const costPerWatt = needsFallback ? auditCostPerWatt(list, num(opts.quoteAmount)) : 0
  return list.map((a) => auditAreaToIntakeLine(a, { costPerWatt, describe: opts.describe }))
}
