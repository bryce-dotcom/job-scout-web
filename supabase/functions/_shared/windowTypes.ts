// How many panes is that, how big is it, and how high up — the rules.
//
// The catalogue itself is rows (window_types, window_scale_reference, seeded
// by 20261024163000_window_reference_data.sql) because it is data somebody
// will add to and correct. What is here instead is the ARITHMETIC over those
// rows, which is the part that must not be written twice: the vision call in
// an edge function and the takeoff screen in the browser have to agree on what
// fourteen double-hungs comes to, or Walter proposes one number and the screen
// shows another.
//
// Nothing in this file knows a price. It answers three questions — how many
// panes, which size band, what access — and each answer is a key that
// glassProductMatch turns into one of the tenant's own products. That is the
// whole point of the rebuild: the quantity is ours, the price is theirs.
//
// Dependency-free so Deno and the browser share one copy. The app imports it
// through src/lib/windowTypes.js.

const num = (v: unknown, d = 0): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}

// ---------------------------------------------------------------------
// Panes
// ---------------------------------------------------------------------

/**
 * What one unit of this type is worth in billable glass, ONE side.
 *
 * `basis` is returned, not hidden, because it is the single biggest lever in
 * the bid and the one most likely to be wrong. A 6-over-6 colonial sash is
 * twelve pieces of glass with corners; the same window with a snap-in grille
 * is two flat sheets. They look identical in a photograph and they differ by
 * six times. So the catalogue carries bill_lites per type, the answer says
 * which basis it used, and the takeoff shows it where a rep can flip it.
 *
 * `countLites` overrides the type's own default when the rep has looked.
 */
export function unitPanes(
  type: any,
  opts: { countLites?: boolean | null } = {},
): { panes: number; lites: number; billable: number; basis: 'panes' | 'lites' } {
  const panes = Math.max(0, Math.round(num(type?.panes_per_unit, 1)))
  // A type with no lite count recorded is a plain unit: its lites ARE its
  // panes. Defaulting to 0 here would zero out the bid for anything gridded
  // the moment somebody asked for lites.
  const lites = type?.lites_per_unit == null
    ? panes
    : Math.max(0, Math.round(num(type.lites_per_unit, panes)))

  const wantLites = opts.countLites == null ? !!type?.bill_lites : !!opts.countLites
  const basis: 'panes' | 'lites' = wantLites ? 'lites' : 'panes'
  return { panes, lites, billable: basis === 'lites' ? lites : panes, basis }
}

/**
 * A counted row of windows as billable panes.
 *
 * `units` is what a person counted standing at the building — "six
 * double-hungs" — and the catalogue turns it into twelve panes. A row that
 * records its own pane_count beats the catalogue: somebody looked.
 */
export function rowPanes(
  row: any,
  type: any,
  opts: { countLites?: boolean | null } = {},
): { panes: number; per_unit: number; units: number; basis: 'panes' | 'lites' | 'counted' } {
  const units = Math.max(0, Math.round(num(row?.units ?? row?.unit_count, 0)))
  if (row?.pane_count != null && row?.units == null && row?.unit_count == null) {
    const counted = Math.max(0, Math.round(num(row.pane_count, 0)))
    return { panes: counted, per_unit: counted, units: 1, basis: 'counted' }
  }
  const per = unitPanes(type, {
    countLites: row?.count_lites ?? opts.countLites ?? null,
  })
  return { panes: units * per.billable, per_unit: per.billable, units, basis: per.basis }
}

/** Screens and tracks that come with a counted row, each its own product. */
export function rowExtras(row: any, type: any): { screens: number; tracks: number } {
  const units = Math.max(0, Math.round(num(row?.units ?? row?.unit_count, 0)))
  const screens = row?.screens != null
    ? Math.max(0, Math.round(num(row.screens, 0)))
    : units * Math.max(0, Math.round(num(type?.screens_per_unit, 0)))
  const tracks = row?.tracks != null
    ? Math.max(0, Math.round(num(row.tracks, 0)))
    : (type?.has_track ? units : 0)
  return { screens, tracks }
}

// ---------------------------------------------------------------------
// Size
// ---------------------------------------------------------------------

/**
 * The three bands HHH prices post-construction cleaning in.
 *
 * Read literally off the product names — "Less than 4ft wide/high", "More
 * than 4ft wide/high", "More than 6ft wide/high" — so the band is decided by
 * the LARGER dimension, which is what "wide/high" says.
 *
 * Worth knowing before trusting it: the book is not monotonic. Under 4ft is
 * $6 a pane, over 4ft is $4, over 6ft is $20. A bigger window is cheaper in
 * the middle band. That may be deliberate (a large sheet is quick per pane,
 * a 6ft sheet needs two people) or it may be a typo from years ago. Either
 * way it is the tenant's number and this file does not second-guess it — it
 * reports the band and lets the price book answer.
 */
export const SIZE_BANDS = ['under_4', 'over_4', 'over_6'] as const
export type SizeBand = typeof SIZE_BANDS[number]

export function sizeBandFor(dims: { width_in?: unknown; height_in?: unknown } | null | undefined): SizeBand | null {
  const w = num(dims?.width_in, 0)
  const h = num(dims?.height_in, 0)
  const largest = Math.max(w, h)
  if (!largest) return null
  if (largest > 72) return 'over_6'
  if (largest > 48) return 'over_4'
  return 'under_4'
}

/** The band for a row: what was measured, else what the type usually is. */
export function rowSizeBand(row: any, type: any): SizeBand | null {
  if (row?.size_band && (SIZE_BANDS as readonly string[]).includes(row.size_band)) return row.size_band
  const measured = sizeBandFor({ width_in: row?.width_in, height_in: row?.height_in })
  if (measured) return measured
  if (type?.size_band && (SIZE_BANDS as readonly string[]).includes(type.size_band)) return type.size_band
  return sizeBandFor({ width_in: type?.typical_width_in, height_in: type?.typical_height_in })
}

// ---------------------------------------------------------------------
// Height, and the access it forces
// ---------------------------------------------------------------------

/**
 * How high is that, from a photograph.
 *
 * Two shapes, because there are two ways to read a picture. Either something
 * of known size spans a measurable part of the frame and the target is scaled
 * against it, or the wall is coursed and the courses are counted. Masonry
 * gives the better answer: a brick course is 2.67in and counting nine of them
 * from grade to the sill is two feet, with no perspective arithmetic at all.
 *
 * Both take their reference dimension from window_scale_reference rather than
 * a constant here, so a bad figure is fixed in a row and not a deploy.
 */
export function scaleHeight(args: {
  reference_in?: unknown
  reference_px?: unknown
  target_px?: unknown
}): number | null {
  const refIn = num(args?.reference_in, 0)
  const refPx = num(args?.reference_px, 0)
  const tgtPx = num(args?.target_px, 0)
  if (refIn <= 0 || refPx <= 0 || tgtPx <= 0) return null
  return Math.round((refIn * tgtPx) / refPx)
}

/** Height from a coursed wall: courses counted times the course dimension. */
export function courseHeight(args: { course_in?: unknown; courses?: unknown }): number | null {
  const course = num(args?.course_in, 0)
  const n = num(args?.courses, 0)
  if (course <= 0 || n <= 0) return null
  return Math.round(course * n)
}

/** Which storey a sill at this height sits on. Ground floor is 1. */
export function storeyFor(heightIn: unknown, segment = 'residential'): number {
  const h = num(heightIn, 0)
  if (h <= 0) return 1
  const storey = segment === 'commercial' ? 144 : 120
  return Math.max(1, Math.floor(h / storey) + 1)
}

/**
 * How the glass gets reached, from the storey it is on and the side it is.
 *
 * Mapped onto the products HHH actually has ACTIVE today, which is not what
 * the book held a year ago. Every LIFT product — "Commercial Windows (LIFT Up
 * To 10 Floors)" at $5, "(LIFT Up To 7 Floors)" at $4, "Hard to access Lift
 * Windows" — is now inactive. The live access products are ladder work at $4
 * interior and $5 exterior, and "Exterior WaterFed windows above 2 stories"
 * at $7. So the ladder below stops at waterfed, and `lift` is returned only
 * where nothing else can reach — where the matcher will find no product and
 * the screen is expected to say so rather than invent one.
 *
 * Interior reach is NOT the storey. A stairwell window on the ground floor
 * can be eighteen feet above the floor inside and a second-storey bedroom
 * window is at chest height from the room. So an interior row says its own
 * reach_in when it is high, and the storey only drives the exterior side.
 */
export const ACCESS_LADDER = ['ground', 'ladder', 'waterfed', 'lift', 'rope'] as const
export type Access = typeof ACCESS_LADDER[number]

export function accessFor(args: {
  floor?: unknown
  face?: string | null
  reach_in?: unknown
  segment?: string | null
}): Access {
  const face = args?.face === 'in' ? 'in' : 'out'

  if (face === 'in') {
    // Inside, what matters is how far above the floor the glass is, not which
    // storey the floor is. Anything a pole reaches from the floor is ground
    // work; a vaulted stairwell or a tall atrium is ladder work.
    const reach = num(args?.reach_in, 0)
    return reach > 144 ? 'ladder' : 'ground'
  }

  const floor = Math.max(1, Math.round(num(args?.floor, 1)))
  if (floor <= 1) return 'ground'
  if (floor === 2) return 'ladder'
  // "above 2 stories" is the waterfed product in so many words. A fed pole
  // reaches about four storeys; past that nothing in the book applies.
  if (floor <= 4) return 'waterfed'
  if (floor <= 10) return 'lift'
  return 'rope'
}

/**
 * The work key for an access level, or null when access changes nothing.
 *
 * Residential returns null throughout, and that is the book talking, not an
 * omission: HHH has no residential height product at all. A house is priced
 * at $3 inside and $6 outside whether the window is over the porch or over
 * the garage, because the $6 already assumes somebody carried a ladder. Only
 * the commercial side prices reach separately, so only the commercial side
 * gets a key. Where a key comes back and the book has no product for it,
 * missingGlassWork reports the gap instead of anything falling back on a
 * multiplier.
 */
export function accessWorkKey(access: Access | null | undefined, face = 'out', segment = 'residential'): string | null {
  if (segment !== 'commercial') return null
  if (access === 'ladder') return face === 'in' ? 'ladder_interior' : 'ladder_exterior'
  if (access === 'waterfed') return 'waterfed'
  if (access === 'lift' || access === 'rope') return 'lift'
  return null
}

/** Everything the catalogue says about a counted row, in one call. */
export function describeRow(row: any, type: any, opts: { countLites?: boolean | null } = {}) {
  const panes = rowPanes(row, type, opts)
  const extras = rowExtras(row, type)
  const band = rowSizeBand(row, type)
  const access = (row?.access && (ACCESS_LADDER as readonly string[]).includes(row.access))
    ? row.access as Access
    : accessFor({ floor: row?.floor, face: row?.face, reach_in: row?.reach_in, segment: row?.segment })
  return {
    type_code: type?.type_code ?? row?.type_code ?? null,
    type_name: type?.type_name ?? null,
    ...panes,
    ...extras,
    size_band: band,
    access,
    access_work: accessWorkKey(access, row?.face ?? 'out', row?.segment ?? 'residential'),
  }
}
