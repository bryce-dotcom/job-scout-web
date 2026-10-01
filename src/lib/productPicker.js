// Which category a product or service belongs to, for the picker's filter chips.
//
// The rule used to be "read product_groups.service_type via the row's
// group_id", full stop. A row with no group therefore had no category at all:
// no chip of its own, and excluded by EVERY chip filter, because the filter
// compared against a value that was always null. The only way to reach one was
// to already know its name and type it into the search box.
//
// On HHH that stranded 12 live rows — everything under Google, LABOR Energy
// Scout, Custom Services, Energy Efficiency and Incentives — which is
// Christopher asking "where did the option to add a specific service go"
// (eede9f95, 2026-07-15). The option had not gone anywhere; those rows had no
// way of being shown.
//
// Categories also compare case-insensitively. HHH carries both 'Service' and
// 'service' as separate values, and they are plainly one category: as two
// chips, whichever you picked hid most of what you were looking for.

/** Are these two category names the same thing? Case and padding ignored. */
export function sameType(a, b) {
  return String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase()
}

/** Map of product_group id -> its service_type. */
export function groupServiceIndex(productGroups = []) {
  const m = {}
  for (const g of productGroups || []) if (g && g.id != null) m[g.id] = g.service_type
  return m
}

/** The category for one row: its group's service type, else its own `type`. */
export function serviceTypeOf(product, groupServiceById = {}) {
  return groupServiceById[product?.group_id] || product?.type || null
}

/**
 * How many rows sit under each category, keyed by the spelling the chip shows.
 * Variant spellings are folded together, and the first spelling seen wins the
 * label, so 'Service' and 'service' are one chip with one total.
 */
export function serviceTypeCounts(products = [], groupServiceById = {}) {
  const counts = {}
  const label = {}
  for (const p of products || []) {
    const t = serviceTypeOf(p, groupServiceById)
    if (!t) continue
    const key = String(t).trim().toLowerCase()
    if (!label[key]) label[key] = t
    counts[label[key]] = (counts[label[key]] || 0) + 1
  }
  return counts
}

/**
 * The chips to offer, in order: the company's configured service types first,
 * then any on a product group, then any that live only on the rows themselves
 * — because a row with no group still belongs to a category someone can click.
 */
export function chipTypes({ serviceTypes = [], productGroups = [], products = [] } = {}) {
  const seen = new Set()
  const out = []
  const add = (t) => {
    if (!t) return
    const key = String(t).trim().toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    out.push(t)
  }
  for (const t of serviceTypes || []) add(t)
  for (const g of productGroups || []) add(g?.service_type)
  for (const p of products || []) add(p?.type)
  return out
}
