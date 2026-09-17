// Inventory as Books sees it.
//
// Stock lives in `inventory` (quantity per product, no cost column) and
// cost lives on `products_services.cost`. Consumption is recorded on
// job_lines.consumed_qty when a crew uses parts (JobPartsTab), with no
// cost captured at that moment. So:
//   • stock value at cost   = Σ inventory.quantity × product.cost
//   • COGS for a period     = Σ job_lines.consumed_qty × product.cost,
//                             dated by the line's last update (the consume)
// The Inventory page values stock at SELL price; that number is what you
// could bill for it, not what it cost — both are shown so nobody confuses them.

const num = (v) => parseFloat(v) || 0
const r2 = (n) => Math.round(n * 100) / 100

export function inventoryValue({ inventory = [], products = [] } = {}) {
  const byId = new Map((products || []).map(p => [p.id, p]))
  let atCost = 0, atPrice = 0, items = 0, lowStock = 0, uncosted = 0
  for (const it of inventory || []) {
    const qty = num(it.quantity)
    const p = it.product_id ? byId.get(it.product_id) : null
    if (qty <= 0) continue
    items += 1
    const cost = num(p?.cost)
    if (!(cost > 0)) uncosted += 1
    atCost += qty * cost
    atPrice += qty * num(p?.unit_price)
    if (num(it.min_quantity) > 0 && qty <= num(it.min_quantity)) lowStock += 1
  }
  return { atCost: r2(atCost), atPrice: r2(atPrice), items, lowStock, uncosted }
}

export function cogsForPeriod({ jobLines = [], products = [] } = {}, inRange = () => true) {
  const byId = new Map((products || []).map(p => [p.id, p]))
  let total = 0, lines = 0, uncosted = 0
  const byJob = new Map()
  for (const l of jobLines || []) {
    const qty = num(l.consumed_qty)
    if (!(qty > 0) || !inRange(l.updated_at || l.created_at)) continue
    const cost = num(byId.get(l.item_id)?.cost)
    if (!(cost > 0)) { uncosted += 1; continue }
    const amt = qty * cost
    total += amt; lines += 1
    if (l.job_id) byJob.set(l.job_id, (byJob.get(l.job_id) || 0) + amt)
  }
  return { total: r2(total), lines, uncosted, byJob }
}
