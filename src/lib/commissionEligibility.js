// Which jobs earn a given employee commission at all.
//
// Every commission rate in this app is a flat percentage of whatever the rep
// owns. Christopher Lyman's arrangement is not: he is HHH's project manager
// on the cleaning side — salaried, off the efficiency bonus — and earns
// "5% on jobs over 10k" (Bryce, 3 Oct 2026). Without a floor he was accruing
// 6% on $40 window cleans, because a HouseCall import stamped him as the
// salesperson on 5,961 of HHH's 7,150 jobs.
//
// This lives on its own because the question is asked in two places that must
// agree: lib/repCommissions (the rep_commissions ledger, which is what gets
// paid) and bonusCalc.calculateInvoiceCommissions (the live figures on
// Payroll and My Pay). One rule written down twice is how this codebase has
// broken itself before — see the sales-attribution and invoice-lines notes.

/** The floor for this employee, in dollars. 0 = no floor (everyone, today). */
export function commissionMinJobTotal(employee) {
  const min = parseFloat(employee?.commission_min_job_total)
  return Number.isFinite(min) && min > 0 ? min : 0
}

/**
 * Is this job big enough to earn this employee commission?
 *
 * Measured on the JOB's total, not the invoice or the payment: a $12,000 job
 * collected in three $4,000 payments is one job over the line, and each
 * payment earns as it lands, exactly as it does for everyone else. A job with
 * no total recorded does not clear a floor — there is nothing to measure, and
 * paying on an unknown is how a floor becomes decorative.
 */
export function jobEarnsCommission(job, employee) {
  const min = commissionMinJobTotal(employee)
  if (min <= 0) return true
  return (parseFloat(job?.job_total) || 0) >= min
}
