import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { computeEmployeePay } from './payrollEngine'
import { setterCommissionSummary } from './setterCommissions'

// Golden replays (docs/PAYROLL_PLAN.md step 3). Each directory under
// test/fixtures/payroll is one real pay period captured by
// scripts/capture-payroll-fixture.mjs: the inputs the Payroll page had that
// morning, and the stubs that were actually paid. The engine has to
// reproduce every stub to the cent. When it does not, the diff names the
// person (by id), the field, what was paid and what the engine says now.
//
// A fixture whose stubs came from Gusto (meta.source === 'gusto') is a
// different kind of check: JobScout's own time clock against what Gusto
// paid off hours the office typed. It reports, and only fails on the
// figures that do not depend on hours (the tax on a given gross).

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../../test/fixtures/payroll')
const dirs = existsSync(root) ? readdirSync(root).filter(d => existsSync(join(root, d, 'inputs.json'))).sort() : []
const load = (d, f) => JSON.parse(readFileSync(join(root, d, f), 'utf8'))
const local = (s) => new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)))
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

/** Replay one fixture: the engine's figures for every stub, in stub shape. */
export function replayFixture(inputs) {
  const period = { start: local(inputs.period.start), end: local(inputs.period.end) }
  period.end.setHours(23, 59, 59, 999)
  const out = {}
  // The page pays its active list; a card switched off that morning is not run.
  for (const employee of inputs.employees.filter(e => e.active !== false)) {
    const pay = computeEmployeePay({
      employee, employees: inputs.employees,
      timeEntries: inputs.timeEntries, timeLogEntries: inputs.timeLogEntries, payrollConfig: inputs.payrollConfig,
      period, payDate: inputs.payDate,
      repCommissions: inputs.repCommissions,
      leadCommissionSummary: setterCommissionSummary(inputs.leadCommissions, employee.id, inputs.setterRule),
      bonusRows: inputs.bonusRows.filter(b => b.employee_id === employee.id),
      periodTimeOff: inputs.periodTimeOff, adjustments: inputs.adjustments, benefits: inputs.benefits,
      ytd: inputs.ytd[employee.id] || null, taxCompany: inputs.taxCompany,
    })
    const t = pay.tax || {}
    out[employee.id] = {
      regular_hours: r2(pay.regularHours), overtime_hours: r2(pay.overtimeHours), pto_hours: r2(pay.ptoHours),
      gross_pay: r2(pay.grossPay), commission_pay: r2(pay.commissionPay), bonus_pay: r2(pay.bonusOwed),
      federal_income_tax: r2(t.federalIncomeTax), state_income_tax: r2(t.stateIncomeTax),
      social_security_employee: r2(t.socialSecurityEmployee), medicare_employee: r2(t.medicareEmployee), additional_medicare: r2(t.additionalMedicare),
      futa: r2(t.futa), sui: r2(t.sui), famli_employee: r2(t.famliEmployee),
      pre_tax_deductions: r2(t.preTaxDeductions), post_tax_deductions: r2(t.postTaxDeductions),
      net_pay: r2(pay.tax ? t.netPay : pay.netPay),
      _pay: pay,
    }
  }
  return out
}

// What a JobScout-paid stub must match exactly.
const EXACT = ['regular_hours', 'overtime_hours', 'pto_hours', 'gross_pay', 'commission_pay', 'bonus_pay', 'federal_income_tax', 'state_income_tax', 'social_security_employee', 'medicare_employee', 'additional_medicare', 'futa', 'sui', 'pre_tax_deductions', 'post_tax_deductions', 'net_pay']

function diffs(expected, got, fields) {
  const out = []
  for (const s of expected) {
    const g = got[s.employee_id]
    // A zero stub for a card that is off today: the page stubbed everyone
    // active that morning, and nothing was paid.
    if (!g) { if (s.gross_pay !== 0) out.push(`emp_${s.employee_id}: paid ${s.gross_pay} gross, engine has no such employee`); continue }
    for (const f of fields) {
      if (Math.abs((s[f] || 0) - (g[f] || 0)) > 0.005) out.push(`emp_${s.employee_id} ${f}: paid ${s[f]}, engine ${g[f]}`)
    }
  }
  // Someone the engine would pay who got no stub.
  for (const [id, g] of Object.entries(got)) {
    if (g.gross_pay > 0 && !expected.some(s => String(s.employee_id) === String(id))) out.push(`emp_${id}: no stub was paid, engine says ${g.gross_pay} gross`)
  }
  return out
}

describe('golden replays', () => {
  it('has at least one fixture to replay', () => {
    expect(dirs.length).toBeGreaterThan(0)
  })

  for (const d of dirs) {
    const inputs = load(d, 'inputs.json')
    const expected = load(d, 'expected.json')
    const gusto = expected.meta.source === 'gusto'

    // Differences that are understood and meant: the engine was corrected
    // after this run was paid (Utah's withholding schedule on 5 Oct, for
    // one), so the stub is what went out and the engine is what should have.
    // Each is listed in accepted.json with its reason; a difference not on
    // the list fails, and so does a listed one that has gone away, because
    // either means the engine moved without anyone deciding it should.
    const accepted = (existsSync(join(root, d, 'accepted.json')) ? load(d, 'accepted.json') : []).filter(a => a.diff)

    it(`${d}: ${gusto ? 'JobScout inputs against what Gusto paid' : 'the engine reproduces every stub to the cent, except where it was corrected since'}`, () => {
      const got = replayFixture(inputs)
      const all = diffs(expected.stubs, got, EXACT)
      if (gusto) {
        // Hours were typed into Gusto; the comparison is informational.
        if (all.length) console.log(`[golden ${d}] ${all.length} difference(s) vs Gusto:\n  ${all.join('\n  ')}`)
        return
      }
      // An accepted line is the whole line, figures included: the engine
      // moving from one wrong number to another is still a move.
      const unexplained = all.filter(line => !accepted.some(a => line === a.diff))
      const stale = accepted.filter(a => !all.includes(a.diff)).map(a => `${a.diff} (accepted: ${a.reason}) no longer differs`)
      expect(unexplained, `${d}: not accepted:\n  ${unexplained.join('\n  ')}`).toEqual([])
      expect(stale, `${d}: accepted differences that have gone away:\n  ${stale.join('\n  ')}`).toEqual([])
    })
  }
})
