// Matching glass work to the product the tenant already sells — one definition.
//
// Walter's first engine computed prices from rates: an invented crew rate, an
// invented minutes-per-pane, an access multiplier, a condition multiplier. It
// was a parallel pricing system competing with a price book that already knew
// better. HHH's book prices residential interior panes at $3 and exterior at
// $6; post-construction is its own product at $20, $6 or $4 by size; hard
// water is $2.50; reaching a tenth floor on a lift is $5 a pane rather than a
// 1.7 multiplier. None of that is guessable and all of it was already typed.
//
// So Walter works the way Lenard does: a takeoff observes WHAT IS THERE, picks
// the product the tenant sells for it, and the line is quantity times that
// product's price. The engine stops setting prices and goes back to doing what
// lightingSavings does — justifying them.
//
// Matching is on the tenant's own product_groups first, exactly as
// lenardProductMatch does and for the same reason: "Commercial Windows" and
// "Residential Windows" are the families the tenant curated, and scoring
// keywords against a product NAME is guesswork over a string nobody wrote for
// this purpose.

/** The vocabulary of glass work, matched against group, then type, then name. */
export const GLASS_WORK_KEYWORDS = {
  interior:          ['interior window', 'inside window', 'interior glass'],
  exterior:          ['exterior window', 'outside window', 'store front', 'storefront', 'exterior glass'],
  post_construction: ['post construction', 'post-construction', 'construction clean'],
  hard_water:        ['hard water', 'mineral', 'stain removal'],
  screens:           ['screen cleaning', 'screen sterilis', 'screen steriliz'],
  screen_repair:     ['screen repair', 'screen replacement'],
  partition:         ['partition glass', 'partition'],
  window_well:       ['window well'],
  mirror:            ['mirror'],
  // A FAMILY probe — "does this tenant do restoration at all?" — not a
  // pricing key. It matches every severity, so asking it for one product
  // returns whichever sorts first, which is arbitrary. Price from the
  // severity keys below; use this one to ask whether the trade exists here.
  restoration:       ['glass restoration', 'scratch', 'resurfac'],
  // Severity is a different PRODUCT, not a modifier on one. A deep mark near
  // an edge is roughly two and a half times the work of a light one, so a
  // single "restoration" rate under-prices an all-L2 register and overprices
  // an all-L1 one. Deliberately matched on the words rather than on "L1"/"L2"
  // — those are two characters and would collide with half the price book.
  restoration_light: ['light abrasion'],
  restoration_deep:  ['deep or edge', 'deep abrasion'],
  optical_finish:    ['optical finishing', 'final polish'],
}

/**
 * Groups that hold glass work at all, so a matcher never wanders into lighting.
 *
 * NOT 'pane'. Comparison is on letters and digits, so "pane" is inside
 * "SMBE Panels" — and against HHH's real book that single keyword admitted 63
 * lighting products to the glass list. A fixture of eighteen products never
 * showed it; eight hundred did. 'window' and 'glass' carry the domain, and the
 * work keywords below do the actual choosing.
 */
export const GLASS_GROUP_KEYWORDS = ['window', 'glass']

/** Letters and digits only, lowercased — so "Store Front" == "storefront". */
const squash = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

const matchesAny = (haystack, keywords) => {
  const h = squash(haystack)
  if (!h) return false
  return keywords.some((kw) => h.includes(squash(kw)))
}

/**
 * A recurring-plan price, not a one-off one.
 *
 * HHH prices every cleaning product twice: "Residential Exterior Windows" at
 * $6 a pane and "Residential Exterior Windows (Subscription)" at $0.17. The
 * second is a monthly membership rate, and there is NO column that says so —
 * pricing_model is null on all of them, and `type` is identical. The only
 * signal is the word in the name.
 *
 * Which makes this the most expensive mistake available to a matcher: picking
 * the subscription product for a one-off bid charges 3% of the job.
 */
export function isSubscriptionProduct(product) {
  return /\(\s*subscription\s*\)|\bsubscription\b/i.test(String(product?.name || ''))
}

/** A product is sellable only if the price book gives it a price. */
export function productIsSellable(product) {
  const p = Number(product?.unit_price)
  return Number.isFinite(p) && p > 0
}

/**
 * Candidate products for a kind of glass work, best first.
 *
 * `groups` is the tenant's product_groups rows ({ id, name }); a product's
 * group name is the strongest signal it belongs to this trade at all.
 *
 * `recurring` picks the membership price instead of the one-off one. It is an
 * explicit argument rather than a guess, because the only difference between
 * a $6 pane and a $0.17 pane is which question is being asked.
 */
export function matchGlassProducts(products, { work, segment, groups = [], recurring = false, activeOnly = true } = {}) {
  const groupName = new Map((groups || []).map((g) => [g.id, g.name]))
  // A work this file does not know is not a licence to offer everything. Only
  // an absent `work` means "any glass product"; an unrecognised one means the
  // book has nothing for it, which is what missingGlassWork is asking.
  if (work != null && !GLASS_WORK_KEYWORDS[work]) return []
  const keywords = work == null ? [] : GLASS_WORK_KEYWORDS[work]
  const scored = []

  for (const p of products || []) {
    if (activeOnly && p?.active === false) continue
    if (!productIsSellable(p)) continue
    if (isSubscriptionProduct(p) !== !!recurring) continue

    const gname = groupName.get(p?.group_id) || ''
    const inGlassGroup = matchesAny(gname, GLASS_GROUP_KEYWORDS)
    const typeIsGlass = matchesAny(p?.type, GLASS_GROUP_KEYWORDS)
    if (!inGlassGroup && !typeIsGlass) continue

    // Residential and commercial are different products at different prices —
    // $6 a pane against $4 — and "exterior" alone cannot choose between them.
    // The takeoff knows whether it is standing at a house or a storefront, so
    // it says. A product the tenant never segmented stays eligible for both.
    if (segment) {
      const hay = `${gname} ${p?.name || ''} ${p?.type || ''}`
      const other = segment === 'residential' ? 'commercial' : 'residential'
      if (matchesAny(hay, [other]) && !matchesAny(hay, [segment])) continue
    }

    // Only a WORK keyword qualifies a product. Being in a glass-ish group or
    // matching the segment are tie-breakers for things already qualified, and
    // must never admit something on their own — that is how a lighting panel
    // got into a window list on nothing but its group name.
    let workScore = 0
    if (matchesAny(p?.name, keywords)) workScore += 10
    if (matchesAny(gname, keywords)) workScore += 4
    if (matchesAny(p?.type, keywords)) workScore += 2
    if (keywords.length && workScore === 0) continue

    let score = workScore
    if (inGlassGroup) score += 1
    if (segment && matchesAny(`${gname} ${p?.name || ''}`, [segment])) score += 3
    scored.push({ product: p, score, group: gname })
  }

  // Score, then NAME — never price. Breaking a tie by the cheaper product is a
  // silent discount, and on a genuine tie the person should choose rather than
  // have the engine quietly pick the smaller number.
  scored.sort((a, b) => b.score - a.score || String(a.product.name).localeCompare(String(b.product.name)))
  return scored
}

/** The single best product for a kind of work, or null when the book has none. */
export function bestGlassProduct(products, opts) {
  return matchGlassProducts(products, opts)[0]?.product || null
}

/**
 * Work the tenant has no product for.
 *
 * Returned rather than invented. HHH sells "Shower Glass Restoration" at $15
 * and nothing at all for architectural glass by damage zone, so a restoration
 * bid there has nothing to price against — and the honest answer is to say so
 * and have somebody add the product, not to fall back on a rate this file
 * exists to stop using.
 */
export function missingGlassWork(products, works, opts = {}) {
  return (works || []).filter((w) => !bestGlassProduct(products, { ...opts, work: w }))
}
