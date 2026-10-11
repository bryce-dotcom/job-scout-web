// Profit on the jobs you actually finished this week.
//
// Bryce, 2026-10-10: "I want to see jobs complete and the total of the job
// divided by the money spent on hours worked. So I completed 5 jobs worth
// 10,000 and we spent 5000 on materials and labor, so our dollars/hour made,
// profit."
//
// The old Dollars / Hour divided the revenue of the jobs finished this week by
// the hours clocked this week — and NONE of those hours were on those jobs
// (0% overlap in both business units). Two unrelated populations, so the
// number was a rate of nothing. This asks the question about one set of jobs:
// what were they worth, what did they cost, what is left.
//
// Cost is NOT redefined here. lib/reports.jobCosting is the one rule — it
// walks bundle components for materials, prefers real time-clock hours at the
// employee's rate over the line estimate, and adds tagged bank debits,
// receipts and crew bonuses. This module only decides which jobs take part and
// does the subtraction.
//
// The honest part: on HHH's last full week, 9 of 23 finished jobs had no cost
// recorded at all, including four Energy Scout jobs worth $21,728 between
// them. Counting those as pure profit would have reported an 80% margin that
// is really just missing data. So a job takes part only once its cost is
// known, and the ones left out are counted separately — a number to drive to
// zero, not a silent haircut on the profit.

/** The key lib/reports.jobCosting gives a row for this job. */
export function costingKey(job) {
  return job?.job_id || ('#' + job?.id)
}

// jobCosting indents a child row under its parent ("  └ J-12") for display.
const CHILD_PREFIX = /^[\s└─-]+/

/** Cost and hours per job, from jobCosting's rows. `cost` is null when
 *  nothing was captured, which is NOT the same as zero. */
export function buildJobCostIndex(costingRows = []) {
  const index = new Map()
  for (const row of costingRows || []) {
    const key = String(row?.job || '').replace(CHILD_PREFIX, '').trim()
    if (!key) continue
    index.set(key, {
      cost: row.total_cost,
      hours: Number(row.labor_hours) || 0,
      hasCost: row.total_cost != null,
    })
  }
  return index
}

/**
 * What a set of finished jobs was worth, what it cost, and what is left.
 *
 * A job's worth is its own `job_total` — the price of the work, not the cash
 * collected so far, because a job finished this week is often invoiced next
 * week and would otherwise read as pure loss.
 *
 * Jobs with no cost recorded are excluded from value, cost and profit alike,
 * and reported in `uncosted` / `uncostedValue` so the gap is visible.
 */
export function profitOnJobs(jobs = [], index = new Map()) {
  let value = 0, cost = 0, hours = 0, costed = 0, uncosted = 0, uncostedValue = 0
  for (const job of jobs || []) {
    if (!job) continue
    const jobValue = Number(job.job_total) || 0
    const row = index.get(costingKey(job))
    if (!row || !row.hasCost) {
      uncosted += 1
      uncostedValue += jobValue
      continue
    }
    value += jobValue
    cost += Number(row.cost) || 0
    hours += Number(row.hours) || 0
    costed += 1
  }
  const profit = value - cost
  return {
    value, cost, profit, hours, costed, uncosted, uncostedValue,
    margin: value > 0 ? profit / value : 0,
    profitPerHour: hours > 0 ? profit / hours : 0,
  }
}
