import { describe, it, expect } from 'vitest'
import { contractorTotals } from './contractor1099'

describe('contractorTotals', () => {
  const employees = [
    { id: 1, name: 'Pat Sub', tax_classification: '1099', w9_signed_at: '2026-01-10' },
    { id: 2, name: 'Sam W2', tax_classification: 'W2' },
    { id: 3, name: 'Lee Small', tax_classification: '1099' },
  ]
  const paystubs = [
    { employee_id: 1, pay_date: '2026-03-05', gross_pay: 400 },
    { employee_id: 1, pay_date: '2026-06-05', gross_pay: 300 },
    { employee_id: 2, pay_date: '2026-06-05', gross_pay: 5000 },
    { employee_id: 3, pay_date: '2026-06-05', gross_pay: 200 },
    { employee_id: 1, pay_date: '2025-12-05', gross_pay: 9999 },
  ]
  const vendors = [{ id: 10, name: 'Acme Electric', is_1099: true, w9_signed_at: null, tin_last4: '1234' }, { id: 11, name: 'Home Depot', is_1099: false }]
  const bills = [{ id: 100, vendor_id: 10 }, { id: 101, vendor_id: 11 }]
  const billPayments = [{ bill_id: 100, paid_at: '2026-04-01T00:00:00Z', amount: 450 }, { bill_id: 101, paid_at: '2026-04-01T00:00:00Z', amount: 8000 }]
  const manualExpenses = [
    { expense_date: '2026-05-01', amount: 250, payee_vendor_id: 10 },
    { expense_date: '2026-05-02', amount: 100, payee_employee_id: 1 },
    { expense_date: '2026-05-03', amount: 50, payee_employee_id: 2 },
  ]

  it('totals contractors and 1099 vendors across payroll, bills and expenses, flags the $600 threshold and missing W-9s', () => {
    const r = contractorTotals({ employees, paystubs, manualExpenses, vendors, bills, billPayments }, 2026)
    expect(r.rows.map(x => [x.kind, x.name, x.total, x.needs1099])).toEqual([
      ['contractor', 'Pat Sub', 800, true],
      ['vendor', 'Acme Electric', 700, true],
      ['contractor', 'Lee Small', 200, false],
    ])
    expect(r.rows[0].sources).toEqual({ payroll: 700, expenses: 100 })
    expect(r.missingW9.map(x => x.name)).toEqual(['Acme Electric'])
    expect(r.total).toBe(1700)
  })
})
