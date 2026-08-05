// Setter / lead-source commissions (the lead_commissions table).
//
// This is the SECOND commission system in the app and the two are easy to
// confuse:
//   rep_commissions  — a salesperson's % of what the customer paid.
//                      lib/repCommissions.js. Reads commission_services_rate
//                      / commission_goods_rate.
//   lead_commissions — a setter's flat fee for booking the appointment, and
//                      lead-source fees. THIS file. Reads
//                      commission_setter_rate, written by LeadSetter.jsx and
//                      DB triggers.
//
// repCommissions has no concept of a setter, so someone whose rate lives only
// in commission_setter_rate earns nothing there — that is what happened to
// Damien Hargett (4 jobs sold, $0 paid). And My Pay only ever read
// rep_commissions, so a genuine setter saw $0 no matter what this table said.
// Payroll read it; My Pay didn't. The rule lived in one page instead of a lib,
// which is the same failure that has bitten invoice lines, job ownership and
// the material/labor split.

/** Qualification rules for when a booked appointment becomes payable. */
export const SETTER_RULE_ON_SET = 'appointment_set'
export const SETTER_RULE_ON_QUOTE = 'quote_created'

const amt = (c) => Number(c?.amount) || 0
const sum = (rows) => (rows || []).reduce((s, c) => s + amt(c), 0)

/**
 * What a single employee is owed from lead_commissions.
 *
 * @param rows      lead_commissions rows (any employees — filtered here)
 * @param employeeId
 * @param setterRule company.setter_qualification_rule
 *
 * Returns { total, details, apptCount, sourceCount, pendingCount,
 *           pendingAmount, paidCount, paidTotal }.
 *
 * `details` is exactly the payable set, so a caller can hand it straight to a
 * per-row Mark paid control without re-deriving which rows count.
 */
export function setterCommissionSummary(rows, employeeId, setterRule = SETTER_RULE_ON_SET) {
  const allEmp = (rows || []).filter(c => c && c.employee_id === employeeId)

  // Paid rows drop OFF the payable set — parity with the bonus ledger, so a
  // commission paid on one run can't be paid again on the next. Surfaced
  // separately rather than silently vanishing.
  const paidRows = allEmp.filter(c => c.payment_status === 'paid')
  const unpaid = allEmp.filter(c => c.payment_status !== 'paid')

  const setterRows = unpaid.filter(c => c.commission_type === 'appointment_set')
  const sourceRows = unpaid.filter(c => c.commission_type === 'lead_source')

  // Under the quote_created rule an appointment only pays once a quote exists
  // on the lead; a DB trigger flips the row to 'earned'. Under the default
  // rule, booking it is enough.
  const onQuote = setterRule === SETTER_RULE_ON_QUOTE
  const earnedSetter = onQuote ? setterRows.filter(c => c.payment_status === 'earned') : setterRows
  const pendingSetter = onQuote ? setterRows.filter(c => c.payment_status === 'pending') : []

  return {
    total: sum(earnedSetter) + sum(sourceRows),
    details: [...earnedSetter, ...sourceRows],
    apptCount: earnedSetter.length,
    sourceCount: sourceRows.length,
    pendingCount: pendingSetter.length,
    pendingAmount: sum(pendingSetter),
    paidCount: paidRows.length,
    paidTotal: sum(paidRows),
    paidRows,
  }
}
