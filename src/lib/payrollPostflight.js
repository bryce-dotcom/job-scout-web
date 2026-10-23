// After the run: what was written, reconciled against what was computed.
//
// docs/PAYROLL_PLAN.md step 5. process_payroll_run returns the run and the
// counts of what it marked; this holds them against the payload the page
// sent and the ledgers it was looking at. Exceptions first. A payroll is not
// done until this says zero.
//
// Pure. The page shows the text and sends it to every HR user.

import { isPayableNow } from './bonusLedger'

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const money = (n) => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
const sum = (rows, k) => r2((rows || []).reduce((s, r) => s + (Number(r?.[k]) || 0), 0))

/**
 * @param {object} args
 *   payload   what the page sent (lib/payrollRun buildRunPayload)
 *   result    what process_payroll_run returned: { run, rerun, pto_note, counts }
 *   employees the active employees the run paid
 *   ledgerBonuses, repCommissions, leadCommissions  the ledgers as loaded before the run
 *   priorRuns the company's earlier runs, for the period-over-period line
 * @returns { exceptions: string[], lines: string[], text: string }
 */
export function postflightReport({ payload, result, employees = [], ledgerBonuses = [], repCommissions = [], leadCommissions = [], priorRuns = [] }) {
  const exceptions = [], lines = []
  const run = result?.run || {}
  const counts = result?.counts || {}
  const stubs = payload?.stubs || []
  const paid = new Set(payload?.paid_employee_ids || [])
  const ps = payload?.run?.period_start, pe = payload?.run?.period_end

  // Stubs and gross.
  if (counts.stubs !== stubs.length) exceptions.push(`${stubs.length} stubs sent, ${counts.stubs} written`)
  const gross = sum(stubs, 'gross_pay')
  if (Math.abs(gross - r2(run.total_gross)) > 0.011) exceptions.push(`stubs total ${money(gross)} gross, the run says ${money(run.total_gross)}`)
  lines.push(`${stubs.length} stubs, ${money(gross)} gross, ${money(sum(stubs, 'net_pay'))} net`)

  // Taxes on the stubs are the liabilities, to the cent.
  const liab = payload?.liabilities || []
  const eeOnStubs = r2(['federal_income_tax', 'state_income_tax', 'social_security_employee', 'medicare_employee', 'additional_medicare', 'famli_employee'].reduce((s, k) => s + sum(stubs, k), 0))
  const erOnStubs = r2(['social_security_employer', 'medicare_employer', 'futa', 'sui', 'famli_employer'].reduce((s, k) => s + sum(stubs, k), 0))
  const eeLiab = sum(liab, 'amount_employee'), erLiab = sum(liab, 'amount_employer')
  if (counts.liabilities !== liab.length) exceptions.push(`${liab.length} liability rows sent, ${counts.liabilities} written`)
  if (Math.abs(eeOnStubs - eeLiab) > 0.011) exceptions.push(`employee tax on stubs ${money(eeOnStubs)}, in liabilities ${money(eeLiab)}`)
  if (Math.abs(erOnStubs - erLiab) > 0.011) exceptions.push(`employer tax on stubs ${money(erOnStubs)}, in liabilities ${money(erLiab)}`)
  lines.push(`taxes: ${money(eeOnStubs)} withheld, ${money(erOnStubs)} employer, ${liab.length} liability rows`)

  // Ledger marks: what the run was looking at is what it closed.
  const inPeriod = (d) => { const day = String(d || '').slice(0, 10); return ps && pe && day >= ps && day <= pe }
  const bonusExpected = (ledgerBonuses || []).filter(b => paid.has(b.employee_id) && isPayableNow(b))
  const bonusOnStubs = sum(stubs, 'bonus_pay')
  if (counts.bonuses !== bonusExpected.length) exceptions.push(`${bonusExpected.length} bonus rows were payable, ${counts.bonuses} marked paid`)
  if (Math.abs(sum(bonusExpected, 'amount') - bonusOnStubs) > 0.011) exceptions.push(`payable bonuses ${money(sum(bonusExpected, 'amount'))}, on stubs ${money(bonusOnStubs)}`)
  const repQueued = (repCommissions || []).filter(r => paid.has(r.employee_id) && r.queued_for_payroll && r.payment_status !== 'paid')
  const repOutside = repQueued.filter(r => !inPeriod(r.earned_at))
  if (repOutside.length) exceptions.push(`${repOutside.length} rep commission row(s) marked paid were earned outside the period and are on no stub (${money(sum(repOutside, 'amount'))})`)
  if (counts.rep !== repQueued.length) exceptions.push(`${repQueued.length} rep commission rows were staged, ${counts.rep} marked paid`)
  const leadQueued = (leadCommissions || []).filter(c => paid.has(c.employee_id) && c.queued_for_payroll && c.payment_status !== 'paid')
  if (counts.setter > leadQueued.length) exceptions.push(`${leadQueued.length} setter fees were staged in this period, ${counts.setter} marked paid: ${counts.setter - leadQueued.length} from outside it, on no stub`)
  else if (counts.setter < leadQueued.length) exceptions.push(`${leadQueued.length} setter fees were staged, ${counts.setter} marked paid`)
  lines.push(`closed: ${counts.bonuses || 0} bonuses, ${counts.rep || 0} rep commissions, ${counts.setter || 0} setter fees, ${counts.settled || 0} settled by salary-or-commission`)

  // PTO.
  const moves = payload?.pto_moves || []
  if (result?.rerun) lines.push('PTO banks left alone: the period had already been run')
  else if (counts.pto !== moves.length) exceptions.push(`${moves.length} PTO banks to move, ${counts.pto} moved`)
  else lines.push(`PTO: ${moves.length} bank(s) moved`)

  // Against the last run.
  const prior = (priorRuns || []).filter(r => r.id !== run.id && r.pay_date && r.pay_date < run.pay_date).sort((a, b) => String(b.pay_date).localeCompare(String(a.pay_date)))[0]
  if (prior && Number(prior.total_gross) > 0) {
    const pct = Math.round(((gross - Number(prior.total_gross)) / Number(prior.total_gross)) * 100)
    lines.push(`last run (${prior.pay_date}): ${money(prior.total_gross)} gross, this run ${pct >= 0 ? '+' : ''}${pct}%`)
    if (Math.abs(pct) >= 50) exceptions.push(`gross moved ${pct >= 0 ? '+' : ''}${pct}% against the last run (${money(prior.total_gross)})`)
  }

  const text = (exceptions.length ? `EXCEPTIONS (${exceptions.length}):\n` + exceptions.map(x => `  • ${x}`).join('\n') + '\n\n' : 'No exceptions.\n\n') + lines.map(l => `  ${l}`).join('\n')
  return { exceptions, lines, text }
}
