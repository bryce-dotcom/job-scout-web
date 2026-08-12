// The upsell catalogue.
//
// These were seven strings hardcoded inside the proposal-generation PROMPT:
//
//   "features": ["everything in Good", "2-Year Extended Warranty",
//                "Old Fixture Recycling & Disposal", "Priority Scheduling"]
//
// which meant the sales manager could not add, remove or rename an upsell
// without a developer editing an edge function and redeploying it. Cole asking
// to rename one is what surfaced it.
//
// Worse, the tier PRICES were invented by the model — the prompt literally said
// `<good price + warranty & value-add cost>`. So the packages a customer chose
// between carried numbers nobody had set. Making these real catalogue items
// with real prices is the point of moving them; renaming them is just the
// thing that exposed it.
//
// Stored as the `upsells` setting so Arnie can manage them by conversation,
// alongside business_units / lead_sources / service_types.

export const UPSELL_TIERS = ['better', 'best']

// How an upsell is priced. A warranty at 5% of a $200k job is not the same
// product as 5% of an $8k job, which is exactly what "we adjust according to
// project size" means — so the catalogue carries the RULE, not a number
// somebody re-types per estimate and eventually gets wrong.
export const PRICE_TYPES = ['flat', 'percent']

/** What shipped hardcoded, so nothing is lost when the setting is first seeded. */
export const DEFAULT_UPSELLS = [
  { name: '2-Year Extended Warranty', tier: 'better', price: 0, description: 'Parts and labour covered for a second year.' },
  { name: 'Old Fixture Recycling & Disposal', tier: 'better', price: 0, description: 'We haul away and recycle what we replace.' },
  { name: 'Priority Scheduling', tier: 'better', price: 0, description: 'Your job goes to the front of the queue.' },
  { name: '3-Year Extended Warranty', tier: 'best', price: 0, description: 'Parts and labour covered for three years.' },
  { name: 'Remote Monitoring', tier: 'best', price: 0, description: 'We watch the system and catch faults before you do.' },
  { name: 'Annual Maintenance Check', tier: 'best', price: 0, description: 'A yearly visit to keep everything performing.' },
  { name: 'Emergency Priority Service', tier: 'best', price: 0, description: 'Front of the queue when something goes wrong.' },
]

const num = (v) => {
  const n = parseFloat(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * Normalise whatever is in the setting. Accepts plain strings (a list someone
 * typed quickly) as well as full objects, because Arnie's config engine stores
 * simple lists as strings and forcing a shape on the way in would make the
 * conversational path fail in ways nobody could see.
 */
export function normalizeUpsells(raw) {
  const list = Array.isArray(raw) ? raw : []
  return list.map((item) => {
    if (typeof item === 'string') {
      const name = item.trim()
      return name ? { name, tier: 'better', price: 0, price_type: 'flat', description: '', active: true } : null
    }
    if (!item || typeof item !== 'object') return null
    const name = String(item.name || '').trim()
    if (!name) return null
    return {
      name,
      tier: UPSELL_TIERS.includes(item.tier) ? item.tier : 'better',
      price: num(item.price),
      price_type: PRICE_TYPES.includes(item.price_type) ? item.price_type : 'flat',
      description: String(item.description || '').slice(0, 200),
      active: item.active !== false,
    }
  }).filter(Boolean)
}

/** The catalogue in use — the tenant's list, or what used to be hardcoded. */
export function resolveUpsells(settings) {
  const configured = normalizeUpsells(settings?.upsells)
  return configured.length > 0 ? configured : normalizeUpsells(DEFAULT_UPSELLS)
}

/**
 * Build the three packages from real items at real prices.
 *
 * Good is the estimate as quoted. Better adds the 'better' items; Best adds
 * everything. Prices ADD UP from the catalogue rather than being guessed —
 * a package price the model invented is a number nobody in the company set,
 * on a document a customer chooses from.
 *
 * An item with no price still appears, because "included" is a legitimate
 * upsell; it just contributes nothing to the total.
 *
 * Percent items are taken off the BASE project, not off the running package
 * total — otherwise a percentage warranty would silently charge a percentage
 * of the other upsells too, and the same warranty would cost different amounts
 * depending on what order the catalogue happened to be in.
 */
export function buildTiers({ basePrice = 0, incentive = 0, settings = null } = {}) {
  const items = resolveUpsells(settings).filter(u => u.active)
  const base = num(basePrice)
  const inc = num(incentive)

  const better = items.filter(u => u.tier === 'better')
  const best = items.filter(u => u.tier === 'best')

  const amountOf = (u) => u.price_type === 'percent'
    ? Math.round(base * (u.price / 100) * 100) / 100
    : u.price
  const sum = (list) => Math.round(list.reduce((s, u) => s + amountOf(u), 0) * 100) / 100
  const betterPrice = Math.round((base + sum(better)) * 100) / 100
  const bestPrice = Math.round((betterPrice + sum(best)) * 100) / 100

  const net = (p) => Math.round(Math.max(0, p - inc) * 100) / 100

  return [
    { id: 'good', price: base, net_price: net(base), features: [], items: [] },
    { id: 'better', price: betterPrice, net_price: net(betterPrice), features: better.map(u => u.name), items: better.map(u => ({ ...u, amount: amountOf(u) })) },
    { id: 'best', price: bestPrice, net_price: net(bestPrice), features: best.map(u => u.name), items: best.map(u => ({ ...u, amount: amountOf(u) })) },
  ]
}
