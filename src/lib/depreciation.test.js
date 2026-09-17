import { describe, it, expect } from 'vitest'
import { straightLine, yearExpense, carryingValue, depreciationSchedule, isDepreciable } from './depreciation'

const truck = { id: 1, name: 'TRK-01', purchase_price: 60000, salvage_value: 6000, useful_life_years: 5, in_service_date: '2024-03-15', current_value: 50000 }

describe('straightLine', () => {
  it('spreads cost minus salvage over the life, counting whole months in service', () => {
    const d = straightLine(truck, new Date('2026-09-17'))
    expect(d.monthly).toBe(900)
    expect(d.months).toBe(60)
    expect(d.elapsed).toBe(31)          // Mar 2024 … Sep 2026 inclusive
    expect(d.accumulated).toBe(27900)
    expect(d.bookValue).toBe(32100)
    expect(d.fullyDepreciated).toBe(false)
  })
  it('stops at salvage value once the life is over', () => {
    const d = straightLine(truck, new Date('2031-01-01'))
    expect(d.elapsed).toBe(60)
    expect(d.bookValue).toBe(6000)
    expect(d.fullyDepreciated).toBe(true)
  })
  it('does not depreciate what is not set up, and the typed value stands', () => {
    expect(isDepreciable({ purchase_price: 100 })).toBe(false)
    expect(straightLine({ purchase_price: 100, current_value: 80 })).toBe(null)
    expect(carryingValue({ purchase_price: 100, current_value: 80 })).toBe(80)
    expect(carryingValue(truck, new Date('2026-09-17'))).toBe(32100)
  })
})

describe('yearExpense + schedule', () => {
  it('gives the calendar-year expense, partial in the first year', () => {
    expect(yearExpense(truck, 2024)).toBe(9000)    // Mar–Dec = 10 months
    expect(yearExpense(truck, 2025)).toBe(10800)
    expect(yearExpense(truck, 2029)).toBe(1800)    // Jan–Feb, then done
    expect(yearExpense(truck, 2030)).toBe(0)
  })
  it('builds a schedule with totals', () => {
    const s = depreciationSchedule([truck, { id: 2, name: 'Ladder', purchase_price: 500, current_value: 500 }], 2026)
    expect(s.rows).toHaveLength(1)
    expect(s.totalYearExpense).toBe(10800)
    expect(s.rows[0].bookValue).toBe(60000 - 900 * 34)
  })
})
