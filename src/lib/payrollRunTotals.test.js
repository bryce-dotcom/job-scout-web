import { describe, it, expect } from 'vitest'
import { summarizePayrollRun } from './payrollRunTotals'

// Sarah Chen on the demo, 12–25 Sep 2026, exactly as her check stub reads:
// gross 2,615.38; withheld 235.77 + 117.69 + 162.15 + 37.92; employer
// match 218.38; take-home 2,061.85; cost to the company 2,833.76.
const sarah = {
  grossPay: 2615.38, totalAdditions: 0, totalDeductions: 0, netPay: 2615.38,
  tax: {
    federalIncomeTax: 235.77, stateIncomeTax: 117.69,
    socialSecurityEmployee: 162.15, medicareEmployee: 37.92, additionalMedicare: 0,
    socialSecurityEmployer: 162.15, medicareEmployer: 37.92, futa: 15.69, sui: 2.62,
    totalEmployerCost: 2833.76, netPay: 2061.85,
  },
}
// A contractor: paid gross, nothing withheld, nothing matched.
const contractor = { grossPay: 1200, totalAdditions: 0, totalDeductions: 0, netPay: 1200, tax: null, is1099: true }

describe('what a payroll run costs and who gets the money', () => {
  it('the check is take-home, not gross', () => {
    const s = summarizePayrollRun({ 1: sarah })
    expect(s.checks).toBeCloseTo(2061.85, 2)
    expect(s.gross).toBeCloseTo(2615.38, 2)
  })

  it('federal is one deposit: income tax plus both halves of SS and Medicare', () => {
    const s = summarizePayrollRun({ 1: sarah })
    expect(s.federal).toBeCloseTo(235.77 + 162.15 + 162.15 + 37.92 + 37.92, 2)
    expect(s.state).toBeCloseTo(117.69, 2)
    expect(s.quarterly).toBeCloseTo(15.69 + 2.62, 2)
  })

  it('total cost is gross plus the employer taxes, and matches her stub', () => {
    const s = summarizePayrollRun({ 1: sarah })
    expect(s.employerTaxes).toBeCloseTo(218.38, 2)
    expect(s.totalCost).toBeCloseTo(2833.76, 2)
  })

  it('the lines add up to the total, so nothing is hiding', () => {
    const s = summarizePayrollRun({ 1: sarah, 2: contractor })
    expect(s.checks + s.federal + s.state + s.quarterly + s.deductions).toBeCloseTo(s.totalCost, 2)
  })

  it('a contractor is a check for the gross and no tax anywhere', () => {
    const s = summarizePayrollRun({ 2: contractor })
    expect(s.checks).toBe(1200)
    expect(s.federal).toBe(0)
    expect(s.employerTaxes).toBe(0)
    expect(s.totalCost).toBe(1200)
  })

  it('a post-tax deduction lowers the check but not the cost', () => {
    const withDeduction = { ...sarah, totalDeductions: 100, tax: { ...sarah.tax, netPay: 1961.85 } }
    const s = summarizePayrollRun({ 1: withDeduction })
    expect(s.checks).toBeCloseTo(1961.85, 2)
    expect(s.deductions).toBe(100)
    expect(s.totalCost).toBeCloseTo(2833.76, 2)
    expect(s.checks + s.federal + s.state + s.quarterly + s.deductions).toBeCloseTo(s.totalCost, 2)
  })

  it('an empty run is all zeros', () => {
    expect(summarizePayrollRun({}).totalCost).toBe(0)
  })
})
