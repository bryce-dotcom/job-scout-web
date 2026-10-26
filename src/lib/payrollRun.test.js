import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildRunPayload } from './payrollRun'

// The run is one transaction (docs/PAYROLL_PLAN.md step 4). The page shapes
// what it computed into one payload; process_payroll_run writes all of it or
// none of it. These pin the payload.

const periodStart = new Date(2026, 9, 1), periodEnd = new Date(2026, 9, 15), payDate = new Date(2026, 9, 20)
const employees = [
  { id: 1, pto_days_per_year: 10, pto_accrued: 2, pto_used: 0 },
  { id: 2, pto_days_per_year: 0, pto_accrued: 0, pto_used: 0 },
]
const stubs = [
  { company_id: 3, payroll_run_id: undefined, employee_id: 1, gross_pay: 1000, net_pay: 800 },
  { company_id: 3, employee_id: 2, gross_pay: 500, net_pay: 500 },
]
const base = () => buildRunPayload({
  companyId: 3, periodStart, periodEnd, payDate, createdBy: 9, paidBy: 7, totalGross: 1500.004,
  employees, payrollConfig: { pay_frequency: 'semi-monthly' }, stubs, ptoDaysFor: (id) => (id === 1 ? 1 : 0),
  settle: [{ covered: true, rep: [10, 11], lead: [] }, { covered: false, rep: [], lead: [] }],
  liabilities: [{ company_id: 3, payroll_run_id: null, jurisdiction: 'federal', agency: 'IRS', kind: 'medicare', amount_employee: 14.5, amount_employer: 14.5 }],
})

describe('buildRunPayload', () => {
  it('the run row carries the period, the payday, the gross to the cent and who ran it', () => {
    const p = base()
    expect(p.company_id).toBe(3)
    expect(p.run).toEqual({ period_start: '2026-10-01', period_end: '2026-10-15', pay_date: '2026-10-20', total_gross: 1500, employee_count: 2, created_by: 9 })
    expect(p.paid_by).toBe(7)
    expect(p.paid_at.slice(0, 10)).toBe(new Date(payDate).toISOString().slice(0, 10))
  })

  it('stubs and liabilities leave company and run ids to the function, and every stub carries the period', () => {
    const p = base()
    for (const s of p.stubs) {
      expect(s).not.toHaveProperty('company_id')
      expect(s).not.toHaveProperty('payroll_run_id')
      expect(s).toMatchObject({ period_start: '2026-10-01', period_end: '2026-10-15', pay_date: '2026-10-20' })
    }
    expect(p.liabilities).toEqual([{ jurisdiction: 'federal', agency: 'IRS', kind: 'medicare', amount_employee: 14.5, amount_employer: 14.5 }])
  })

  it('PTO moves only for people with an accrual or days paid, as the bank after the run', () => {
    const p = base()
    expect(p.pto_moves).toHaveLength(1)
    expect(p.pto_moves[0].employee_id).toBe(1)
    expect(p.pto_moves[0].pto_used).toBe(1)
    expect(p.pto_moves[0].pto_accrued).toBeGreaterThan(2)
  })

  it('marks everyone paid, and settles only the groups that weighed something', () => {
    const p = base()
    expect(p.paid_employee_ids).toEqual([1, 2])
    expect(p.settle).toEqual([{ covered: true, rep: [10, 11], lead: [] }])
  })

  it('names the commission rows the engine paid, so the function marks those and no others', () => {
    const p = buildRunPayload({ companyId: 3, periodStart, periodEnd, payDate, employees, stubs, paidCommissionRows: { rep: [5, 6, 6], lead: [9] } })
    expect(p.paid_rep_ids).toEqual([5, 6])
    expect(p.paid_lead_ids).toEqual([9])
    expect(base().paid_rep_ids).toEqual([])
  })
})

const here = dirname(fileURLToPath(import.meta.url))
describe('the page', () => {
  const payroll = readFileSync(resolve(here, '../..', 'src/pages/Payroll.jsx'), 'utf8')
  it('pays the people on the run, not the whole active list, so one side of the house can be run alone', () => {
    // Oct 2026: Gusto paid the W-2 people for two periods, nobody paid the
    // contractors; a run for everyone would have paid the W-2 wages twice.
    expect(payroll).toMatch(/const \[runScope, setRunScope\] = useState\('all'\)/)
    expect(payroll).toMatch(/const runEmployees = runScope === 'w2'/)
    const run = payroll.slice(payroll.indexOf('const handleRunPayroll = async'), payroll.indexOf('const cardStyle = {'))
    expect(run).toMatch(/const paystubs = runEmployees\.map/)
    expect(run).toMatch(/employees: runEmployees,/)
    expect(run).not.toMatch(/activeEmployees/)
    expect(payroll).toMatch(/employees: runEmployees, employeePayData: runPayData/)   // the guards see the same people
    expect(payroll).toMatch(/Who is on this run\?/)
  })

  it('runs payroll through the one function and no longer writes the pieces itself', () => {
    expect(payroll).toMatch(/supabase\.rpc\('process_payroll_run', \{ p: payload \}\)/)
    const run = payroll.slice(payroll.indexOf('const handleRunPayroll = async'), payroll.indexOf('const cardStyle = {'))
    expect(run).not.toMatch(/from\('payroll_runs'\)\s*\.insert/)
    expect(run).not.toMatch(/from\('paystubs'\)\.insert/)
    expect(run).not.toMatch(/from\('payroll_tax_liabilities'\)\s*\.insert/)
    expect(run).not.toMatch(/from\('job_bonuses'\)\s*\.update/)
  })
})
