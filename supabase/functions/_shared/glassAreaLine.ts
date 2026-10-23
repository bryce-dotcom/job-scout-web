// Turning a glass takeoff area into an estimate line — ONE definition.
//
// The twin of auditAreaLine.ts, and written for the same reason: that rule had
// been written four times and all four copies disagreed. This is the fifth
// trade to need it, so it starts in _shared rather than arriving there after
// the copies have drifted.
//
// The precedence, same shape as Lenard's:
//
//   1. What the area RECORDED it sold — unit_price and line_total. Nothing
//      beats it. The number was computed when the rep stood at the building
//      and the customer may already have signed a document showing it.
//   2. The tenant's catalogue price for the product they chose, times the
//      quantity.
//
// And then it stops. There is deliberately NO third step.
//
// Lenard has one — cost-per-watt — because audit_areas predates its pricing
// columns and legacy rows record no price at all. Walter has no legacy: this
// table is new, and the whole point of the rebuild is that Walter stopped
// inventing rates. An area with no product is UNPRICED, and the honest answer
// is to say so and have somebody pick a product, not to fall back on a
// minutes-per-pane figure that nobody in the business agreed to.
//
// An unpriced area still returns a line, at zero. It is not dropped. A line
// showing $0 is an argument somebody can have; an area silently missing from
// the estimate is not visible to anyone — the same reasoning that made a
// dangling duplicate_of count its mark rather than lose it.
//
// Dependency-free so Deno and the browser share one copy. The app imports it
// through src/lib/glassAreaLine.js.

const num = (v: unknown, d = 0): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}

export function round2(n: unknown): number {
  const v = Number(n)
  return Number.isFinite(v) ? Math.round(v * 100) / 100 : 0
}

/** The rep's words and pictures, kept together — every path that drops one drops both. */
export function glassAreaAnnotations(area: any): { notes: string | null; photos: any[] } {
  const notes = String(area?.override_notes ?? area?.notes ?? '').trim()
  const photos = Array.isArray(area?.photos) ? area.photos.filter(Boolean) : []
  return { notes: notes || null, photos }
}

/**
 * Units of the product this area buys.
 *
 * product_qty when the area recorded one — it differs from the pane count for
 * products sold by something other than the pane, such as tracks or a window
 * well. Otherwise the pane count.
 */
export function glassAreaOrderQty(area: any): number {
  if (area?.product_qty != null) return num(area.product_qty, 0)
  return num(area?.pane_count, 0)
}

/** The catalogue price of whatever product the area points at, or null. */
export function glassAreaProductPrice(area: any): number | null {
  const p = area?.product ?? area?.products_services
  if (p?.unit_price != null) return num(p.unit_price)
  return null
}

/** True when this area can be priced without inventing anything. */
export function glassAreaHasPrice(area: any): boolean {
  return area?.unit_price != null ||
    area?.line_total != null ||
    glassAreaProductPrice(area) != null
}

/** The areas nobody can price yet, so a screen can refuse to send the estimate. */
export function unpricedGlassAreas(areas: any[]): any[] {
  return (areas || []).filter((a) => !glassAreaHasPrice(a))
}

/**
 * One glass area as an estimate-intake line.
 *
 * `item_id` is the product. That is what makes this a sale of something the
 * tenant actually lists rather than a number Walter produced.
 */
export function glassAreaToIntakeLine(
  area: any,
  opts: { describe?: (a: any) => string | null } = {},
): Record<string, unknown> {
  const { describe } = opts
  const qty = glassAreaOrderQty(area)
  const product = area?.product ?? area?.products_services

  let price = 0
  if (area?.unit_price != null) price = num(area.unit_price)
  else {
    const catalogue = glassAreaProductPrice(area)
    if (catalogue != null) price = catalogue
  }

  const total = area?.line_total != null ? num(area.line_total) : qty * price
  const { notes, photos } = glassAreaAnnotations(area)

  return {
    item_name: product?.name || area?.area_name || 'Glass',
    description: describe ? (describe(area) || null) : null,
    item_id: area?.product_id == null ? null : Number(area.product_id),
    quantity: qty,
    price: round2(price),
    line_total: round2(total),
    notes,
    photos,
    // Carried so a caller never has to re-derive it, and so a $0 line is
    // obviously unpriced rather than obviously free.
    unpriced: !glassAreaHasPrice(area),
  }
}

/** Every area of a takeoff as intake lines, in the order they were walked. */
export function glassAreasToIntakeLines(
  areas: any[],
  opts: { describe?: (a: any) => string | null } = {},
): Record<string, unknown>[] {
  return (areas || []).map((a) => glassAreaToIntakeLine(a, opts))
}

/** What the priced lines come to. Unpriced areas contribute nothing, loudly. */
export function glassAreasTotal(areas: any[]): number {
  return round2(
    glassAreasToIntakeLines(areas).reduce((s, l) => s + num(l.line_total), 0),
  )
}
