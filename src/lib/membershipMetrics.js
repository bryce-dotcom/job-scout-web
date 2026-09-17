// Membership revenue as Books sees it: monthly recurring revenue, annual
// run-rate, and churn, from customer_memberships (Stripe subscriptions
// the tenant sells to its own customers).

const num = (v) => parseFloat(v) || 0
const r2 = (n) => Math.round(n * 100) / 100
const LIVE = new Set(['active', 'trialing', 'past_due'])

export function monthlyAmount(m) {
  const amt = num(m?.price_cents) / 100
  if (m?.billing_interval === 'year') return amt / 12
  if (m?.billing_interval === 'quarter') return amt / 3
  return amt
}

export function membershipMetrics(memberships = [], today = new Date()) {
  const live = (memberships || []).filter(m => LIVE.has(m.status))
  const mrr = live.reduce((s, m) => s + monthlyAmount(m), 0)
  const cutoff = new Date(today.getTime() - 30 * 86400000)
  const churned30 = (memberships || []).filter(m => m.status === 'canceled' && m.canceled_at && new Date(m.canceled_at) >= cutoff).length
  // Active at the start of the window ≈ live now + those that left during it.
  const base = live.length + churned30
  const pastDue = live.filter(m => m.status === 'past_due')
  const byPlan = new Map()
  for (const m of live) {
    const k = m.plan_name || 'Membership'
    const cur = byPlan.get(k) || { plan: k, count: 0, mrr: 0 }
    cur.count += 1; cur.mrr += monthlyAmount(m)
    byPlan.set(k, cur)
  }
  return {
    active: live.length,
    mrr: r2(mrr),
    arr: r2(mrr * 12),
    churned30,
    churnRate: base > 0 ? Math.round((churned30 / base) * 1000) / 10 : 0,
    pastDue: pastDue.length,
    pastDueMrr: r2(pastDue.reduce((s, m) => s + monthlyAmount(m), 0)),
    byPlan: [...byPlan.values()].map(x => ({ ...x, mrr: r2(x.mrr) })).sort((a, b) => b.mrr - a.mrr),
  }
}
