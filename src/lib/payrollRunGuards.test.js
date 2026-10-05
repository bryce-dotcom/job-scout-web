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

  it('warns when a check crosses a wage cap', () => {
    const { warnings } = payrollRunGuards({ ...period, employees: [cameron], employeePayData: { 37: { grossPay: 3000, regularHours: 80, overtimeHours: 0, netPay: 2400 } },
      ytdGrossByEmployee: { 37: 6000 }, suiWageBase: 50700 })
    expect(warnings.map(w => w.key)).toEqual(['futacap:37'])
    const ss = payrollRunGuards({ ...period, employees: [cameron], employeePayData: { 37: { grossPay: 3000, regularHours: 80, overtimeHours: 0, netPay: 2400 } }, ytdGrossByEmployee: { 37: 183000 } })
    expect(ss.warnings.map(w => w.key)).toEqual(['sscap:37'])
  })
})
