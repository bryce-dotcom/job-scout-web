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

  it('Payroll pays the decision, not the sum', () => {
    expect(payroll).toMatch(/salaryPay = payBasis\.salaryPaid/)
    expect(payroll).toMatch(/const commissionPay = payBasis\.commissionPaid/)
  })

  it('Payroll shows the comparison in the review', () => {
    expect(payroll).toMatch(/greaterOfSummary\(data\.payBasis, fmt\)/)
  })

  it('the run marks the settled commissions as covered by the salary', () => {
    expect(payroll).toMatch(/covered: true/)   // the salary-won settle group
    // the rows weighed are the rows settled — not whatever a date filter
    // catches, because earned_at is a timestamp read as a local day
    expect(payroll).toMatch(/weighedCommissionRows/)
    expect(payroll).toMatch(/covered_by_salary: g\.covered/)
    // both commission tables, or a setter fee quietly pays twice
    expect(payroll).toMatch(/from\('rep_commissions'\)[\s\S]{0,300}covered_by_salary/)
    expect(payroll).toMatch(/from\('lead_commissions'\)[\s\S]{0,300}covered_by_salary/)
    // and the whole period counts for them, staged or not
    expect(payroll).toMatch(/greaterOf \? earnedSetter \+ earnedRep : queuedSetter \+ queuedRep/)
  })

  it('My Pay stops adding both halves together', () => {
    const myPay = read('src/pages/MyPay.jsx')
    expect(myPay).toMatch(/myPayBasis\.salaryPaid \+ ptoPay \+ myPayBasis\.commissionPaid/)
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
