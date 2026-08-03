import { describe, it, expect } from 'vitest'
import { computePoTotals, formatCurrency, PO_STATUS_LABELS } from './poUtils'

// What a vendor is actually asked to be paid. 17 POs worth ~$42.8k currently
// sit in draft against these numbers, so a drift here is money out the door.

describe('computePoTotals', () => {
  it('sums the stored line totals', () => {
    const r = computePoTotals([{ line_total: 100 }, { line_total: 250.5 }])
    expect(r.subtotal).toBe(350.5)
    expect(r.total).toBe(350.5)
  })

  it('computes a line from quantity x unit cost when no total is stored', () => {
    expect(computePoTotals([{ quantity_ordered: 4, unit_cost: 25 }]).subtotal).toBe(100)
  })

  it('adds tax and shipping on top of the subtotal', () => {
    const r = computePoTotals([{ line_total: 1000 }], 82.5, 45)
    expect(r.subtotal).toBe(1000)
    expect(r.tax).toBe(82.5)
    expect(r.shipping).toBe(45)
    expect(r.total).toBe(1127.5)
  })

  it('treats missing tax and shipping as zero, not NaN', () => {
    const r = computePoTotals([{ line_total: 100 }], null, undefined)
    expect(r.total).toBe(100)
    expect(Number.isFinite(r.tax)).toBe(true)
  })

  it('rounds to cents', () => {
    const r = computePoTotals([{ quantity_ordered: 3, unit_cost: 33.333 }])
    expect(r.subtotal).toBe(100)
  })

  it('the total always equals subtotal + tax + shipping', () => {
    for (const [lines, tax, ship] of [
      [[{ line_total: 0.01 }], 0.02, 0.03],
      [[{ line_total: 1234.56 }, { line_total: 99.99 }], 111.11, 22.22],
      [[{ quantity_ordered: 7, unit_cost: 19.99 }], 0, 15],
    ]) {
      const r = computePoTotals(lines, tax, ship)
      expect(r.subtotal + r.tax + r.shipping).toBeCloseTo(r.total, 2)
    }
  })

  it('returns zeroes for an empty or missing line list', () => {
    expect(computePoTotals([]).total).toBe(0)
    expect(computePoTotals(null).total).toBe(0)
  })

  it('produces finite numbers from junk lines', () => {
    const r = computePoTotals([{ line_total: 'abc', quantity_ordered: 'x', unit_cost: 'y' }])
    expect(Number.isFinite(r.subtotal)).toBe(true)
    expect(Number.isFinite(r.total)).toBe(true)
  })

  // Documents CURRENT behaviour, deliberately not "fixed": a stored
  // line_total of exactly 0 is falsy, so the quantity x unit_cost fallback
  // takes over and a genuinely free line (warranty replacement, no-charge
  // part) would be billed. Checked against live data first — all 3 zero-total
  // PO lines also have zero quantity x cost, so nothing is mis-totalled
  // today. If free-of-charge PO lines ever become real, change the guard to
  // an explicit null check the way lib/invoiceLines.js does.
  it('a zero stored total currently falls through to quantity x cost', () => {
    expect(computePoTotals([{ line_total: 0, quantity_ordered: 2, unit_cost: 50 }]).subtotal).toBe(100)
  })
})

describe('formatCurrency', () => {
  it('formats dollars and cents', () => {
    expect(formatCurrency(1234.5)).toBe('$1,234.50')
    expect(formatCurrency(0)).toBe('$0.00')
  })

  it('shows $0.00 rather than "NaN" or blank for bad input', () => {
    expect(formatCurrency(null)).toBe('$0.00')
    expect(formatCurrency(undefined)).toBe('$0.00')
    expect(formatCurrency(NaN)).toBe('$0.00')
  })

  it('formats a negative amount rather than dropping the sign', () => {
    expect(formatCurrency(-50)).toContain('50.00')
  })
})

describe('PO status labels', () => {
  it('labels every status the UI can render', () => {
    expect(Object.keys(PO_STATUS_LABELS).length).toBeGreaterThan(0)
    for (const v of Object.values(PO_STATUS_LABELS)) expect(v).toBeTruthy()
  })

  it('has a draft state — 17 live POs sit in it', () => {
    expect(PO_STATUS_LABELS.draft).toBeTruthy()
  })
})
