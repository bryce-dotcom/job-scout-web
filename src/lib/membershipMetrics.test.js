import { describe, it, expect } from 'vitest'
import { membershipMetrics, monthlyAmount } from './membershipMetrics'

describe('membershipMetrics', () => {
  const today = new Date('2026-09-17T12:00:00Z')
  const rows = [
    { id: 1, status: 'active', price_cents: 4900, billing_interval: 'month', plan_name: 'Silver' },
    { id: 2, status: 'active', price_cents: 120000, billing_interval: 'year', plan_name: 'Gold' },
    { id: 3, status: 'past_due', price_cents: 4900, billing_interval: 'month', plan_name: 'Silver' },
    { id: 4, status: 'canceled', price_cents: 4900, billing_interval: 'month', canceled_at: '2026-09-01T00:00:00Z' },
    { id: 5, status: 'canceled', price_cents: 4900, billing_interval: 'month', canceled_at: '2026-06-01T00:00:00Z' },
    { id: 6, status: 'incomplete', price_cents: 4900, billing_interval: 'month' },
  ]
  it('normalizes intervals to a month', () => {
    expect(monthlyAmount(rows[1])).toBe(100)
    expect(monthlyAmount({ price_cents: 3000, billing_interval: 'quarter' })).toBe(10)
  })
  it('reports MRR, ARR, churn in the last 30 days, and past-due exposure', () => {
    const m = membershipMetrics(rows, today)
    expect(m.active).toBe(3)
    expect(m.mrr).toBe(198)
    expect(m.arr).toBe(2376)
    expect(m.churned30).toBe(1)
    expect(m.churnRate).toBe(25)
    expect(m.pastDue).toBe(1)
    expect(m.pastDueMrr).toBe(49)
    expect(m.byPlan).toEqual([{ plan: 'Gold', count: 1, mrr: 100 }, { plan: 'Silver', count: 2, mrr: 98 }])
  })
})
