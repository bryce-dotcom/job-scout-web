import { describe, it, expect } from 'vitest'
import { parseSalesTaxConfig, computeSalesTax, lineIsTaxable, salesTaxSummary } from './salesTax'

describe('parseSalesTaxConfig', () => {
  it('is off unless enabled with a positive rate', () => {
    expect(parseSalesTaxConfig(null).enabled).toBe(false)
    expect(parseSalesTaxConfig(JSON.stringify({ enabled: true, rate: 0 })).enabled).toBe(false)
    expect(parseSalesTaxConfig(JSON.stringify({ enabled: true, rate: '7.25', jurisdiction: 'SLC', apply_to: 'materials' })))
      .toEqual({ enabled: true, rate: 7.25, jurisdiction: 'SLC', apply_to: 'materials' })
    expect(parseSalesTaxConfig('{bad').enabled).toBe(false)
  })
})

describe('computeSalesTax', () => {
  const cfg = { enabled: true, rate: 7.25, apply_to: 'all' }
  it('taxes taxable lines only, by line total', () => {
    const r = computeSalesTax([
      { line_total: 100 },
      { line_total: 50, taxable: false },
      { total: 20 },                       // job-line spelling
      { quantity: 2, unit_price: 5 },      // no stored total
    ], cfg)
    expect(r).toEqual({ rate: 7.25, taxableSubtotal: 130, tax: 9.43 })
  })
  it('materials-only jurisdictions skip labor by product flag or line labor', () => {
    const products = new Map([[1, { material_or_labor: 'material' }], [2, { material_or_labor: 'labor' }]])
    const mcfg = { ...cfg, apply_to: 'materials' }
    expect(lineIsTaxable({ item_id: 2 }, mcfg, products.get(2))).toBe(false)
    const r = computeSalesTax([{ item_id: 1, line_total: 100 }, { item_id: 2, line_total: 300 }], mcfg, products)
    expect(r.taxableSubtotal).toBe(100)
  })
  it('is zero when disabled', () => {
    expect(computeSalesTax([{ line_total: 100 }], { enabled: false, rate: 7 })).toEqual({ rate: 0, taxableSubtotal: 0, tax: 0 })
  })
})

describe('salesTaxSummary', () => {
  const inSep = (d) => String(d || '').startsWith('2026-09')
  const invoices = [
    { id: 1, tax_amount: 72.5, payment_status: 'Paid', invoice_date: '2026-08-28' },
    { id: 2, tax_amount: 10, payment_status: 'Sent', invoice_date: '2026-09-05' },
    { id: 3, tax_amount: 0, payment_status: 'Paid', invoice_date: '2026-09-06' },
  ]
  const payments = [{ invoice_id: 1, date: '2026-09-03', amount: 1000 }]
  it('cash: collected when paid; accrual: when invoiced; remitted from sales-tax expenses', () => {
    const cash = salesTaxSummary({ invoices, payments, manualExpenses: [{ expense_date: '2026-09-20', amount: 40, description: 'Sales tax remittance Q2' }] }, inSep, 'cash')
    expect(cash).toEqual({ collected: 72.5, remitted: 40, owed: 32.5, invoicesWithTax: 1 })
    const accrual = salesTaxSummary({ invoices, payments }, inSep, 'accrual')
    expect(accrual.collected).toBe(10)
  })
})
