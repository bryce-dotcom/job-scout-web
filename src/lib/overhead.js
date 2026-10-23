import { hourlyCostRate, isSalaried, annualWageOf, effectiveBurdenPct } from './laborRate.js'
import { deliveredJobsInRange } from './jobMetrics.js'
import { costingJobId } from '../../supabase/functions/_shared/transferRule.ts'   // one rule for which job a bank row's money counts against

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
 * The wage cost of time that is not on a job — the office, and the parts of
 * everyone's week that no job is paying for.
 *
 * The bank's Payroll line is deliberately excluded from the spend pool
 * because it is one lump covering the crew, whose wages job costing already
 * charges to their jobs by the hour. This is the other half of that lump,
 * computed rather than guessed.
 *
 * Two shapes, so nobody is counted twice:
 *
 *   SALARIED — their whole salary for the window is a company cost whether
 *     they clock or not. Bryce earns $96,000 and clocks nothing; his pay
 *     reached no job and no overhead at all before this. So: the window's
 *     share of salary, LESS whatever already landed on jobs through their
 *     clocked job hours. A salaried PM who spends the week on site moves his
 *     own cost onto those jobs and leaves nothing here.
 *
 *   HOURLY — paid for the hours they clock, so only the off-job ones are
 *     overhead. Their job hours are already on the jobs.
 *
 * Someone who left part-way through the window still costs what they were
 * paid; we have no leaving date granularity finer than the day, so an
 * inactive employee with no clocked time simply contributes nothing.
 */
export function offJobLabourCost({ employees = [], timeClock = [], company = null, from, to } = {}) {
  const inWindow = (d) => { const k = dayOf(d); return !!k && k >= from && k <= to }
  const days = Math.max(1, Math.round((new Date(to) - new Date(from)) / 86400000) + 1)

  const jobHours = new Map()
  const offHours = new Map()
  for (const p of timeClock || []) {
    if (p?.employee_id == null) continue
    if (!inWindow(p.clock_in || p.date)) continue
    let h = Number(p.total_hours)
    if (!(Number.isFinite(h) && h > 0)) {
      h = p.clock_in && p.clock_out ? (new Date(p.clock_out) - new Date(p.clock_in)) / 36e5 : 0
    }
    if (!(h > 0)) continue
    const key = String(p.employee_id)
    const map = p.job_id ? jobHours : offHours
    map.set(key, (map.get(key) || 0) + h)
  }

  let total = 0
  const perEmployee = []
  for (const e of employees || []) {
    if (!e || e.id == null) continue
    const key = String(e.id)
    const onJobs = jobHours.get(key) || 0
    const off = offHours.get(key) || 0
    // Someone long gone who clocked nothing in the window costs nothing.
    if (e.active === false && onJobs === 0 && off === 0) continue
    const rate = hourlyCostRate(e, company)
    let cost = 0
    let basis = null
    if (isSalaried(e)) {
      const annual = annualWageOf(e)
      if (annual > 0) {
        const windowPay = (annual * (days / 365)) * (1 + effectiveBurdenPct(annual, company) / 100)
        const alreadyOnJobs = onJobs * rate
        cost = Math.max(0, windowPay - alreadyOnJobs)
        basis = 'salary less what reached jobs'
      }
    } else if (off > 0 && rate > 0) {
      cost = off * rate
      basis = 'hours clocked off a job'
    }
    if (!(cost > 0)) continue
    total += cost
    perEmployee.push({
      id: e.id, name: e.name || String(e.id), basis,
      cost: Math.round(cost * 100) / 100,
      jobHours: Math.round(onJobs * 10) / 10,
      offJobHours: Math.round(off * 10) / 10,
    })
  }
  perEmployee.sort((a, b) => b.cost - a.cost)
  return { total: Math.round(total * 100) / 100, perEmployee, days }
}

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
  employees = [], company = null, jobs = [], jobStatuses = [],
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
    if (costingJobId(t)) continue                   // the job pays for it
    // The category a PERSON set beats the AI's guess — lib/reports and
    // journalExport read them in that order and so must this.
    const cat = t.user_category || t.ai_category || t.category
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

  // The office, and everyone's off-job time. Only when the caller supplies
  // employees, so an existing caller's number does not move under it.
  const labour = employees.length
    ? offJobLabourCost({ employees, timeClock, company, from, to })
    : { total: 0, perEmployee: [] }
  pool += labour.total

  // The other basis: what the work was worth, rather than how long it took.
  //
  // Hours and revenue answer different questions and they disagree sharply
  // here. HHH burns 34% of the job hours to earn 17% of the money, so by the
  // hour it carries twice the overhead that its revenue would give it — which
  // is what took its week to break even. Neither is "correct": an hour of
  // insurance and fuel really is an hour, and a $68,000 lighting job really
  // does lean on the office more than a $600 window clean. Revenue is the
  // usual choice where one line is materials-heavy and the other is labour,
  // because it stops the labour line carrying the whole company.
  //
  // The denominator is what jobs delivered in the window were WORTH, the same
  // figure the profit metric subtracts cost from — so a job's share of
  // overhead is its share of the revenue, and the shares add to the pool.
  const delivered = jobs.length
    ? deliveredJobsInRange(jobs, jobStatuses, new Date(from + 'T00:00:00'), new Date(to + 'T23:59:59.999'))
    : []
  const revenue = delivered.reduce((s, j) => s + (Number(j?.job_total) || 0), 0)

  const perHour = pool > 0 && hours > 0 ? pool / hours : 0
  const pctOfRevenue = pool > 0 && revenue > 0 ? (pool / revenue) * 100 : 0
  return {
    perHour, pctOfRevenue,
    pool: Math.round(pool * 100) / 100,
    hours: Math.round(hours * 10) / 10,
    revenue: Math.round(revenue * 100) / 100,
    deliveredJobs: delivered.length,
    from, to,
    spend: Math.round((pool - labour.total) * 100) / 100,
    offJobLabour: labour.total,
    offJobLabourBy: labour.perEmployee,
    included: [...included.entries()].sort((a, b) => b[1] - a[1]).map(([category, amount]) => ({ category, amount })),
  }
}
