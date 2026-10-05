// Salary or commission, whichever is more — for one pay period.
//
// Bryce, 5 Oct 2026: "we need a new option that is Salary or Commission
// whichever is more... when the salary is bigger than the commissions then the
// payroll should indicate and indicate that these commissions were paid."
//
// Every other pay type in this app ADDS UP: an employee who is salaried and on
// commission was paid both. This is the other arrangement every sales shop
// runs — the salary is a floor the commission has to beat, not a base it sits
// on top of. Doug and Christopher are on it.
//
// The important half is the second sentence. Whichever way the comparison
// goes, the period's commission is SETTLED: either it was paid as commission,
// or the salary covered it. What must never happen is a commission sitting
// around "earned" after a salary already covered it, because the next run
// would pay it again — so the rows get closed either way, and they record
// which of the two closed them (rep_commissions.covered_by_salary).
//
// One period at a time, no carry-over: a month where commission falls short
// does not create a debt against a better month. That is a draw, a different
// (and much harsher) arrangement, and nobody asked for it.

const money = (n) => Math.round((Number(n) || 0) * 100) / 100

/**
 * What a period pays, and what it settles.
 *
 * @param salaryPay      the period's salary, as payroll already computes it
 * @param commissionPay  the period's commission ready to pay (queued rows)
 * @param enabled        employees.pay_greater_of_salary_commission
 * @returns {{
 *   enabled: boolean,            whether the comparison applied at all
 *   basis: 'both'|'salary'|'commission',
 *   salaryPaid: number,          what to put in the paystub's salary line
 *   commissionPaid: number,      what to put in the commission line
 *   commissionCovered: number,   commission the salary absorbed - settled, not paid
 *   salaryConsidered: number,    the two numbers the comparison weighed, kept
 *   commissionConsidered: number,  so every surface can show the working
 *   margin: number,              how far the winner beat the loser by
 * }}
 */
export function greaterOfPay({ salaryPay = 0, commissionPay = 0, enabled = false } = {}) {
  const salary = money(salaryPay)
  const commission = money(commissionPay)
  if (!enabled) {
    return { enabled: false, basis: 'both', salaryPaid: salary, commissionPaid: commission, commissionCovered: 0, salaryConsidered: salary, commissionConsidered: commission, margin: 0 }
  }
  // Ties go to the salary: it is the predictable half, and paying the
  // commission instead would close the same money through a line the employee
  // does not expect to see move.
  if (salary >= commission) {
    return {
      enabled: true, basis: 'salary',
      salaryPaid: salary, commissionPaid: 0,
      commissionCovered: commission,
      salaryConsidered: salary, commissionConsidered: commission,
      margin: money(salary - commission),
    }
  }
  return {
    enabled: true, basis: 'commission',
    salaryPaid: 0, commissionPaid: commission,
    commissionCovered: 0,
    salaryConsidered: salary, commissionConsidered: commission,
    margin: money(commission - salary),
  }
}

/** Is this employee on the greater-of arrangement? */
export function paysGreaterOf(employee) {
  return !!employee?.pay_greater_of_salary_commission
}

/**
 * The sentence payroll shows for one of these employees. Written here so the
 * Payroll review, the paystub and My Pay say the same thing — this is exactly
 * the kind of explanation that drifts into three different half-truths.
 */
export function greaterOfSummary(decision, fmt = (n) => `$${Number(n || 0).toFixed(2)}`) {
  if (!decision?.enabled) return null
  const sal = fmt(decision.salaryConsidered)
  const com = fmt(decision.commissionConsidered)
  const by = fmt(decision.margin)
  if (decision.basis === 'salary') {
    return decision.commissionConsidered > 0
      ? `Salary ${sal} beats commission ${com} by ${by} — the salary is paid, and that commission is settled by it rather than paid on top.`
      : `Salary ${sal} paid. No commission earned this period.`
  }
  return `Commission ${com} beats the salary ${sal} by ${by} — the commission is paid, and the salary is not paid as well.`
}
