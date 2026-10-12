import { describe, it, expect } from 'vitest'
import { benefitDeductionsForPeriod, perPaycheckAmount } from './benefitDeductions'
import { calcPaystubTax } from './payrollTax'

const row = (over) => ({ employee_id: 1, status: 'active', benefit_type: 'other', is_pre_tax: false, frequency: 'per_paycheck', employee_contribution: 7.5, employer_contribution: 0, ...over })

describe('benefitDeductionsForPeriod', () => {
  it('a $7.50 per-check post-tax deduction comes off the net and nothing else', () => {
    const d = benefitDeductionsForPeriod([row()], 1, 'semimonthly')
    expect(d.postTax).toBe(7.5)
    expect(d.section125).toBe(0)
    expect(d.retirement).toBe(0)
    expect(d.lines).toHaveLength(1)
  })
  it('spreads monthly and annual amounts over the pay periods', () => {
    expect(perPaycheckAmount(row({ frequency: 'monthly', employee_contribution: 120 }), 'semimonthly')).toBe(60)
    expect(perPaycheckAmount(row({ frequency: 'monthly', employee_contribution: 120 }), 'bi-weekly')).toBe(55.38)
    expect(perPaycheckAmount(row({ frequency: 'annual', employee_contribution: 2600 }), 'weekly')).toBe(50)
  })
  it('splits Section 125 from 401k, and ignores other people and ended rows', () => {
    const d = benefitDeductionsForPeriod([
      row({ benefit_type: 'health', is_pre_tax: true, employee_contribution: 100 }),
      row({ benefit_type: 'retirement_401k', is_pre_tax: true, employee_contribution: 50 }),
      row({ employee_id: 2, employee_contribution: 999 }),
      row({ status: 'ended', employee_contribution: 999 }),
    ], 1)
    expect(d.section125).toBe(100)
    expect(d.retirement).toBe(50)
    expect(d.preTaxTotal).toBe(150)
    expect(d.lines).toHaveLength(2)
  })
})

describe('calcPaystubTax with a 401k', () => {
  const employee = { w4_filing_status: 'single' }
  const company = { state_employer_id_state: 'UT', sui_rate_pct: 0.2, futa_rate_pct: 0.6 }
  it('a traditional 401k lowers income tax wages but not Social Security', () => {
    const base = calcPaystubTax({ employee, company, gross: 2000, payFrequency: 'semimonthly', payDate: '2026-10-20' })
    const k = calcPaystubTax({ employee, company, gross: 2000, payFrequency: 'semimonthly', payDate: '2026-10-20', preTaxRetirement: 100 })
    expect(k.socialSecurityEmployee).toBe(base.socialSecurityEmployee)
    expect(k.federalIncomeTax).toBeLessThan(base.federalIncomeTax)
    expect(k.taxableWages).toBe(1900)
    expect(k.preTaxDeductions).toBe(100)
    expect(k.netPay).toBe(Math.round((2000 - 100 - (k.federalIncomeTax + k.stateIncomeTax + k.socialSecurityEmployee + k.medicareEmployee)) * 100) / 100)
  })
  it('a post-tax deduction never takes the check below zero', () => {
    const t = calcPaystubTax({ employee, company, gross: 100, payFrequency: 'semimonthly', payDate: '2026-10-20', postTaxDeductions: 500 })
    expect(t.netPay).toBe(0)
    expect(t.postTaxDeductions).toBeLessThan(500)
    expect(t.postTaxDeductions).toBe(Math.round((100 - t.federalIncomeTax - t.stateIncomeTax - t.socialSecurityEmployee - t.medicareEmployee) * 100) / 100)
  })
  it('a Section 125 health deduction lowers both', () => {
    const base = calcPaystubTax({ employee, company, gross: 2000, payFrequency: 'semimonthly', payDate: '2026-10-20' })
    const h = calcPaystubTax({ employee, company, gross: 2000, payFrequency: 'semimonthly', payDate: '2026-10-20', preTaxDeductions: 100 })
    expect(h.socialSecurityEmployee).toBeLessThan(base.socialSecurityEmployee)
    expect(h.federalIncomeTax).toBeLessThan(base.federalIncomeTax)
  })
})
