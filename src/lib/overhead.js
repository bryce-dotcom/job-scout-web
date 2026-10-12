// Overhead, spread over the hours people actually worked.
//
// Job costing charges a job what went INTO it: its parts, its crew's hours,
// its receipts. The company also pays rent, insurance, fuel, vehicles,
// software and the office — money no job is tagged with, and money every job
// depends on. Left out, a 68% margin reads as profit when a good part of it
// is already spent.
//
// The basis is one person-hour on the job, which is how Bryce asked for it:
// a job that took three people a full day carries three times the overhead of
// one that took one person a day. Hours are the thing every job has, and the
// thing overhead actually tracks — a crew in a van burns fuel and insurance
// by the hour, not by the invoice.
//
// WHAT IS NOT IN THE POOL, and why, because this is where the number goes
// wrong. HHH's untagged bank spend over 90 days is $511,744, which works out
// at $192 an hour and is nonsense:
//
//   Payroll $198,758       the crew's wages are ALREADY charged to their jobs
//                          by the hour. Putting payroll in overhead too would
//                          charge every job for its own labour twice. The
//                          office half of it is real overhead and is the known
//                          gap below.
//   Cost of Goods Sold     direct job cost that simply was not tagged to its
//   $49,260, Job Materials job. Spreading one job's materials across every
//   $23,528, Subcontractors other job is worse than leaving it off that job.
//   Loan Payment $56,671   repaying principal is not an expense at all.
//   Transfer $35,511       money moving between our own accounts.
//   Owner Distribution     profit taken out, not a cost of earning it.
//   "Other" $73,335        unknown. Categorise it and it counts.
//
// What is left is $61,128 over 90 days — about $23 an hour — and every line
// of it is something the company pays whether or not a particular job exists.

/** Spend that is genuinely overhead. An allow-list on purpose: anything
 *  unrecognised is left OUT, because wrongly adding a job's own materials to
 *  every job is a worse error than missing a subscription. */
const OVERHEAD_PATTERNS = [
  /\brent\b/, /utilit/, /insurance/, /\bfuel\b/, /vehicle/, /\bauto\b/,
  /equipment/, /\bsupplies\b/, /subscription/, /software/, /travel/, /\bmeals?\b/,
  /office/, /professional/, /legal/, /accounting/, /\bbank\b/, /merchant/,
  /advertis/, /marketing/, /\bdues\b/, /license/, /\brepairs?\b/, /telephone/,
  /\bphone\b/, /internet/, /training/, /uniform/, /\btools?\b/, /consumable/,
]

/** Spend that must never be overhead even if a pattern above would match it:
 *  direct job cost, financing, owner money, and anything that is not spend. */
const NEVER_OVERHEAD = [
  /payroll/, /\bwages?\b/, /salar/, /cost of goods/, /\bcogs\b/,
  /job material/, /subcontract/, /\bloan\b/, /principal/, /transfer/,
  /owner/, /distribution/, /draw/, /\btax(es)?\b/, /credit card payment/,
]

export function isOverheadSpend(category) {
  const c = String(category ?? '').trim().toLowerCase()
  if (!c) return false                      // uncategorised stays out
  if (NEVER_OVERHEAD.some(re => re.test(c))) return false
  return OVERHEAD_PATTERNS.some(re => re.test(c))
}

const dayOf = (v) => String(v ?? '').slice(0, 10)

/**
 * What one person-hour of work costs the company in overhead.
 *
 * Measured over a trailing window so it is a rate the business is running at
 * now, not an average of its whole history. Spend already tagged to a job is
 * excluded: that job is paying for it directly.
 *
 * @returns {{ perHour, pool, hours, from, to, included }}
 *   perHour is 0 when either side is missing, which leaves job costing exactly
 *   as it was rather than inventing a cost.
 */
export function overheadRatePerHour({
  expenses = [], plaidTransactions = [], timeClock = [],
  now = new Date(), days = 90,
} = {}) {
  const to = dayOf(new Date(now).toISOString())
  const from = dayOf(new Date(new Date(now).getTime() - days * 86400000).toISOString())
  const inWindow = (d) => { const k = dayOf(d); return !!k && k >= from && k <= to }

  let pool = 0
  const included = new Map()
  const counted = new Set()
  for (const t of plaidTransactions || []) {
    const amt = Number(t?.amount) || 0
    if (amt <= 0 || t.is_transfer) continue
    if (t.job_id || t.ai_job_id) continue           // the job pays for it
    const cat = t.category || t.ai_category
    if (!isOverheadSpend(cat)) continue
    if (!inWindow(t.date)) continue
    pool += amt
    included.set(cat, (included.get(cat) || 0) + amt)
    if (t.id != null) counted.add(t.id)
  }
  for (const e of expenses || []) {
    if (e?.job_id) continue
    if (e?.plaid_transaction_id && counted.has(e.plaid_transaction_id)) continue
    if (!isOverheadSpend(e?.category)) continue
    if (!inWindow(e?.date || e?.expense_date)) continue
    const amt = Number(e.amount) || 0
    if (amt <= 0) continue
    pool += amt
    included.set(e.category, (included.get(e.category) || 0) + amt)
  }

  // Hours worked ON JOBS in the same window: the hours overhead is spread
  // across. Office time is not on a job and does not dilute the rate.
  let hours = 0
  for (const p of timeClock || []) {
    if (!p?.job_id) continue
    if (!inWindow(p.clock_in || p.date)) continue
    const h = Number(p.total_hours)
    if (Number.isFinite(h) && h > 0) { hours += h; continue }
    if (p.clock_in && p.clock_out) {
      const span = (new Date(p.clock_out) - new Date(p.clock_in)) / 36e5
      if (span > 0) hours += span
    }
  }

  const perHour = pool > 0 && hours > 0 ? pool / hours : 0
  return {
    perHour, pool: Math.round(pool * 100) / 100, hours: Math.round(hours * 10) / 10,
    from, to,
    included: [...included.entries()].sort((a, b) => b[1] - a[1]).map(([category, amount]) => ({ category, amount })),
  }
}
