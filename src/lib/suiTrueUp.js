// SUI true-up — Gusto's "reconciliation payroll", done at the moment the
// rate changes instead of at quarter end.
//
// A company can run payroll on a temporary rate (or, as HHH did for nine
// months, on no rate at all). When the assigned rate is entered with its
// effective date, every quarter from that date is recomputed at the new
// rate and the DIFFERENCE between what the ledger has booked and what the
// wages actually owe is written as one payroll_tax_liabilities row per
// quarter — positive when more is owed, negative as a credit to take off
// the next payment. Paystubs are never rewritten: they are the record of
// what was computed on the day, and the ledger is the record of what is
// owed. Form 33H computes from wages × rate at render time, so the form is
// right either way; this keeps the remittance ledger right too.
//
// Idempotent by construction: the diff is against everything already
// booked (run rows AND earlier true-ups), so saving the same rate twice
// books nothing, and a second correction books only the delta.
//
// Gusto does not amend a quarter that was already filed; neither does
// this. The row's note says to settle that difference with the agency.

import { quarterOf } from './payrollQuarters'

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const money = (n) => '$' + r2(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Wages a paystub counts toward SUI — the same column choice Form 33H makes. */
export function suiWagesOf(paystub) {
  const w = paystub?.taxable_wages
  return Number(w == null || w === '' ? paystub?.gross_pay : w) || 0
}

/**
 * Pure. Recompute each quarter's SUI at `ratePct` and compare with the ledger.
 *
 * @param {object} p
 * @param {object[]} p.paystubs   the company's paystubs for the effective year
 *                                {id, employee_id, pay_date, gross_pay, taxable_wages}
 * @param {object[]} p.ledger     payroll_tax_liabilities rows with kind 'sui'
 *                                {id, payroll_run_id, period_end, amount_employer}
 * @param {object[]} p.runs       payroll_runs {id, pay_date} — places a ledger row
 *                                in the quarter its wages were PAID
 * @param {number}   p.ratePct    the rate now in force, e.g. 0.1
 * @param {number}   p.wageBase   per-employee annual taxable wage base
 * @param {string}   p.effectiveDate 'YYYY-MM-DD' the rate applies from
 * @param {number[]} [p.w2EmployeeIds] restrict to these employees (skip 1099s)
 * @returns {Array<{year, quarter, label, period_start, period_end, due_date, taxable_wages, corrected, booked, diff}>}
 */
export function computeSuiTrueUp({ paystubs = [], ledger = [], runs = [], ratePct, wageBase, effectiveDate, w2EmployeeIds }) {
  const rate = Number(ratePct) || 0
  const base = Number(wageBase) || 0
  const eff = String(effectiveDate || '').slice(0, 10)
  const year = Number(eff.slice(0, 4))
  if (!eff || !year) return []
  const allow = w2EmployeeIds ? new Set(w2EmployeeIds.map(Number)) : null

  // Per employee, in pay-date order, with the year-to-date wage base cap —
  // exactly what calcSUI does one paystub at a time when payroll runs.
  const byEmp = new Map()
  for (const ps of paystubs) {
    const pd = String(ps.pay_date || '').slice(0, 10)
    if (pd.slice(0, 4) !== String(year)) continue
    if (allow && !allow.has(Number(ps.employee_id))) continue
    if (!byEmp.has(ps.employee_id)) byEmp.set(ps.employee_id, [])
    byEmp.get(ps.employee_id).push(ps)
  }

  const quarters = new Map() // key 'Q1 2026' -> accumulator
  const bucket = (dateStr) => {
    const q = quarterOf(dateStr)
    if (!q) return null
    if (!quarters.has(q.label)) quarters.set(q.label, { ...q, taxable_wages: 0, corrected: 0, booked: 0 })
    return quarters.get(q.label)
  }

  for (const rows of byEmp.values()) {
    rows.sort((a, b) => String(a.pay_date).localeCompare(String(b.pay_date)) || (Number(a.id) - Number(b.id)))
    let ytd = 0
    for (const ps of rows) {
      const w = suiWagesOf(ps)
      const room = base > 0 ? Math.max(0, base - ytd) : w
      const taxable = Math.min(w, room)
      ytd += w
      const pd = String(ps.pay_date).slice(0, 10)
      if (pd < eff) continue
      const q = bucket(pd)
      if (!q) continue
      q.taxable_wages = r2(q.taxable_wages + taxable)
      q.corrected = r2(q.corrected + r2(taxable * rate / 100))
    }
  }

  // What the ledger already carries for those quarters — run rows sit in the
  // quarter of their run's pay date; true-up rows (no run) in their period.
  const runPayDate = new Map(runs.map(r => [Number(r.id), String(r.pay_date || '').slice(0, 10)]))
  for (const row of ledger) {
    const pd = (row.payroll_run_id && runPayDate.get(Number(row.payroll_run_id))) || String(row.period_end || '').slice(0, 10)
    if (!pd || pd.slice(0, 4) !== String(year) || pd < eff) continue
    const q = bucket(pd)
    if (!q) continue
    q.booked = r2(q.booked + (Number(row.amount_employer) || 0))
  }

  return [...quarters.values()]
    .sort((a, b) => a.quarter - b.quarter)
    .map(q => ({
      year: q.year, quarter: q.quarter, label: q.label,
      period_start: q.start, period_end: q.end, due_date: q.due,
      taxable_wages: q.taxable_wages, corrected: q.corrected, booked: q.booked,
      diff: r2(q.corrected - q.booked),
    }))
    .filter(q => Math.abs(q.diff) >= 0.005)
}

/** The ledger row for one quarter's difference. */
export function trueUpLiabilityRow({ companyId, agency, ratePct, reason, q }) {
  const credit = q.diff < 0
  const notes =
    `SUI true-up for ${q.label}: ${reason}. ` +
    `Taxable wages ${money(q.taxable_wages)} × ${Number(ratePct)}% = ${money(q.corrected)}; ` +
    `${money(q.booked)} was already booked; difference ${credit ? '−' : ''}${money(Math.abs(q.diff))}. ` +
    (credit ? 'Credit — deduct it from your next payment to the agency. ' : '') +
    'If this quarter was already filed, settle the difference with the agency directly; JobScout does not amend a filed quarter.'
  return {
    company_id: companyId,
    payroll_run_id: null,
    jurisdiction: 'state',
    agency,
    kind: 'sui',
    period_start: q.period_start,
    period_end: q.period_end,
    due_date: q.due_date,
    amount_employee: 0,
    amount_employer: q.diff,
    notes,
  }
}

/**
 * Load, compute, and (unless dryRun) book the true-up rows for the year the
 * rate takes effect in. Returns { rows, inserted, error }.
 */
export async function applySuiTrueUp(supabase, { companyId, ratePct, wageBase, effectiveDate, agency = 'State Unemployment', reason = 'rate changed', dryRun = false }) {
  const year = Number(String(effectiveDate || '').slice(0, 4))
  if (!companyId || !year) return { rows: [], inserted: 0, error: 'effective date required' }

  const [{ data: paystubs, error: e1 }, { data: employees, error: e2 }, { data: ledger, error: e3 }, { data: runs, error: e4 }] = await Promise.all([
    supabase.from('paystubs').select('id, employee_id, pay_date, gross_pay, taxable_wages')
      .eq('company_id', companyId).gte('pay_date', `${year}-01-01`).lte('pay_date', `${year}-12-31`).limit(5000),
    supabase.from('employees').select('id, tax_classification').eq('company_id', companyId),
    supabase.from('payroll_tax_liabilities').select('id, payroll_run_id, period_end, amount_employer')
      .eq('company_id', companyId).eq('kind', 'sui').limit(2000),
    supabase.from('payroll_runs').select('id, pay_date').eq('company_id', companyId)
      .gte('pay_date', `${year}-01-01`).lte('pay_date', `${year}-12-31`),
  ])
  const err = e1 || e2 || e3 || e4
  if (err) return { rows: [], inserted: 0, error: err.message }

  const w2EmployeeIds = (employees || []).filter(e => e.tax_classification !== '1099').map(e => e.id)
  const rows = computeSuiTrueUp({ paystubs: paystubs || [], ledger: ledger || [], runs: runs || [], ratePct, wageBase, effectiveDate, w2EmployeeIds })
  if (dryRun || !rows.length) return { rows, inserted: 0, error: null }

  const { error: insErr } = await supabase.from('payroll_tax_liabilities')
    .insert(rows.map(q => trueUpLiabilityRow({ companyId, agency, ratePct, reason, q })))
  if (insErr) return { rows, inserted: 0, error: insErr.message }
  return { rows, inserted: rows.length, error: null }
}
