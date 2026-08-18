import { describe, it, expect } from 'vitest'
import { TAX_YEAR, taxTablesStale } from './payrollTax'

// Bryce: "payroll taxes dont match gusto's". The formula is Pub 15-T's Annual
// Percentage Method — the same one Gusto uses — so the arithmetic is not the
// problem. The tables are last year's, and nothing said so.

describe('stale tax tables announce themselves', () => {
  it('is silent while the tables are current', () => {
    expect(taxTablesStale(new Date(TAX_YEAR, 5, 1))).toBe(null)
    expect(taxTablesStale(new Date(TAX_YEAR - 1, 5, 1))).toBe(null)
  })

  it('reports the gap once the year has moved on', () => {
    const s = taxTablesStale(new Date(TAX_YEAR + 1, 0, 2))
    expect(s).not.toBe(null)
    expect(s.yearsBehind).toBe(1)
    expect(s.message).toMatch(/tax tables are/i)
  })

  it('counts multiple years behind', () => {
    expect(taxTablesStale(new Date(TAX_YEAR + 3, 0, 1)).yearsBehind).toBe(3)
  })

  it('says FICA should still agree, so the reader knows where to look', () => {
    expect(taxTablesStale(new Date(TAX_YEAR + 1, 0, 1)).message).toMatch(/FICA/)
  })
})
