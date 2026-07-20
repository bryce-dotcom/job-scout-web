// Product variants — pure helpers shared by the picker (and unit tests).
//
// A "variant group" is a set of products_services rows sharing a
// variant_group_id. Each row carries a structured `variant_options` map that
// was parsed ONCE at backfill time (never re-parsed at runtime), e.g.
//   { Wattage: "50-110W", Lift: false, Controls: true, Relocate: false }
//
// String-valued options are single-select axes (pick one chip); boolean-valued
// options are toggles. The picker renders one control per axis and resolves the
// current selection back to exactly one real row.

// Natural sort so "50-110W" < "90-165W" < "150-220W" (by leading number),
// falling back to locale compare for non-numeric values.
export function naturalCompare(a, b) {
  const na = parseFloat(String(a).match(/-?\d+(\.\d+)?/)?.[0])
  const nb = parseFloat(String(b).match(/-?\d+(\.\d+)?/)?.[0])
  if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb
  return String(a).localeCompare(String(b))
}

/**
 * Derive the ordered option axes for a set of variant rows.
 * @param {Array<{variant_options?: Object}>} rows
 * @returns {Array<{name: string, type: 'select'|'toggle', values: Array}>}
 *
 * Order is deterministic (storage can't be relied on — jsonb reorders keys):
 * single-select axes first, then toggles; alphabetical within each type.
 * Select values are natural-sorted; toggles are [false, true].
 */
export function deriveVariantAxes(rows) {
  const keys = {} // name -> { values:Set, boolCount, total }
  for (const r of rows || []) {
    const opts = r?.variant_options || {}
    for (const [k, v] of Object.entries(opts)) {
      if (!keys[k]) keys[k] = { name: k, values: new Set(), boolCount: 0, total: 0 }
      keys[k].total++
      if (typeof v === 'boolean') { keys[k].boolCount++; keys[k].values.add(v) }
      else keys[k].values.add(String(v))
    }
  }
  const axes = Object.values(keys).map((k) => ({
    name: k.name,
    type: k.total > 0 && k.boolCount === k.total ? 'toggle' : 'select',
    values: [...k.values],
  }))
  const selects = axes.filter((a) => a.type === 'select').sort((a, b) => a.name.localeCompare(b.name))
  selects.forEach((a) => a.values.sort(naturalCompare))
  const toggles = axes.filter((a) => a.type === 'toggle').sort((a, b) => a.name.localeCompare(b.name))
  toggles.forEach((a) => { a.values = [false, true] })
  return [...selects, ...toggles]
}

/**
 * Build the default selection for a group: first value of each select axis,
 * false for every toggle.
 */
export function defaultVariantSelection(axes) {
  const sel = {}
  for (const a of axes || []) sel[a.name] = a.type === 'toggle' ? false : a.values[0]
  return sel
}

/**
 * Resolve a selection to the single matching row, or null if that exact
 * combination doesn't exist as a stocked row.
 * @param {{rows: Array, axes: Array}} group
 * @param {Object} sel  axisName -> chosen value
 */
export function resolveVariant(group, sel) {
  if (!group?.rows?.length) return null
  const axes = group.axes || deriveVariantAxes(group.rows)
  return group.rows.find((r) => {
    const opts = r?.variant_options || {}
    return axes.every((a) => {
      if (a.type === 'toggle') return !!opts[a.name] === !!sel[a.name]
      return String(opts[a.name]) === String(sel[a.name])
    })
  }) || null
}

/** Min/max unit_price across a group's rows, for the tile's price range. */
export function variantPriceRange(rows) {
  const prices = (rows || []).map((r) => Number(r.unit_price) || 0).filter((n) => n > 0)
  if (!prices.length) return null
  return { min: Math.min(...prices), max: Math.max(...prices) }
}
