import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { greaterOfPay, paysGreaterOf, greaterOfSummary } from './payBasis'

// "Salary or Commission whichever is more... when the salary is bigger than
// the commissions then the payroll should indicate and indicate that these
// commissions were paid" (Bryce, 5 Oct 2026). Doug and Christopher are on it.

const ON = { pay_greater_of_salary_commission: true }

describe('which half pays', () => {
  it('pays the salary when it beats the commission, and settles the commission', () => {
    const d = greaterOfPay({ salaryPay: 3500, commissionPay: 1200, enabled: true })
    expect(d.basis).toBe('salary')
    expect(d.salaryPaid).toBe(3500)
    expect(d.commissionPaid).toBe(0)
    expect(d.commissionCovered).toBe(1200)   // settled, not paid on top
    expect(d.margin).toBe(2300)
  })

  it('pays the commission when it beats the salary, and the salary is not paid as well', () => {
    const d = greaterOfPay({ salaryPay: 3500, commissionPay: 9000, enabled: true })
    expect(d.basis).toBe('commission')
    expect(d.commissionPaid).toBe(9000)
    expect(d.salaryPaid).toBe(0)
    expect(d.commissionCovered).toBe(0)
    expect(d.margin).toBe(5500)
  })

  it('never pays both halves of the same period', () => {
    for (const [s, c] of [[3500, 1200], [3500, 9000], [0, 500], [500, 0], [1000, 1000]]) {
      const d = greaterOfPay({ salaryPay: s, commissionPay: c, enabled: true })
      expect(Math.min(d.salaryPaid, d.commissionPaid)).toBe(0)
      expect(d.salaryPaid + d.commissionPaid).toBe(Math.max(s, c))
    }
  })

  it('gives a tie to the salary', () => {
    const d = greaterOfPay({ salaryPay: 2000, commissionPay: 2000, enabled: true })
    expect(d.basis).toBe('salary')
    expect(d.commissionCovered).toBe(2000)
    expect(d.margin).toBe(0)
  })

  it('leaves everyone else exactly as they were — both halves paid', () => {
    const d = greaterOfPay({ salaryPay: 3500, commissionPay: 1200, enabled: false })
    expect(d).toMatchObject({ enabled: false, basis: 'both', salaryPaid: 3500, commissionPaid: 1200, commissionCovered: 0 })
  })

  it('reads the flag off the employee row', () => {
    expect(paysGreaterOf(ON)).toBe(true)
    expect(paysGreaterOf({})).toBe(false)
    expect(paysGreaterOf(null)).toBe(false)
  })

  it('rounds to cents and survives junk', () => {
    const d = greaterOfPay({ salaryPay: '1000.005', commissionPay: null, enabled: true })
    expect(d.salaryPaid).toBe(1000.01)
    expect(d.commissionCovered).toBe(0)
    expect(greaterOfPay().basis).toBe('both')
  })
})

describe('what payroll says about it', () => {
  it('names both numbers and which one won', () => {
    const s = greaterOfSummary(greaterOfPay({ salaryPay: 3500, commissionPay: 1200, enabled: true }))
    expect(s).toContain('$3500.00')
    expect(s).toContain('$1200.00')
    expect(s).toMatch(/settled by it/)
  })

  it('says the salary is not paid as well when commission wins', () => {
    const s = greaterOfSummary(greaterOfPay({ salaryPay: 3500, commissionPay: 9000, enabled: true }))
    expect(s).toMatch(/Commission \$9000\.00 beats the salary \$3500\.00/)
    expect(s).toMatch(/salary is not paid as well/)
  })

  it('does not pretend a commission existed when none did', () => {
    const s = greaterOfSummary(greaterOfPay({ salaryPay: 3500, commissionPay: 0, enabled: true }))
    expect(s).toMatch(/No commission earned this period/)
  })

  it('says nothing for an employee not on the arrangement', () => {
    expect(greaterOfSummary(greaterOfPay({ salaryPay: 100, commissionPay: 50 }))).toBeNull()
  })
})

// Three surfaces have to agree, and the run has to close the commissions.
const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, '../..', p), 'utf8')

describe('the wiring', () => {
  const payroll = read('src/pages/Payroll.jsx')
  // The pay math moved out of the page into lib/payrollEngine (docs/PAYROLL_PLAN.md
  // step 2); the page gathers inputs and the engine decides. The decision lines
  // are therefore in the engine, the settle lines still in the page's run.
  const engine = read('src/lib/payrollEngine.js')

  it('Payroll pays the decision, not the sum', () => {
    expect(engine).toMatch(/salaryPay = payBasis\.salaryPaid/)
    expect(engine).toMatch(/const commissionPay = payBasis\.commissionPaid/)
    expect(payroll).toMatch(/computeEmployeePay\(/)
  })

  it('a contractor stub records the net that went out, adjustments included', () => {
    expect(payroll).toMatch(/net_pay:\s+data\.is1099 \? data\.netPay : \(t\.netPay \|\| data\.grossPay\)/)
  })

  it('Payroll shows the comparison in the review', () => {
    expect(payroll).toMatch(/greaterOfSummary\(data\.payBasis, fmt\)/)
  })

  it('the run marks the settled commissions as covered by the salary', () => {
    // the rows weighed are the rows settled — not whatever a date filter
    // catches, because earned_at is a timestamp read as a local day
    expect(payroll).toMatch(/weighedCommissionRows/)
    // the page says which outcome each group had; the one-transaction
    // function (process_payroll_run) writes it on both commission tables,
    // or a setter fee quietly pays twice
    expect(payroll).toMatch(/covered: data\.payBasis\?\.basis === 'salary'/)
    const sql = read('supabase/migrations/20261023200000_process_payroll_run.sql')
    expect(sql).toMatch(/update public\.rep_commissions[\s\S]{0,300}covered_by_salary = coalesce\(\(r->>'covered'\)::boolean/)
    expect(sql).toMatch(/update public\.lead_commissions[\s\S]{0,300}covered_by_salary = coalesce\(\(r->>'covered'\)::boolean/)
    // and the whole period counts for them, held or not
    expect(engine).toMatch(/greaterOf \? earnedSetter \+ earnedRep : sumAmt\(payableSetterRows\) \+ sumAmt\(payableRepRows\)/)
  })

  it('My Pay runs the same engine as Payroll, on the same inputs', () => {
    const myPay = read('src/pages/MyPay.jsx')
    // docs/PAYROLL_PLAN.md step 2: one engine, two screens. My Pay no longer
    // adds up its own gross or calls the tax engine on its own.
    expect(myPay).toMatch(/computeEmployeePay\(\{/)
    expect(myPay).not.toMatch(/calcPaystubTax\(/)
    expect(myPay).not.toMatch(/greaterOfPay\(/)
    // Every input Payroll's calculateFullPay passes, My Pay passes too.
    for (const key of ['timeEntries', 'timeLogEntries', 'payrollConfig', 'period:', 'payDate:', 'repCommissions', 'leadCommissionSummary:', 'invoiceCommissions:', 'bonusRows:', 'periodTimeOff', 'adjustments', 'benefits', 'ytd:', 'taxCompany:']) {
      expect(myPay, `My Pay passes ${key} to the engine`).toMatch(new RegExp(`computeEmployeePay\\(\\{[\\s\\S]{0,1400}${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))
    }
    // and both pages get those inputs from the one loader (lib/payrollLoader)
    expect(myPay).toMatch(/loadPayrollPeriod\(supabase, \{ companyId, period: \{ start: periodStart, end: periodEnd \}, employeeId: effectiveUserId \}\)/)
    expect(payroll).toMatch(/loadPayrollPeriod\(supabase, \{ companyId, period: \{ start: periodStart, end: periodEnd \} \}\)/)
    for (const src of [myPay, payroll]) {
      expect(src).not.toMatch(/from\('time_log'\)\s*\.select\('\*'\)/)
      expect(src).not.toMatch(/from\('payroll_adjustments'\)\s*\.select\('\*'\)/)
      expect(src).not.toMatch(/from\('employee_benefits'\)\s*\.select\(/)
    }
    // lib/setterCommissions keeps only rows carrying the viewer's id
    expect(myPay).toMatch(/from\('lead_commissions'\)[\s\S]{0,400}select\('[^']*employee_id[^']*queued_for_payroll/)
    expect(myPay).toMatch(/pay_greater_of_salary_commission/)   // and selects the column
  })

  it('the Employees form can switch it on, and only with both halves', () => {
    const emp = read('src/pages/Employees.jsx')
    expect(emp).toMatch(/Salary or commission — whichever is more/)
    expect(emp).toMatch(/pay_greater_of_salary_commission: !!\(formData\.pay_greater_of_salary_commission && formData\.is_salary && formData\.is_commission\)/)
  })

  it('the flag is guarded like every other pay column', () => {
    const sql = read('supabase/migrations/20261005190000_greater_of_salary_or_commission.sql')
    expect(sql).toMatch(/new\.pay_greater_of_salary_commission is distinct from old\.pay_greater_of_salary_commission/)
    expect(sql).toMatch(/add column if not exists covered_by_salary/)
  })
})

// The W-4 gate's wiring: payroll has to OFFER the employee's own form first.
describe('asking the employee for their W-4', () => {
  const payroll = read('src/pages/Payroll.jsx')

  it('payroll sends the onboarding link that collects it', () => {
    expect(payroll).toMatch(/functions\/v1\/send-onboarding-link/)
    expect(payroll).toMatch(/const askForW4 = async/)
  })

  it('and offers that before the withhold-as-single shortcut', () => {
    const ask = payroll.indexOf('askForW4(p.employeeId')
    const ack = payroll.indexOf('acknowledgeMissingW4(p.employeeId)', ask)
    expect(ask).toBeGreaterThan(-1)
    expect(ack).toBeGreaterThan(ask)   // the shortcut comes after it in the row
  })
})
