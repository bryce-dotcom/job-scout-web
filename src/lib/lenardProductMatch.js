// Matching an existing fixture to its replacement product — one definition.
//
// Lenard used to score candidates by looking for category keywords inside the
// product NAME. That is guesswork over a string the tenant never wrote for this
// purpose, and it is why a rep would be offered a 2ft highbay for an 8ft strip.
//
// The price book already holds the answer. Every product belongs to a
// product_group the tenant curated — "SMBE Highbays", "SMBE Wraps",
// "SMBE Panels", "SMBE Vapor Tight", "SMBE Wallpack". Those groups ARE the
// fixture families, so matching against the group name uses the tenant's own
// organisation instead of second-guessing it. The name check stays as a
// fallback for products that sit outside any group.
//
// Comparison is done on letters and digits only, so "SMBE Wallpack" matches the
// keyword "wall pack" and "SMBE Highbays" matches "high bay". Without that,
// the single most common exterior family silently scored zero.

/** Lighting vocabulary per fixture category. Matched against group, then name. */
export const PRODUCT_CATEGORY_KEYWORDS = {
  'Recessed': ['troffer', 'panel', 'recessed', '2x4', '2x2', '1x4', 'flat panel', 'lay-in', 'downlight'],
  'Linear': ['strip', 'linear', 'wrap', 'shop light', 'vapor', 'channel'],
  'High Bay': ['high bay', 'highbay', 'high-bay', 'ufo', 'warehouse'],
  'Low Bay': ['low bay', 'lowbay', 'high bay', 'highbay'],
  'Outdoor': ['flood', 'wall pack', 'exterior', 'outdoor', 'area light', 'pole', 'parking', 'canopy', 'shoe box', 'shoebox', 'cobra'],
  'Wall Pack': ['wall pack', 'wallpack', 'exterior'],
  'Flood': ['flood', 'exterior'],
  'Area Light': ['area light', 'cobra', 'shoe box', 'shoebox', 'pole', 'parking'],
  'Canopy': ['canopy', 'exterior'],
  'Surface Mount': ['surface', 'flush', 'ceiling mount', 'drum', 'round', 'wrap'],
}

/** Letters and digits only, lowercased — so "wall pack" == "Wallpack". */
const squash = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

const matchesAny = (haystack, keywords) => {
  const h = squash(haystack)
  if (!h) return false
  return keywords.some((kw) => h.includes(squash(kw)))
}

/** A product is sellable only if the price book gives it a price. */
export function productIsSellable(product) {
  const p = Number(product?.unit_price)
  return Number.isFinite(p) && p > 0
}

/**
 * Every wattage a product name offers.
 *
 * Most of this catalogue is field-selectable: "SMBE 90/110/130/150/165W
 * Highbay" is ONE fixture you set to any of five wattages. Reading a single
 * number out of that misjudges the fit badly — a plain /(\d+)\s*[wW]/ matches
 * only where a W actually follows, so it returned 165 and made a 95W target
 * look 70W away, losing to a 50/60/70W unit that physically cannot reach 95.
 */
export function productWattages(name) {
  const out = []
  const re = /(\d+(?:\s*\/\s*\d+)*)\s*[wW]\b/g
  let m
  while ((m = re.exec(String(name || '')))) {
    for (const part of m[1].split('/')) {
      const n = parseInt(part.trim(), 10)
      if (Number.isFinite(n) && n > 0) out.push(n)
    }
  }
  return out
}

/**
 * Score one candidate.
 *
 * The tenant's group is worth more than the product name, because the tenant
 * put the product in it deliberately. Wattage proximity then orders the
 * family — a 110W target should land on the 110W member, not the 165W one.
 */
export function scoreProductMatch(product, fixtureCategory, targetWatts, groupNameById) {
  const keywords = PRODUCT_CATEGORY_KEYWORDS[fixtureCategory] || []
  let score = 0

  const groupName = groupNameById?.[product?.group_id] || ''
  if (groupName && matchesAny(groupName, keywords)) {
    score += 200
  } else if (matchesAny(`${product?.name || ''} ${product?.type || ''} ${product?.description || ''}`, keywords)) {
    // No group, or a group that does not name this family — fall back to the
    // old behaviour so an ungrouped catalogue still works.
    score += 100
  }

  if (targetWatts > 0) {
    const watts = productWattages(product?.name)
    if (watts.length) {
      const closest = Math.min(...watts.map((w) => Math.abs(w - targetWatts)))
      score += Math.max(0, 50 - closest)
    }
  }
  return score
}

/** All candidates, best first. */
export function getMatchedProducts(allProducts, fixtureCategory, targetWatts, groupNameById) {
  if (!allProducts?.length) return []
  return [...allProducts]
    .map((p) => ({ ...p, _score: scoreProductMatch(p, fixtureCategory, targetWatts, groupNameById) }))
    .sort((a, b) => b._score - a._score)
}

/**
 * The product to auto-select, or null to leave the line for the rep.
 *
 * Requires a real category match AND a price. Auto-selecting an unpriced
 * product puts a $0 line in front of a customer, and the tenant's catalogue
 * does contain a few (a tube with no price, a relocate/lift bundle).
 */
export function findBestProduct(allProducts, fixtureCategory, targetWatts, groupNameById) {
  const ranked = getMatchedProducts(allProducts, fixtureCategory, targetWatts, groupNameById)
  const best = ranked.find((p) => p._score >= 100 && productIsSellable(p))
  return best || null
}

/** id -> group name, from the groups the products feed returns alongside them. */
export function groupNameMap(groups) {
  const map = {}
  for (const g of groups || []) {
    if (g?.id != null) map[g.id] = String(g.name || '').trim()
  }
  return map
}
