import { describe, it, expect } from 'vitest'
import { expenseFieldsFromReceipt, receiptSummary, fillBlanks } from './receiptReader'

const cats = [
  { name: 'Job Materials', type: 'expense', default_tax_category: 'Line 2 - Cost of goods sold' },
  { name: 'Fuel', type: 'expense', default_tax_category: 'Line 20 - Auto expenses' },
  { name: 'Meals', type: 'expense', default_tax_category: 'Line 20 - Meals' },
]

describe('what Dougie read becomes expense fields', () => {
  it('maps merchant, total, date, description, receipt number, and the category with its tax line', () => {
    const f = expenseFieldsFromReceipt({
      business_name: ' Lowes ', amount: '389.424', subtotal: 362.1, tax: 27.32, date: '2026-09-12',
      receipt_number: 'R-4471', description: 'LED high bays and hangers', category: 'Job Materials',
      line_items: [{ description: '2x4 LED high bay', quantity: 6, amount: 330 }, { description: 'hangers', quantity: null, amount: '32.10' }, null],
      job_hint: 'PO 2147',
    }, cats)
    expect(f).toEqual({
      merchant: 'Lowes', amount: 389.42, date: '2026-09-12', description: 'LED high bays and hangers', receipt: 'R-4471',
      category: 'Job Materials', tax_category: 'Line 2 - Cost of goods sold',
      line_items: [{ description: '2x4 LED high bay', quantity: 6, amount: 330 }, { description: 'hangers', quantity: null, amount: 32.1 }],
      job_hint: 'PO 2147',
    })
  })

  it('matches the category name case-insensitively and drops one the company does not have', () => {
    expect(expenseFieldsFromReceipt({ category: 'fuel' }, cats)).toEqual({ category: 'Fuel', tax_category: 'Line 20 - Auto expenses' })
    expect(expenseFieldsFromReceipt({ category: 'Groceries' }, cats)).toEqual({})
  })

  it('leaves out what he could not read instead of writing nulls or zero', () => {
    expect(expenseFieldsFromReceipt({ business_name: null, amount: null, date: 'Sept 12', description: '' }, cats)).toEqual({})
    expect(expenseFieldsFromReceipt({ amount: 0 }, cats)).toEqual({})
    expect(expenseFieldsFromReceipt(null, cats)).toEqual({})
  })

  it('summarises for a toast', () => {
    expect(receiptSummary({ merchant: 'Lowes', amount: 389.42, date: '2026-09-12', category: 'Job Materials' })).toBe('Lowes · $389.42 · 2026-09-12 · Job Materials')
    expect(receiptSummary({ merchant: 'Lowes' })).toBe('Lowes')
    expect(receiptSummary(null)).toBe('')
  })

  it('fills only the blanks on a form — what a person typed stays', () => {
    const form = { merchant: 'Home Depot', amount: '', date: '2026-09-01', category: '', tax_category: '', description: '' }
    const out = fillBlanks(form, { merchant: 'Lowes', amount: 389.42, date: '2026-09-12', category: 'Job Materials', tax_category: 'Line 2 - Cost of goods sold', line_items: [{}], job_hint: 'x' })
    expect(out).toEqual({ merchant: 'Home Depot', amount: '389.42', date: '2026-09-01', category: 'Job Materials', tax_category: 'Line 2 - Cost of goods sold', description: '' })
    expect(fillBlanks({ amount: '0' }, { amount: 12 }).amount).toBe('12')
  })
})
