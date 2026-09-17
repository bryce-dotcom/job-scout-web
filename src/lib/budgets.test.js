import { describe, it, expect } from 'vitest'
import { parseBudgets, serializeBudgets, budgetVsActual, monthKeyOf } from './budgets'

describe('budgets', () => {
  it('parses a settings value defensively', () => {
    expect(parseBudgets(null).monthly).toEqual({})
    expect(parseBudgets('{not json').monthly).toEqual({})
    expect(parseBudgets(JSON.stringify({ monthly: { Fuel: '250', Meals: -5, '': 10 } })).monthly).toEqual({ Fuel: 250 })
    expect(JSON.parse(serializeBudgets({ monthly: { Fuel: 250 } }))).toEqual({ version: 1, monthly: { Fuel: 250 } })
  })
  it('compares a month, listing budgeted lines and unbudgeted surprises, over-budget first', () => {
    const budgets = { monthly: { Fuel: 300, Meals: 100 } }
    const manualExpenses = [{ id: 1, amount: 80, expense_date: '2026-09-04', category: { name: 'Meals' } }]
    const plaid = [
      { id: 1, amount: 350, date: '2026-09-10', user_category: 'Fuel' },
      { id: 2, amount: 45, date: '2026-09-12', ai_category: 'Office' },
      { id: 3, amount: -900, date: '2026-09-12', ai_category: 'Income' }, // money in, not spend
      { id: 4, amount: 1000, date: '2026-08-12', user_category: 'Fuel' },  // last month
    ]
    const r = budgetVsActual(budgets, { manualExpenses, plaidTransactions: plaid }, '2026-09')
    expect(r.rows.map(x => x.category)).toEqual(['Fuel', 'Meals', 'Office'])
    expect(r.rows[0]).toMatchObject({ budget: 300, actual: 350, variance: -50, pct: 117, over: true })
    expect(r.rows[1]).toMatchObject({ budget: 100, actual: 80, variance: 20, over: false })
    expect(r.rows[2]).toMatchObject({ budget: null, actual: 45, variance: null })
    expect(r.totalBudget).toBe(400)
    expect(r.totalActual).toBe(475)
  })
  it('month keys', () => {
    expect(monthKeyOf('2026-09-03')).toBe('2026-09')
    expect(monthKeyOf('nope')).toBe(null)
  })
})
