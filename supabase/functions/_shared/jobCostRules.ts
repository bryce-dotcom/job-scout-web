// The cost rules a job's figures are built from, written down once.
//
// Two places have to produce the SAME job cost and for months did not:
// lib/reports.js jobCosting (the Job Costing report, the EOS scorecard, the
// job page, Frankie's context) and frankieTools jobProfitability, which calls
// itself "Port of src/lib/reports.js jobCosting" and is what the AI CFO
// answers money questions from.
//
// Measured on HHH, 2026-10-22: the two disagreed on 274 of 464 costed jobs
// and Frankie was $180,328.83 LOW overall — $138,330 of clocked labour he
// never fetched, $48,043 of crew bonuses he omitted, less $6,000 of parts he
// counted twice. JOB-MPN63W02 read $0.00 of cost to him against $20,250.46 in
// the report: 833 punched hours he could not see, which in his mouth is a
// 100%-margin job.
//
// A hand-written port of a money rule drifts. That is the shape of every
// circular regression in this app, so the rules that can be shared live here
// and both sides import them rather than each keeping a copy.

/**
 * Is this tagged spend the same parts the job's lines already price?
 *
 * Only true parts categories. Consumables, tools, rental, fuel and meals are
 * extra money the job cost on top of its bill of materials, and they add.
 * HHH's job-tagged spend reads: Materials (69), Job Materials (5), Small
 * Tools & Consumables (4), Supplies (5), Equipment Rental (1), Meals (1),
 * Subscriptions (1).
 *
 * Uncategorised spend is NOT treated as parts: calling it parts could cancel
 * a real catalog cost, and the safe direction here is to add a smaller number
 * rather than erase a larger one.
 */
export function isMaterialSpend(category: unknown): boolean {
  const c = String(category ?? '').trim().toLowerCase()
  if (!c) return false
  if (c.includes('consumable') || c.includes('tool')) return false
  return c.includes('material') || c.includes('part')
}

/**
 * Parts: the catalog says what they should have cost, the receipts say what
 * was actually paid. Take the LARGER, never the sum.
 *
 * Not simply "prefer the receipt": receipts arrive one supplier run at a
 * time, so a job half-way through its purchasing has receipts far below its
 * real bill of materials — job 8746 has $434 captured against $16,257 of
 * catalog parts, and believing the receipt would wipe $15,823 of real cost
 * and invent the profit to match. Once the receipts exceed the estimate we
 * know the estimate was low and the receipts win.
 *
 * Summing them instead is what frankieTools did: $5,999.99 of HHH parts
 * counted twice, on top of the catalog lines that already price them.
 */
export function materialCostOf(
  { estimate = 0, receipts = 0 }: { estimate?: unknown; receipts?: unknown } = {},
): { cost: number; source: 'actual' | 'estimate' | null } {
  const est = Number(estimate) || 0
  const rec = Number(receipts) || 0
  return {
    cost: Math.max(est, rec),
    source: rec > est ? 'actual' : (est > 0 ? 'estimate' : (rec > 0 ? 'actual' : null)),
  }
}

/** A bonus counts against the job once it is owed, not only once it is paid. */
export const BONUS_COUNTED_STATUSES = ['accrued', 'paid']

/**
 * Crew efficiency bonuses owed or paid on a job are a cost of that job.
 * frankieTools never fetched them: $48,043.44 missing from HHH's job costs,
 * and on JOB-MR2C9AT3 the bonus IS three quarters of the job's whole cost.
 */
export function bonusCostByJob(jobBonuses: any[] = []): Map<number, number> {
  const byJob = new Map<number, number>()
  for (const b of jobBonuses || []) {
    if (!b?.job_id || !BONUS_COUNTED_STATUSES.includes(b.status)) continue
    byJob.set(b.job_id, (byJob.get(b.job_id) || 0) + (Number(b.amount) || 0))
  }
  return byJob
}

/**
 * time_clock → job-hours. time_clock is the single source of truth for "hours
 * a tech spent on a job". Each row has employee_id, job_id, clock_in,
 * clock_out, total_hours. Rows missing data (no job_id, still clocked in) are
 * skipped. Lunch is already subtracted in total_hours at clock-out; it is
 * subtracted here only when the hours are derived from the clock pair.
 *
 * lib/bonusCalc re-exports this as timeClockToJobHours, which is the name
 * Payroll, FieldScout and the bonus calc know it by.
 */
export function jobHoursFromPunches(
  timeClockRows: any[] = [],
): { employee_id: any; job_id: any; hours: number }[] {
  return (timeClockRows || []).flatMap((row: any) => {
    if (!row?.job_id || !row?.employee_id) return []
    let hours = parseFloat(row.total_hours)
    if (!(hours > 0) && row.clock_in && row.clock_out) {
      hours = (new Date(row.clock_out).getTime() - new Date(row.clock_in).getTime()) / 36e5
      if (row.lunch_start && row.lunch_end) {
        hours -= (new Date(row.lunch_end).getTime() - new Date(row.lunch_start).getTime()) / 36e5
      }
    }
    if (!(hours > 0)) return []
    return [{
      employee_id: row.employee_id,
      job_id: row.job_id,
      hours: Math.round(hours * 100) / 100,
    }]
  })
}
