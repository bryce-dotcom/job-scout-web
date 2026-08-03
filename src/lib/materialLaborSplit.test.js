import { describe, it, expect } from 'vitest'
import { resolveMatLabSplit, computeMaterialLaborSplit } from './materialLaborSplit'

// ─────────────────────────────────────────────────────────────────────────
// The one entry point for "what Parts/Labor numbers does this invoice show?"
// Every renderer (invoice box, PDF totals, customer portal via the edge
// function) goes through it, so a drift here disagrees across surfaces —
// which is exactly how it failed before. The source records two real
// incidents, both reported by Alayda; both are locked below.
// ─────────────────────────────────────────────────────────────────────────

const PRODUCTS = [
  { id: 1, cost: 60, material_or_labor: 'material' },
  { id: 2, cost: 40, material_or_labor: 'labor' },
  { id: 3, cost: 50, material_or_labor: null },      // unclassified
  { id: 10, cost: 0, material_or_labor: null },      // bundle parent
]
// Bundle 10 = product 1 (material, $60) + product 2 (labor, $40)
const COMPONENTS = [
  { parent_product_id: 10, component_product_id: 1, quantity: 1 },
  { parent_product_id: 10, component_product_id: 2, quantity: 1 },
]

describe('a manual override wins everywhere', () => {
  const lines = [{ item_id: 1, line_total: 1000 }]

  it('uses the typed Parts/Labor instead of the computed split', () => {
    // INV-MQ8C2T1X: Alayda typed Parts/Labor and the box kept showing the
    // computed 70/30 numbers.
    const r = resolveMatLabSplit(
      { parts_total_override: 800, labor_total_override: 200 }, lines, COMPONENTS, PRODUCTS,
    )
    expect(r.materials).toBe(800)
    expect(r.labor).toBe(200)
    expect(r.source).toBe('manual')
  })

  it('reports the manual total as the sum of what was typed', () => {
    const r = resolveMatLabSplit({ parts_total_override: 800, labor_total_override: 200 }, lines, COMPONENTS, PRODUCTS)
    expect(r.total).toBe(1000)
  })

  it('honours a deliberate zero on one side', () => {
    // All-labor work: 0 must not be mistaken for "not set".
    const r = resolveMatLabSplit({ parts_total_override: 0, labor_total_override: 1000 }, lines, COMPONENTS, PRODUCTS)
    expect(r.source).toBe('manual')
    expect(r.materials).toBe(0)
    expect(r.labor).toBe(1000)
  })

  it('falls back to computed when only ONE side was filled in', () => {
    const r = resolveMatLabSplit({ parts_total_override: 800 }, lines, COMPONENTS, PRODUCTS)
    expect(r.source).toBe('computed')
  })

  it('computes when no override exists at all', () => {
    expect(resolveMatLabSplit({}, lines, COMPONENTS, PRODUCTS).source).toBe('computed')
    expect(resolveMatLabSplit(null, lines, COMPONENTS, PRODUCTS).source).toBe('computed')
  })
})

describe('materials + labor always equals the total', () => {
  it('reconciles exactly on the half-cent case that drifted', () => {
    // INV-MQ8CSSU5: rounding both halves independently gave 3,873.16 on a
    // 3,873.15 invoice. Labor is derived by subtraction to prevent it.
    const r = computeMaterialLaborSplit([{ item_id: 3, line_total: 3873.15 }], COMPONENTS, PRODUCTS)
    expect(r.materials + r.labor).toBeCloseTo(3873.15, 2)
    expect(r.total).toBeCloseTo(3873.15, 2)
  })

  it('reconciles across many awkward amounts', () => {
    for (const amt of [0.01, 33.33, 99.99, 1234.56, 2711.205, 10000.005]) {
      const r = computeMaterialLaborSplit([{ item_id: 3, line_total: amt }], COMPONENTS, PRODUCTS)
      expect(r.materials + r.labor).toBeCloseTo(r.total, 2)
    }
  })

  it('never produces negative labor', () => {
    const r = computeMaterialLaborSplit([{ item_id: 1, line_total: 500 }], COMPONENTS, PRODUCTS)
    expect(r.labor).toBeGreaterThanOrEqual(0)
  })
})

describe('classifying a line', () => {
  it('puts an all-material product entirely in materials', () => {
    const r = computeMaterialLaborSplit([{ item_id: 1, line_total: 500 }], COMPONENTS, PRODUCTS)
    expect(r.materials).toBe(500)
    expect(r.labor).toBe(0)
    expect(r.fallbackLineCount).toBe(0)
  })

  it('puts an all-labor product entirely in labor', () => {
    const r = computeMaterialLaborSplit([{ item_id: 2, line_total: 500 }], COMPONENTS, PRODUCTS)
    expect(r.labor).toBe(500)
    expect(r.materials).toBe(0)
  })

  it('splits a bundle by its component costs, covering markup proportionally', () => {
    // Bundle costs $100 (60 material / 40 labor) but sells for $1,000.
    // The 60/40 cost ratio applies to the selling price.
    const r = computeMaterialLaborSplit([{ item_id: 10, line_total: 1000 }], COMPONENTS, PRODUCTS)
    expect(r.materials).toBeCloseTo(600, 2)
    expect(r.labor).toBeCloseTo(400, 2)
    expect(r.fallbackLineCount).toBe(0)
  })
})

describe('the 70/30 fallback', () => {
  it('applies when the product is not classified', () => {
    const r = computeMaterialLaborSplit([{ item_id: 3, line_total: 1000 }], COMPONENTS, PRODUCTS)
    expect(r.materials).toBeCloseTo(700, 2)
    expect(r.labor).toBeCloseTo(300, 2)
    expect(r.fallbackLineCount).toBe(1)
  })

  it('applies when the line has no product at all', () => {
    const r = computeMaterialLaborSplit([{ line_total: 1000 }], COMPONENTS, PRODUCTS)
    expect(r.materials).toBeCloseTo(700, 2)
    expect(r.fallbackLineCount).toBe(1)
  })

  it('applies when the product id matches nothing', () => {
    const r = computeMaterialLaborSplit([{ item_id: 999, line_total: 1000 }], COMPONENTS, PRODUCTS)
    expect(r.fallbackLineCount).toBe(1)
  })

  it('counts fallbacks per line so the UI can flag partial confidence', () => {
    const r = computeMaterialLaborSplit(
      [{ item_id: 1, line_total: 500 }, { item_id: 3, line_total: 500 }], COMPONENTS, PRODUCTS,
    )
    expect(r.fallbackLineCount).toBe(1)
    expect(r.totalLineCount).toBe(2)
  })

  it('mixes classified and fallback lines without losing money', () => {
    const r = computeMaterialLaborSplit(
      [{ item_id: 1, line_total: 500 }, { item_id: 3, line_total: 500 }], COMPONENTS, PRODUCTS,
    )
    expect(r.total).toBeCloseTo(1000, 2)
    expect(r.materials + r.labor).toBeCloseTo(1000, 2)
  })
})

describe('empty and junk input', () => {
  it('returns zeroes rather than NaN for no lines', () => {
    const r = computeMaterialLaborSplit([], [], [])
    expect(r).toMatchObject({ materials: 0, labor: 0, total: 0, totalLineCount: 0 })
  })

  it('survives null inputs', () => {
    expect(() => computeMaterialLaborSplit(null, null, null)).not.toThrow()
    expect(computeMaterialLaborSplit(null, null, null).total).toBe(0)
  })

  it('skips zero-value lines without counting them as fallbacks', () => {
    const r = computeMaterialLaborSplit(
      [{ item_id: 3, line_total: 0 }, { item_id: 1, line_total: 100 }], COMPONENTS, PRODUCTS,
    )
    expect(r.fallbackLineCount).toBe(0)
    expect(r.total).toBeCloseTo(100, 2)
  })
})
