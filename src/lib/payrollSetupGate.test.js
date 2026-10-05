import { describe, it, expect } from 'vitest'
import { payrollSetupProblems, setupGateSummary } from './payrollSetupGate'

// HHH as it was on 18 Sep 2026, when the first run went out.
const hhhBefore = {
  ein: '27-1896858', company_name: 'HHH Services, LLC', entity_type: 'Partnership',
  state_employer_id_state: 'UT', federal_deposit_schedule: null, state_employer_id: null,
  sui_account_number: 'C0090876-4', sui_rate_pct: 0.1,
}
const cfg = { pay_frequency: 'semi-monthly' }
const alayda = { id: 15, name: 'Alayda Westcott', is_hourly: true, hourly_rate: 23, w4_filing_status: 'single', tax_classification: 'W2' }
const aidan = { id: 57, name: 'Aidan Burr', is_hourly: true, hourly_rate: 18, w4_filing_status: null, tax_classification: 'W2' }
const cole = { id: 16, name: 'Cole Westcott', is_hourly: false, is_salary: false, tax_classification: '1099' }

describe('the setup gate', () => {
  it('names exactly what HHH was missing on its first run', () => {
    const keys = payrollSetupProblems({ company: hhhBefore, payrollConfig: cfg, employees: [alayda, aidan, cole] }).map(p => p.key)
    expect(keys).toEqual(['federal_deposit_schedule', 'state_employer_id', 'w4:57'])
  })

  it('is empty once the company is set up and every W-2 employee has a W-4', () => {
    const fixed = { ...hhhBefore, federal_deposit_schedule: 'semiweekly', state_employer_id: '15116898-004-WTH' }
    expect(payrollSetupProblems({ company: fixed, payrollConfig: cfg, employees: [alayda] })).toEqual([])
  })

  it('a missing W-4 can be acknowledged per employee, and only that employee', () => {
    const fixed = { ...hhhBefore, federal_deposit_schedule: 'semiweekly', state_employer_id: 'x' }
    const other = { ...aidan, id: 58, name: 'Someone Else' }
    const keys = payrollSetupProblems({ company: fixed, payrollConfig: cfg, employees: [aidan, other], w4Acknowledged: { 57: '2026-10-05' } }).map(p => p.key)
    expect(keys).toEqual(['w4:58'])
  })

  it('contractors need no W-4 and no pay type', () => {
    const fixed = { ...hhhBefore, federal_deposit_schedule: 'semiweekly', state_employer_id: 'x' }
    expect(payrollSetupProblems({ company: fixed, payrollConfig: cfg, employees: [cole] })).toEqual([])
  })

  it('a state with no income tax needs no withholding account', () => {
    const tx = { ...hhhBefore, federal_deposit_schedule: 'monthly', state_employer_id_state: 'TX', state_employer_id: null }
    expect(payrollSetupProblems({ company: tx, payrollConfig: cfg, employees: [] }).map(p => p.key)).toEqual([])
  })

  it('catches a person who would be paid nothing', () => {
    const fixed = { ...hhhBefore, federal_deposit_schedule: 'semiweekly', state_employer_id: 'x' }
    const noType = { id: 72, name: 'Damien Hargett', is_hourly: false, is_salary: false, w4_filing_status: 'single', tax_classification: 'W2' }
    const noRate = { id: 142, name: 'Kyle Springer', is_hourly: true, hourly_rate: 0, w4_filing_status: 'single', tax_classification: 'W2' }
    expect(payrollSetupProblems({ company: fixed, payrollConfig: cfg, employees: [noType, noRate] }).map(p => p.key)).toEqual(['pay_type:72', 'rate:142'])
  })

  it('an empty company is a long list, each item saying where it is fixed', () => {
    const problems = payrollSetupProblems({ company: {}, payrollConfig: {}, employees: [] })
    expect(problems.length).toBeGreaterThanOrEqual(7)
    for (const p of problems) expect(['company', 'tax', 'payroll', 'employee']).toContain(p.fix)
    expect(setupGateSummary(problems)).toMatch(/things to fix before this payroll can run/)
    expect(setupGateSummary([])).toBe('')
  })
})
