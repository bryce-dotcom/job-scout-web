// Upsell catalogue — server mirror of src/lib/upsells.js.
//
// The proposal's Good/Better/Best prices used to be INVENTED by the model: the
// prompt said `<good price + warranty & value-add cost>`. Customers were
// choosing between packages at numbers nobody in the company had set.
//
// Prices are computed here from the tenant's catalogue and then written OVER
// whatever the model returned. The model is good at naming a package and
// describing it; it must not be the source of a price.

export type Upsell = {
  name: string
  tier: 'better' | 'best'
  price: number
  price_type: 'flat' | 'percent'
  description?: string
  active?: boolean
}

const num = (v: unknown) => {
  const n = parseFloat(String(v))
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function normalizeUpsells(raw: unknown): Upsell[] {
  const list = Array.isArray(raw) ? raw : []
  return list.map((item: any) => {
    if (typeof item === 'string') {
      const name = item.trim()
      return name ? { name, tier: 'better' as const, price: 0, price_type: 'flat' as const, active: true } : null
    }
    if (!item || typeof item !== 'object') return null
    const name = String(item.name || '').trim()
    if (!name) return null
    return {
      name,
      tier: item.tier === 'best' ? ('best' as const) : ('better' as const),
      price: num(item.price),
      price_type: item.price_type === 'percent' ? ('percent' as const) : ('flat' as const),
      description: String(item.description || '').slice(0, 200),
      active: item.active !== false,
    }
  }).filter(Boolean) as Upsell[]
}

/**
 * Good is the estimate as quoted; Better adds its items; Best adds everything.
 *
 * Percent items are taken off the BASE project, never the running package
 * total — otherwise a percentage item silently charges a percentage of the
 * other upsells, and the same item costs different amounts depending on the
 * order the catalogue happens to be in.
 */
export function buildTiers(basePrice: number, incentive: number, upsells: Upsell[]) {
  const items = upsells.filter((u) => u.active !== false)
  const base = num(basePrice)
  const inc = num(incentive)
  const r2 = (n: number) => Math.round(n * 100) / 100

  const amountOf = (u: Upsell) => u.price_type === 'percent' ? r2(base * (u.price / 100)) : u.price
  const sum = (list: Upsell[]) => r2(list.reduce((s, u) => s + amountOf(u), 0))

  const better = items.filter((u) => u.tier === 'better')
  const best = items.filter((u) => u.tier === 'best')
  const betterPrice = r2(base + sum(better))
  const bestPrice = r2(betterPrice + sum(best))
  const net = (p: number) => r2(Math.max(0, p - inc))

  return [
    { id: 'good', price: r2(base), net_price: net(base), features: [] as string[] },
    { id: 'better', price: betterPrice, net_price: net(betterPrice), features: better.map((u) => u.name) },
    { id: 'best', price: bestPrice, net_price: net(bestPrice), features: best.map((u) => u.name) },
  ]
}

// ---------------------------------------------------------------------------
// Where an upsell is allowed to come from.
//
// The Good/Better/Best packages were built from settings.upsells — a
// hand-typed JSON blob that drifted away from the price book and then stayed
// there. For company 3 it listed eight items, every one priced $0, including
// "Commissioning", which does not exist in the catalogue at all, and an
// "Extended Warranty" whose real products had been archived months earlier.
// Cole reported the result as the packages being "fucked up" and offering work
// the company does not provide.
//
// So the catalogue is the price book, and only the part of it the tenant has
// labelled as an add-on. A product nobody marked sellable as an upsell cannot
// appear on a proposal, and a price nobody set cannot either.
export const UPSELL_CATEGORY = 'Add-On Service'

/** Is this products_services row sellable as an upsell? */
export function isUpsellProduct(p: any): boolean {
  if (!p || p.active === false) return false
  return String(p.product_category || '').trim() === UPSELL_CATEGORY
}

/**
 * The tenant's upsell catalogue, split into Better and Best by the packages
 * they configured in Settings > Good/Better/Best.
 *
 * Returns [] when nothing is configured. That is deliberate: an unconfigured
 * tenant gets no tiers rather than three cards of invented copy.
 */
export function upsellsFromProducts(products: any[], packages: any[]): Upsell[] {
  const byId = new Map<string, any>()
  for (const p of products || []) {
    if (isUpsellProduct(p)) byId.set(String(p.id), p)
  }
  const out: Upsell[] = []
  for (const pkg of packages || []) {
    const tier = pkg?.id === 'best' ? 'best' : pkg?.id === 'better' ? 'better' : null
    if (!tier) continue // 'good' is the estimate as quoted; it adds nothing
    for (const id of pkg.addonIds || []) {
      const p = byId.get(String(id))
      if (!p) continue // archived, deleted, or no longer labelled an upsell
      out.push({
        name: String(p.name || '').trim(),
        tier,
        price: num(p.unit_price),
        price_type: 'flat',
        description: String(p.description || '').slice(0, 200),
        active: true,
      })
    }
  }
  return out.filter((u) => u.name)
}
