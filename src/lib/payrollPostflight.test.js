import { describe, it, expect } from 'vitest'
import { postflightReport } from './payrollPostflight'

// A payroll is not done until the postflight says zero (docs/PAYROLL_PLAN.md step 5).

const payload = {
  run: { period_start: '2026-10-16', period_end: '2026-10-31', pay_date: '2026-11-05' },
  paid_employee_ids: [1, 2],
  paid_rep_ids: [9], paid_lead_ids: [],
  stubs: [
    { employee_id: 1, gross_pay: 2000, net_pay: 1600, bonus_pay: 300, federal_income_tax: 200, state_income_tax: 80, social_security_employee: 124, medicare_employee: 29, social_security_employer: 124, medicare_employer: 29, futa: 12, sui: 4 },
    { employee_id: 2, gross_pay: 1000, net_pay: 850, bonus_pay: 0, commission_pay: 400, federal_income_tax: 50, state_income_tax: 30, social_security_employee: 62, medicare_employee: 14.5, social_security_employer: 62, medicare_employer: 14.5, futa: 6, sui: 2 },
  ],
  liabilities: [
    { kind: 'federal_income_tax', amount_employee: 250, amount_employer: 0 },
    { kind: 'state_income_tax', amount_employee: 110, amount_employer: 0 },
    { kind: 'social_security', amount_employee: 186, amount_employer: 186 },
    { kind: 'medicare', amount_employee: 43.5, amount_employer: 43.5 },
    { kind: 'futa', amount_employee: 0, amount_employer: 18 },
    { kind: 'sui', amount_employee: 0, amount_employer: 6 },
  ],
  pto_moves: [{ employee_id: 1 }, { employee_id: 2 }],
}
const result = { run: { id: 50, total_gross: 3000, pay_date: '2026-11-05' }, rerun: false, counts: { stubs: 2, liabilities: 6, bonuses: 1, rep: 1, setter: 0, settled: 0, pto: 2 } }
const ledgerBonuses = [{ id: 7, employee_id: 1, amount: 300, status: 'accrued', queued_for_payroll: true, needs_verification: false }]
const repCommissions = [{ id: 9, employee_id: 2, amount: 400, payment_status: 'earned', queued_for_payroll: true, earned_at: '2026-10-20T12:00:00Z' }]

describe('postflightReport', () => {
  it('reconciles a clean run to zero exceptions and says what happened', () => {
    const r = postflightReport({ payload, result, ledgerBonuses, repCommissions, priorRuns: [{ id: 49, pay_date: '2026-10-20', total_gross: 2800 }] })
    expect(r.exceptions).toEqual([])
    expect(r.text).toMatch(/^No exceptions\./)
    expect(r.lines.join('\n')).toMatch(/2 stubs, \$3,000\.00 gross, \$2,450\.00 net/)
    expect(r.lines.join('\n')).toMatch(/last run \(2026-10-20\): \$2,800\.00 gross, this run \+7%/)
  })

  it('catches a stub total that is not the run total, and taxes that are not the liabilities', () => {
    const r = postflightReport({ payload, result: { ...result, run: { ...result.run, total_gross: 2999 } }, ledgerBonuses, repCommissions })
    expect(r.exceptions).toContain('stubs total $3,000.00 gross, the run says $2,999.00')
    const short = { ...payload, liabilities: payload.liabilities.slice(1) }
    const r2 = postflightReport({ payload: short, result: { ...result, counts: { ...result.counts, liabilities: 5 } }, ledgerBonuses, repCommissions })
    expect(r2.exceptions.some(x => /employee tax on stubs \$589\.50, in liabilities \$339\.50/.test(x))).toBe(true)
  })

  it('catches a ledger row closed that was on no stub, and one paid before it was earned', () => {
    const older = [...repCommissions, { id: 10, employee_id: 2, amount: 150, payment_status: 'earned', earned_at: '2026-09-02T12:00:00Z' }]
    const r = postflightReport({ payload: { ...payload, paid_rep_ids: [9, 10] }, result: { ...result, counts: { ...result.counts, rep: 2 } }, ledgerBonuses, repCommissions: older })
    // owed is owed: the older row rides on this run and is said, not flagged
    expect(r.lines).toContain('1 commission row(s) earned before the period paid on this run ($150.00)')
    expect(r.exceptions).toContain('commission rows paid total $550.00, on stubs only $400.00')
    const early = [...repCommissions, { id: 11, employee_id: 2, amount: 90, payment_status: 'earned', earned_at: '2026-11-02T12:00:00Z' }]
    const r2 = postflightReport({ payload: { ...payload, paid_rep_ids: [9, 11] }, result: { ...result, counts: { ...result.counts, rep: 2 } }, ledgerBonuses, repCommissions: early })
    expect(r2.exceptions).toContain('1 rep commission row(s) marked paid were earned after the period end ($90.00)')
  })

  it('catches marks that do not match what was payable', () => {
    const r = postflightReport({ payload, result: { ...result, counts: { ...result.counts, bonuses: 0, pto: 1 } }, ledgerBonuses, repCommissions })
    expect(r.exceptions).toContain('1 bonus rows were payable, 0 marked paid')
    expect(r.exceptions).toContain('2 PTO banks to move, 1 moved')
  })

  it('flags a gross that moved by half against the last run', () => {
    const r = postflightReport({ payload, result, ledgerBonuses, repCommissions, priorRuns: [{ id: 49, pay_date: '2026-10-20', total_gross: 9000 }] })
    expect(r.exceptions).toContain('gross moved -67% against the last run ($9,000.00)')
  })
})
