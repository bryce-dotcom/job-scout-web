import { describe, it, expect } from 'vitest'
import { inventoryValue, cogsForPeriod } from './inventoryBooks'

const products = [{ id: 1, cost: 40, unit_price: 100 }, { id: 2, cost: 0, unit_price: 25 }, { id: 3, cost: 10, unit_price: 30 }]

describe('inventoryValue', () => {
  it('values stock at cost and at price, flags low stock and uncosted items', () => {
    const v = inventoryValue({ products, inventory: [
      { product_id: 1, quantity: 10, min_quantity: 12 },   // low
      { product_id: 2, quantity: 4 },                       // no cost on the product
      { product_id: 3, quantity: 0 },                       // nothing on hand
      { product_id: 99, quantity: 2 },                      // unknown product
    ] })
    expect(v).toEqual({ atCost: 400, atPrice: 1100, items: 3, lowStock: 1, uncosted: 2 })
  })
})

describe('cogsForPeriod', () => {
  it('costs consumed quantities in the window by product cost', () => {
    const inSep = (d) => String(d || '').startsWith('2026-09')
    const c = cogsForPeriod({ products, jobLines: [
      { job_id: 7, item_id: 1, consumed_qty: 3, updated_at: '2026-09-10T10:00:00Z' },
      { job_id: 7, item_id: 3, consumed_qty: 2, updated_at: '2026-09-11T10:00:00Z' },
      { job_id: 8, item_id: 2, consumed_qty: 5, updated_at: '2026-09-12T10:00:00Z' }, // uncosted
      { job_id: 9, item_id: 1, consumed_qty: 1, updated_at: '2026-08-12T10:00:00Z' }, // last month
      { job_id: 9, item_id: 1, consumed_qty: 0, updated_at: '2026-09-12T10:00:00Z' }, // nothing consumed
    ] }, inSep)
    expect(c.total).toBe(140)
    expect(c.lines).toBe(2)
    expect(c.uncosted).toBe(1)
    expect(c.byJob.get(7)).toBe(140)
  })
})
