import { describe, it, expect } from 'vitest'
import { groupRemittance, remittanceTotal } from './payrollRemittance'

describe('remittance buckets', () => {
  const row = (kind, amount_employer, extra = {}) => ({ id: Math.random(), kind, amount_employee: 0, amount_employer, amount_total: amount_employer, agency: 'Utah DWS', due_date: '2026-10-31', ...extra })

  it('rolls the three federal kinds into one 941 deposit and keeps SUI separate', () => {
    const b = groupRemittance([
      { id: 1, kind: 'federal_income_tax', amount_total: 100, agency: 'IRS', due_date: '2026-10-15' },
      { id: 2, kind: 'social_security', amount_total: 62, agency: 'IRS', due_date: '2026-10-15' },
      { id: 3, kind: 'medicare', amount_total: 14.5, agency: 'IRS', due_date: '2026-10-15' },
      row('sui', 36),
    ])
    expect(b.map(x => [x.id, x.amount])).toEqual([['federal_941', 176.5], ['state_ui', 36]])
    expect(remittanceTotal(b)).toBe(212.5)
  })

  it('keeps an SUI true-up credit as a negative bucket instead of dropping it', () => {
    const b = groupRemittance([row('sui', -468, { payroll_run_id: null })])
    expect(b).toHaveLength(1)
    expect(b[0]).toMatchObject({ id: 'state_ui', amount: -468, credit: true })
  })

  it('nets a credit against the same bucket and drops a bucket that nets to zero', () => {
    expect(groupRemittance([row('sui', 36), row('sui', -36)])).toEqual([])
    expect(groupRemittance([row('sui', 50), row('sui', -14)])[0]).toMatchObject({ amount: 36, credit: false })
  })
})
