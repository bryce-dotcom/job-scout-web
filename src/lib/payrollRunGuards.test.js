import { describe, it, expect } from 'vitest'
import { payrollRunGuards, MAX_PUNCH_HOURS } from './payrollRunGuards'

const cameron = { id: 37, name: 'Cameron McDonough', is_hourly: true, hourly_rate: 22.5, tax_classification: 'W2' }
const period = { periodStart: '2026-06-16', periodEnd: '2026-06-30' }

describe('run guards', () => {
  it('blocks the 810-hour punch that became a $29,212 check', () => {
    const { blocks } = payrollRunGuards({ ...period, employees: [cameron], employeePayData: { 37: { grossPay: 29212.2, regularHours: 81.91, overtimeHours: 810.94, netPay: 16729 } },
      periodPunches: [{ id: 1, employee_id: 37, total_hours: 810.94 }, { id: 2, employee_id: 37, total_hours: 8.2 }] })
    expect(blocks.map(b => b.key)).toEqual(['punch:1'])
    expect(blocks[0].label).toMatch(/810\.9 hours/)
    expect(MAX_PUNCH_HOURS).toBe(16)
  })

  it('blocks a period that has already been run, and says which run', () => {
    const { blocks } = payrollRunGuards({ periodStart: '2026-07-16', periodEnd: '2026-07-31', employees: [], employeePayData: {},
      priorRuns: [{ id: 7, period_start: '2026-07-16', period_end: '2026-07-31', created_at: '2026-08-06T14:47:34Z' }] })
    expect(blocks).toHaveLength(1)
    expect(blocks[0].key).toBe('duplicate_period')
    expect(blocks[0].detail).toMatch(/run 7 on 2026-08-06/)
    expect(blocks[0].overridable).toBe(true)
  })

  it('warns about an open punch inside the period, since those hours are not in the run', () => {
    const { warnings, blocks } = payrollRunGuards({ ...period, employees: [cameron], employeePayData: { 37: { grossPay: 100, regularHours: 4, overtimeHours: 0, netPay: 90 } },
      openPunches: [{ id: 9, employee_id: 37, clock_in: '2026-06-20T14:00:00Z' }, { id: 10, employee_id: 37, clock_in: '2026-07-20T14:00:00Z' }] })
    expect(blocks).toHaveLength(0)
    expect(warnings.map(w => w.key)).toEqual(['open:9'])
  })

  it('warns when hours are far above the person\'s own usual', () => {
    const { warnings } = payrollRunGuards({ ...period, employees: [cameron], employeePayData: { 37: { grossPay: 4000, regularHours: 86, overtimeHours: 70, netPay: 3000 } },
      priorStubsByEmployee: { 37: [{ regular_hours: 80, overtime_hours: 2 }, { regular_hours: 78, overtime_hours: 0 }] } })
    expect(warnings.map(w => w.key)).toEqual(['hours:37'])
    expect(warnings[0].label).toMatch(/156\.0 hours, usually about 80/)
  })

  it('stays quiet for a normal period', () => {
    const r = payrollRunGuards({ ...period, employees: [cameron], employeePayData: { 37: { grossPay: 1800, regularHours: 80, overtimeHours: 0, netPay: 1500 } },
      periodPunches: [{ id: 1, employee_id: 37, total_hours: 8 }], priorStubsByEmployee: { 37: [{ regular_hours: 80 }, { regular_hours: 82 }] }, ytdGrossByEmployee: { 37: 30000 } })
    expect(r.blocks).toEqual([])
    expect(r.warnings).toEqual([])
  })

  it('blocks negative net pay and warns on hours with no pay type', () => {
    const noType = { id: 72, name: 'Damien Hargett', is_hourly: false, is_salary: false, tax_classification: 'W2' }
    const r = payrollRunGuards({ ...period, employees: [cameron, noType],
      employeePayData: { 37: { grossPay: 200, regularHours: 8, overtimeHours: 0, netPay: -50 }, 72: { grossPay: 0, regularHours: 30, overtimeHours: 0, netPay: 0 } } })
    expect(r.blocks.map(b => b.key)).toEqual(['negative:37'])
    expect(r.warnings.map(w => w.key)).toEqual(['unpaid:72'])
  })

  it('blocks a gross that is not the sum of its parts', () => {
    const { blocks } = payrollRunGuards({ ...period, employees: [cameron], employeePayData: { 37: { grossPay: 2000, hourlyPay: 1800, salaryPay: 0, ptoPay: 0, commissionPay: 0, bonusOwed: 0, regularHours: 80, overtimeHours: 0, netPay: 1500 } } })
    expect(blocks.map(b => b.key)).toEqual(['gross_parts:37'])
    const ok = payrollRunGuards({ ...period, employees: [cameron], employeePayData: { 37: { grossPay: 1800, hourlyPay: 1800, regularHours: 80, overtimeHours: 0, netPay: 1500 } } })
    expect(ok.blocks).toEqual([])
  })
  it('warns when the card rate is not the rate the last cheque paid', () => {
    const data = { 37: { grossPay: 1800, hourlyPay: 1800, regularHours: 80, overtimeHours: 0, netPay: 1500 } }
    const { warnings } = payrollRunGuards({ ...period, employees: [cameron], employeePayData: data,
      priorStubsByEmployee: { 37: [{ regular_hours: 80, hourly_rate: 30.1, pay_date: '2026-10-20' }, { regular_hours: 78, hourly_rate: 22.5, pay_date: '2026-09-20' }] } })
    expect(warnings.map(w => w.key)).toEqual(['rate:37'])
    expect(warnings[0].label).toMatch(/card says \$22\.50 an hour, the last cheque paid \$30\.10/)
    const same = payrollRunGuards({ ...period, employees: [cameron], employeePayData: data, priorStubsByEmployee: { 37: [{ regular_hours: 80, hourly_rate: 22.5, pay_date: '2026-10-20' }] } })
    expect(same.warnings).toEqual([])
  })
  it('says when a commission earned before the period is riding on this run', () => {
    const data = { 37: { grossPay: 1800, hourlyPay: 1800, regularHours: 80, overtimeHours: 0, netPay: 1500 } }
    const { blocks, warnings } = payrollRunGuards({ ...period, employees: [cameron], employeePayData: data,
      repCommissions: [
        { id: 1, employee_id: 37, amount: 500, payment_status: 'earned', earned_at: '2026-05-02T12:00:00Z' },
        { id: 2, employee_id: 37, amount: 700, payment_status: 'earned', earned_at: '2026-06-20T12:00:00Z' },
        { id: 3, employee_id: 37, amount: 900, payment_status: 'paid', earned_at: '2026-01-20T12:00:00Z' },
        { id: 4, employee_id: 37, amount: 250, payment_status: 'earned', held_from_payroll: true, earned_at: '2026-04-02T12:00:00Z' },
      ] })
    expect(blocks).toEqual([])
    // period starts 2026-06-16: the 20 June row is inside the period (nothing
    // to say), the 2 May row is 45 days back, on the edge, and rides
    expect(warnings.map(w => w.key)).toEqual(['unpaid_before:1'])
    expect(warnings[0].label).toMatch(/\$500\.00 earned 2026-05-02, before this period, is on this run/)
  })
  it('an unpaid commission older than the carry window is reported, not paid', () => {
    const data = { 37: { grossPay: 1800, hourlyPay: 1800, regularHours: 80, overtimeHours: 0, netPay: 1500 } }
    const { warnings } = payrollRunGuards({ ...period, employees: [cameron], employeePayData: data,
      repCommissions: [
        { id: 5, employee_id: 37, amount: 120, payment_status: 'earned', earned_at: '2026-03-01T12:00:00Z' },
        { id: 6, employee_id: 37, amount: 80, payment_status: 'earned', earned_at: '2026-02-01T12:00:00Z' },
        { id: 7, employee_id: 37, amount: 60, payment_status: 'earned', earned_at: '2026-01-10T12:00:00Z', queued_for_payroll: true },
      ] })
    expect(warnings.map(w => w.key)).toEqual(['unpaid_before:7', 'unpaid_old:37'])
    expect(warnings[1].label).toMatch(/2 commissions totalling \$200\.00, oldest 2026-02-01, still unpaid and not on this run/)
  })
  it('warns when a check crosses a wage cap', () => {
    const { warnings } = payrollRunGuards({ ...period, employees: [cameron], employeePayData: { 37: { grossPay: 3000, regularHours: 80, overtimeHours: 0, netPay: 2400 } },
      ytdGrossByEmployee: { 37: 6000 }, suiWageBase: 50700 })
    expect(warnings.map(w => w.key)).toEqual(['futacap:37'])
    const ss = payrollRunGuards({ ...period, employees: [cameron], employeePayData: { 37: { grossPay: 3000, regularHours: 80, overtimeHours: 0, netPay: 2400 } }, ytdGrossByEmployee: { 37: 183000 } })
    expect(ss.warnings.map(w => w.key)).toEqual(['sscap:37'])
  })
})
