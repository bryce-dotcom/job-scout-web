// Find people who are marked as earning commission but cannot possibly earn
// any, because every rate that applies to them is zero.
//
// Damien Hargett sold four jobs and was paid $0 for months. He was flagged
// is_commission, his type was 'percent', and his rate was sitting in
// commission_setter_rate — a field computeRepRows never reads. It produced no
// rows, and no screen anywhere said "this person is configured to earn
// nothing." A silent zero looks identical to "hasn't sold anything yet".
//
// Deliberately narrow, because a noisy warning gets ignored and then this
// comes back a fifth time. It fires ONLY when all of these hold:
//   - is_commission is on (someone intended them to be paid commission)
//   - every applicable rate is zero — services, goods AND processor, so a
//     processor-only earner like Alayda is not flagged
//   - they own at least one job whose invoice has actually COLLECTED money,
//     so there is real commission being lost right now, not a hypothetical
//
// Ownership comes from lib/jobOwnership, the same rule Payroll, My Pay and the
// pipeline use, so this can't disagree with them about whose job it is.

import { buildLeadIndex, jobOwnedBy } from './jobOwnership'

const num = (v) => parseFloat(v) || 0

/**
 * @returns [{ employeeId, name, jobCount, collected, rates }] — one entry per
 *          misconfigured earner, worst (most collected) first.
 */
export function commissionConfigIssues({
  employees = [], jobs = [], leads = [], invoices = [], payments = [],
} = {}) {
  const leadIndex = buildLeadIndex(leads)

  // Money actually collected per job — a paid invoice or any payment against
  // one. Mirrors what computeRepRows pays on.
  const collectedByJob = new Map()
  const add = (jobId, amount) => {
    if (jobId == null || !(amount > 0)) return
    collectedByJob.set(jobId, (collectedByJob.get(jobId) || 0) + amount)
  }
  const invById = new Map((invoices || []).map(i => [i.id, i]))
  const paidInvoiceIds = new Set()
  for (const p of payments || []) {
    const inv = invById.get(p.invoice_id)
    if (!inv) continue
    paidInvoiceIds.add(inv.id)
    add(inv.job_id, num(p.amount))
  }
  for (const inv of invoices || []) {
    // A "Paid" invoice with no payment row still represents collected money —
    // computeRepRows pays a synthetic row for exactly this case.
    if (inv.payment_status === 'Paid' && !paidInvoiceIds.has(inv.id)) add(inv.job_id, num(inv.amount))
  }

  const issues = []
  for (const e of employees || []) {
    if (!e?.is_commission) continue
    const services = num(e.commission_services_rate)
    const goods = num(e.commission_goods_rate)
    const processor = num(e.commission_processor_rate)
    if (services > 0 || goods > 0 || processor > 0) continue

    let jobCount = 0
    let collected = 0
    for (const j of jobs || []) {
      if (!jobOwnedBy(j, e.id, leadIndex, 'credit')) continue
      const got = collectedByJob.get(j.id) || 0
      if (got <= 0) continue
      jobCount += 1
      collected += got
    }
    if (jobCount === 0) continue

    issues.push({
      employeeId: e.id,
      name: e.name || `Employee ${e.id}`,
      jobCount,
      collected: Math.round(collected * 100) / 100,
      // Surfaced so the message can say WHERE the rate went, which is the
      // actually useful part — it is nearly always in the setter field.
      rates: { services, goods, processor, setter: num(e.commission_setter_rate) },
    })
  }

  return issues.sort((a, b) => b.collected - a.collected)
}

/** One-line explanation for the banner. */
export function commissionIssueMessage(issue) {
  if (!issue) return ''
  const where = issue.rates?.setter > 0
    ? ` Their rate (${issue.rates.setter}) is in the setter field, which rep commissions don't use.`
    : ''
  return `${issue.name} earns commission but every rate is 0, on ${issue.jobCount} job${issue.jobCount === 1 ? '' : 's'} with money collected.${where}`
}
