import { describe, it, expect } from 'vitest'
import { calendarDay, monthlyTrend } from './reports.js'

// Run in Denver: `TZ=America/Denver npx vitest run src/lib/calendarDay.test.js`.
// The suite's default zone is whatever the machine has; the assertions below
// hold in any zone west of Greenwich, which is where the bug lived.

describe('the calendar day a stored value means', () => {
  it('a date column and a timestamptz holding a date are that day, not the evening before', () => {
    expect(calendarDay('2026-09-01')).toBe('2026-09-01')
    expect(calendarDay('2026-09-01 00:00:00+00')).toBe('2026-09-01')     // what the Expenses page writes
    expect(calendarDay('2026-09-01T00:00:00Z')).toBe('2026-09-01')
    expect(calendarDay('2026-09-01T00:00:00.000+00:00')).toBe('2026-09-01')
  })
  it('a real instant keeps its local day', () => {
    const local = new Date(2026, 8, 15, 23, 30)           // 11:30 PM local on the 15th
    expect(calendarDay(local.toISOString())).toBe('2026-09-15')
    expect(calendarDay(local)).toBe('2026-09-15')
  })
  it('garbage is empty, not a guess', () => { expect(calendarDay('someday')).toBe(''); expect(calendarDay('')).toBe('') })
})

describe('a payment or expense on the 1st belongs to its own month', () => {
  it('monthly trend keys by the calendar day, so September 1st is September', () => {
    const trend = monthlyTrend({
      payments: [{ date: '2026-09-01', amount: 1000 }, { date: '2026-08-31', amount: 10 }],
      manualExpenses: [{ date: '2026-09-01 00:00:00+00', amount: 250, category: 'Fuel' }],
      plaidTransactions: [],
      from: new Date(2026, 7, 1), to: new Date(2026, 8, 30, 23, 59, 59),
    })
    const rows = trend.rows || trend.data || trend
    const sep = rows.find((m) => m.month === '2026-09'), aug = rows.find((m) => m.month === '2026-08')
    expect(sep?.revenue).toBe(1000)
    expect(sep?.expenses).toBe(250)
    expect(aug?.revenue).toBe(10)
  })
})
