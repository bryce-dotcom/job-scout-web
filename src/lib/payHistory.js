// What a paycheck actually paid for.
//
// Bryce, 7 Oct 2026: "I cant see history in payroll... which i should be able
// to (pay stubs) but also what jobs hes has been paid for."
//
// A paystub says $3,500 salary and $1,194 commission. It does not say the
// commission was the Power Wash job collected on the 17th, which is the thing
// a rep actually wants to check and the thing an office hand gets asked about.
// Both earnings tables already carry the job; nothing joined them to the check.
//
// One resolver, because Payroll's history and the employee's My Pay must list
// the same jobs for the same check — two different answers to "what was I paid
// for" is worse than none.

const money = (n) => Math.round((Number(n) || 0) * 100) / 100
const dayOf = (v) => (v ? String(v).slice(0, 10) : null)

/**
 * Rows that belong to one paycheck.
 *
 * Matching is by payroll run id where it exists (set from Oct 2026), falling
 * back to the run's pay date for everything paid before that. The fallback is
 * not perfect — HHH has two runs sharing 20 Aug 2026 — which is exactly why
 * the id was added rather than relying on dates forever.
 */
function onThisCheck(rows, { runId, payDate, employeeId }) {
  const day = dayOf(payDate)
  return (rows || []).filter((r) => {
    if (employeeId != null && r.employee_id !== employeeId) return false
    if (r.payment_status !== 'paid' && r.status !== 'paid') return false
    if (r.paid_payroll_run_id != null && runId != null) return r.paid_payroll_run_id === runId
    if (r.paid_payroll_run_id != null && runId == null) return false
    return day != null && dayOf(r.paid_at) === day
  })
}

/**
 * The job-by-job story behind one paycheck.
 *
 * @param stub            a paystubs row (pay_date, payroll_run_id, employee_id)
 * @param repCommissions  rep_commissions rows for this employee
 * @param leadCommissions lead_commissions rows (setter fees — no job of their own)
 * @param bonuses         job_bonuses rows
 * @param jobLabel        (jobId) => string, usually from a Map of loaded jobs
 * @returns {{ commissions, setterFees, bonuses, commissionTotal, setterTotal,
 *             bonusTotal, coveredBySalary, lines }}
 *          `lines` is the flat list a UI renders: { kind, label, amount, note }
 */
export function paycheckDetail({
  stub,
  repCommissions = [],
  leadCommissions = [],
  bonuses = [],
  jobLabel = (id) => `Job ${id}`,
} = {}) {
  const key = { runId: stub?.payroll_run_id ?? null, payDate: stub?.pay_date, employeeId: stub?.employee_id }
  const commissions = onThisCheck(repCommissions, key).map((r) => ({
    id: r.id,
    jobId: r.job_id,
    label: r.job_id ? jobLabel(r.job_id) : (r.kind === 'utility' ? 'Utility incentive' : 'Commission'),
    amount: money(r.amount),
    rate: r.rate != null ? Number(r.rate) : null,
    kind: r.kind || 'services',
    coveredBySalary: !!r.covered_by_salary,
  }))
  const setterFees = onThisCheck(leadCommissions, key).map((r) => ({
    id: r.id,
    label: r.commission_type === 'lead_source' ? 'Lead sourced' : 'Appointment set',
    amount: money(r.amount),
    coveredBySalary: !!r.covered_by_salary,
  }))
  const bonusRows = onThisCheck(bonuses, key).map((r) => ({
    id: r.id,
    jobId: r.job_id,
    label: r.job_id ? jobLabel(r.job_id) : 'Efficiency bonus',
    amount: money(r.amount),
    savedHours: r.saved_hours != null ? Number(r.saved_hours) : null,
  }))

  const sum = (rows) => money(rows.reduce((s, r) => s + r.amount, 0))
  // Money the salary covered is listed, but it is NOT part of what the check
  // paid — saying otherwise would double it against the stub's own total.
  const paidCommissions = commissions.filter((c) => !c.coveredBySalary)
  const paidSetter = setterFees.filter((c) => !c.coveredBySalary)

  return {
    commissions,
    setterFees,
    bonuses: bonusRows,
    commissionTotal: sum(paidCommissions),
    setterTotal: sum(paidSetter),
    bonusTotal: sum(bonusRows),
    coveredBySalary: money(
      sum(commissions.filter((c) => c.coveredBySalary)) + sum(setterFees.filter((c) => c.coveredBySalary))
    ),
    lines: [
      ...commissions.map((c) => ({
        kind: 'commission',
        label: c.label,
        amount: c.amount,
        note: c.coveredBySalary
          ? 'settled by your salary'
          : c.rate != null && c.rate > 0 ? `${c.rate}% commission` : 'commission',
      })),
      ...setterFees.map((c) => ({
        kind: 'setter',
        label: c.label,
        amount: c.amount,
        note: c.coveredBySalary ? 'settled by your salary' : 'setter fee',
      })),
      ...bonusRows.map((b) => ({
        kind: 'bonus',
        label: b.label,
        amount: b.amount,
        note: b.savedHours != null ? `${b.savedHours}h saved` : 'efficiency bonus',
      })),
    ],
  }
}

/** Newest first, the order a pay history reads in. */
export function sortPaychecks(stubs = []) {
  return [...(stubs || [])].sort((a, b) => String(b.pay_date || '').localeCompare(String(a.pay_date || '')))
}

/**
 * Paystubs grouped by the run that produced them — Payroll's history list.
 * A stub with no run (hand-entered, or a run since deleted) still gets a group
 * so nobody's paycheck disappears from the page.
 */
export function runsWithStubs(runs = [], stubs = []) {
  const byRun = new Map()
  for (const r of runs || []) byRun.set(r.id, { run: r, stubs: [], gross: 0, net: 0 })
  const orphans = []
  for (const s of stubs || []) {
    const g = s.payroll_run_id != null ? byRun.get(s.payroll_run_id) : null
    if (g) { g.stubs.push(s); g.gross += Number(s.gross_pay) || 0; g.net += Number(s.net_pay) || 0 }
    else orphans.push(s)
  }
  const out = [...byRun.values()]
    .filter((g) => g.stubs.length)
    .map((g) => ({ ...g, gross: money(g.gross), net: money(g.net) }))
  out.sort((a, b) => String(b.run.pay_date || '').localeCompare(String(a.run.pay_date || '')))
  return { groups: out, orphans: sortPaychecks(orphans) }
}
