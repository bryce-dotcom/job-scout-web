// Monthly expense budgets by category, stored in the settings row
// key = 'expense_budgets' as { version: 1, monthly: { [categoryName]: amount } }.
//
// Actuals come from unifiedExpenses (manual + bank) so a budget line is
// compared against everything that was spent under that category name,
// whichever table it landed in.
import { unifiedExpenses } from './reports'

export const BUDGETS_KEY = 'expense_budgets'

export function parseBudgets(value) {
  if (!value) return { version: 1, monthly: {} }
  try {
    const v = typeof value === 'string' ? JSON.parse(value) : value
    const monthly = {}
    for (const [k, amt] of Object.entries(v?.monthly || {})) {
      const n = parseFloat(amt)
      if (k && Number.isFinite(n) && n >= 0) monthly[k] = Math.round(n * 100) / 100
    }
    return { version: 1, monthly }
  } catch {
    return { version: 1, monthly: {} }
  }
}

export function serializeBudgets(budgets) {
  return JSON.stringify({ version: 1, monthly: budgets?.monthly || {} })
}

// 'YYYY-MM' for a date-ish value.
export function monthKeyOf(d) {
  const x = d instanceof Date ? d : new Date(d)
  if (!Number.isFinite(x.getTime())) return null
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Rows for a month: every budgeted category (even with no spend), plus any
 * category that was spent against without a budget (so surprises show up).
 */
export function budgetVsActual(budgets, { manualExpenses = [], plaidTransactions = [] } = {}, monthKey) {
  const monthly = budgets?.monthly || {}
  const spent = new Map()
  for (const e of unifiedExpenses(manualExpenses, plaidTransactions)) {
    if (monthKeyOf(e.date) !== monthKey) continue
    spent.set(e.category, (spent.get(e.category) || 0) + e.amount)
  }
  const names = new Set([...Object.keys(monthly), ...spent.keys()])
  const rows = [...names].map(category => {
    const budget = monthly[category] ?? null
    const actual = Math.round((spent.get(category) || 0) * 100) / 100
    const variance = budget == null ? null : Math.round((budget - actual) * 100) / 100
    const pct = budget ? Math.round((actual / budget) * 100) : null
    return { category, budget, actual, variance, pct, over: budget != null && actual > budget }
  })
  rows.sort((a, b) => {
    // Over-budget first, then biggest budgets, then unbudgeted spend by size.
    if (a.over !== b.over) return a.over ? -1 : 1
    if ((a.budget != null) !== (b.budget != null)) return a.budget != null ? -1 : 1
    return (b.budget ?? b.actual) - (a.budget ?? a.actual)
  })
  const totalBudget = Math.round(rows.reduce((s, r) => s + (r.budget || 0), 0) * 100) / 100
  const totalActual = Math.round(rows.reduce((s, r) => s + r.actual, 0) * 100) / 100
  return { rows, totalBudget, totalActual, monthKey }
}
