import { describe, it, expect } from 'vitest'
import {
  setterCommissionSummary, SETTER_RULE_ON_SET, SETTER_RULE_ON_QUOTE,
} from './setterCommissions'

const appt = (id, employee_id, amount, payment_status) =>
  ({ id, employee_id, amount, payment_status, commission_type: 'appointment_set' })
const source = (id, employee_id, amount, payment_status = 'pending') =>
  ({ id, employee_id, amount, payment_status, commission_type: 'lead_source' })

describe('who the rows belong to', () => {
  it('never counts another employee', () => {
    const rows = [appt(1, 7, 25, 'pending'), appt(2, 8, 25, 'pending')]
    expect(setterCommissionSummary(rows, 7).total).toBe(25)
    expect(setterCommissionSummary(rows, 8).total).toBe(25)
  })

  it('survives junk rows', () => {
    expect(setterCommissionSummary([null, undefined, {}], 7).total).toBe(0)
    expect(setterCommissionSummary(null, 7).details).toEqual([])
  })
})

describe('paid rows leave the payable set', () => {
  // A commission paid on one run must not be payable again on the next.
  const rows = [appt(1, 7, 25, 'pending'), appt(2, 7, 25, 'paid')]

  it('excludes them from the total', () => {
    expect(setterCommissionSummary(rows, 7).total).toBe(25)
  })

  it('still reports them so they are not silently gone', () => {
    const s = setterCommissionSummary(rows, 7)
    expect(s.paidCount).toBe(1)
    expect(s.paidTotal).toBe(25)
  })
})

describe('the qualification rule', () => {
  const rows = [
    appt(1, 7, 25, 'pending'),
    appt(2, 7, 25, 'earned'),
    source(3, 7, 10),
  ]

  it('pays every booked appointment under the default rule', () => {
    const s = setterCommissionSummary(rows, 7, SETTER_RULE_ON_SET)
    expect(s.apptCount).toBe(2)
    expect(s.total).toBe(60)        // 25 + 25 + 10 source
    expect(s.pendingCount).toBe(0)
  })

  it('pays only quote-qualified appointments under quote_created', () => {
    const s = setterCommissionSummary(rows, 7, SETTER_RULE_ON_QUOTE)
    expect(s.apptCount).toBe(1)
    expect(s.total).toBe(35)        // 25 earned + 10 source
    expect(s.pendingCount).toBe(1)
    expect(s.pendingAmount).toBe(25)
  })

  it('always pays lead-source rows regardless of rule', () => {
    const onlySource = [source(9, 7, 40)]
    expect(setterCommissionSummary(onlySource, 7, SETTER_RULE_ON_QUOTE).total).toBe(40)
    expect(setterCommissionSummary(onlySource, 7, SETTER_RULE_ON_SET).total).toBe(40)
  })
})

describe('details is the payable set', () => {
  it('matches the total exactly, so a per-row Mark paid cannot disagree', () => {
    // Payroll's per-item control pays `details`. If details and total ever
    // diverged, marking every row paid would leave a non-zero balance.
    const rows = [appt(1, 7, 25, 'pending'), appt(2, 7, 25, 'earned'), source(3, 7, 10), appt(4, 7, 99, 'paid')]
    for (const rule of [SETTER_RULE_ON_SET, SETTER_RULE_ON_QUOTE]) {
      const s = setterCommissionSummary(rows, 7, rule)
      const detailSum = s.details.reduce((t, c) => t + Number(c.amount), 0)
      expect(detailSum).toBe(s.total)
      expect(s.details.some(c => c.payment_status === 'paid')).toBe(false)
    }
  })
})
