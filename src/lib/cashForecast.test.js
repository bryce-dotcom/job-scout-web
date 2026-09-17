import { describe, it, expect } from 'vitest'
import { buildForecast, weeklyBuckets } from './cashForecast'

const today = new Date('2026-09-17T12:00:00')

describe('buildForecast', () => {
  it('schedules invoices on their due date, overdue ones two weeks out, and bills by due date', () => {
    const f = buildForecast({
      today, openingCash: 10000,
      invoices: [
        { id: 1, invoice_id: 'INV-1', amount: 1000, discount_applied: 0, payment_status: 'Sent', due_date: '2026-10-01', customer: { name: 'Dana' } },
        { id: 2, invoice_id: 'INV-2', amount: 500, discount_applied: 0, payment_status: 'Partially Paid', due_date: '2026-09-01' },
        { id: 3, invoice_id: 'INV-3', amount: 700, discount_applied: 0, payment_status: 'Paid', due_date: '2026-09-20' },
      ],
      payments: [{ invoice_id: 2, amount: 200 }],
      bills: [{ id: 9, bill_number: 'B-9', balance_due: 400, due_date: '2026-09-25', status: 'open', vendor: { name: 'Acme Supply' } }],
    })
    const inv1 = f.events.find(e => e.ref === 1 && e.kind === 'invoice')
    expect(inv1).toMatchObject({ date: '2026-10-01', amount: 1000, confidence: 'likely' })
    const inv2 = f.events.find(e => e.ref === 2 && e.kind === 'invoice')
    expect(inv2).toMatchObject({ date: '2026-10-01', amount: 300, confidence: 'overdue' })
    expect(f.events.some(e => e.ref === 3)).toBe(false)
    expect(f.events.find(e => e.kind === 'bill')).toMatchObject({ date: '2026-09-25', amount: -400 })
    expect(f.closing).toBe(10000 + 1000 + 300 - 400)
    expect(f.series[0].date).toBe('2026-09-17')
    expect(f.series).toHaveLength(91)
  })

  it('projects payroll on upcoming pay dates from the last runs, grossed up for employer tax', () => {
    const f = buildForecast({
      today, openingCash: 50000,
      payrollConfig: { pay_frequency: 'semi-monthly', pay_day_1: 20, pay_day_2: 5 },
      payrollRuns: [{ id: 1, pay_date: '2026-09-05', total_gross: 8000 }, { id: 2, pay_date: '2026-08-20', total_gross: 8000 }],
      paystubs: [{ payroll_run_id: 1, gross_pay: 8000, social_security_employer: 496, medicare_employer: 116 }, { payroll_run_id: 2, gross_pay: 8000, social_security_employer: 496, medicare_employer: 116 }],
    })
    const pay = f.events.filter(e => e.kind === 'payroll')
    expect(pay.length).toBeGreaterThanOrEqual(4)
    expect(pay[0].amount).toBe(-8612)
    expect(pay.every(e => e.confidence === 'estimate')).toBe(true)
    expect(new Set(pay.map(e => e.date)).size).toBe(pay.length)
  })

  it('uses trailing bank spend as a daily baseline, ignoring transfers, payroll and bill-sized rows', () => {
    const plaid = [
      { amount: 900, date: '2026-09-01', name: 'HOME DEPOT' },
      { amount: 5000, date: '2026-09-02', name: 'TRANSFER', is_transfer: true },
      { amount: 4000, date: '2026-09-03', name: 'GUSTO PAY' },
      { amount: 400, date: '2026-09-04', name: 'ACME SUPPLY' },   // matches a bill amount
      { amount: 200, date: '2026-05-01', name: 'OLD' },            // outside trailing 90d
    ]
    const f = buildForecast({ today, openingCash: 0, plaidTransactions: plaid, bills: [{ amount: 400, balance_due: 0, status: 'paid' }] })
    expect(f.baselineDailyBurn).toBe(10)
    expect(f.series[1].out).toBe(10)
    expect(f.closing).toBe(-900)
  })

  it('finds the low point and counts days under the floor', () => {
    const f = buildForecast({ today, openingCash: 100, cashFloor: 50, bills: [{ balance_due: 80, due_date: '2026-09-20', status: 'open' }], invoices: [{ id: 1, amount: 500, discount_applied: 0, payment_status: 'Sent', due_date: '2026-09-30' }] })
    expect(f.low).toEqual({ date: '2026-09-20', balance: 20 })
    expect(f.daysBelowFloor).toBe(10)
    expect(f.closing).toBe(520)
  })

  it('weekly buckets summarize the series', () => {
    const f = buildForecast({ today, openingCash: 1000 })
    const w = weeklyBuckets(f.series)
    expect(w).toHaveLength(13)
    expect(w[0].from).toBe('2026-09-17')
    expect(w[0].end).toBe(1000)
  })
})
