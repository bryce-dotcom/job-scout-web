import { describe, it, expect } from 'vitest'
import { buildInvoiceLineRows } from './invoiceLines'

// Locks the behaviour the five drifted copies disagreed about. Each test
// below corresponds to a real difference measured between them.

const OPTS = { companyId: 3, invoiceId: 555 }
const build = (lines, opts = OPTS) => buildInvoiceLineRows(lines, opts)

describe('line totals — the stored total wins', () => {
  it('uses the stored total, not quantity x price', () => {
    // A discounted line: 10 x $100 = $1,000 list, but $900 was agreed.
    const [row] = build([{ quantity: 10, price: 100, discount: 100, total: 900 }])
    expect(row.line_total).toBe(900)
  })

  it('falls back to quantity x price only when no total is stored', () => {
    const [row] = build([{ quantity: 3, price: 50 }])
    expect(row.line_total).toBe(150)
  })

  it('honours a stored total of exactly zero (a comped line)', () => {
    // `parseFloat(0) || fallback` would wrongly compute 250 here.
    const [row] = build([{ quantity: 5, price: 50, total: 0 }])
    expect(row.line_total).toBe(0)
  })

  it('accepts the total aliased as line_total', () => {
    // FieldScout and Invoices select it as `line_total:total`. Reading only
    // `total` would silently fall back to quantity x price for both.
    const [row] = build([{ quantity: 10, price: 100, line_total: 900 }])
    expect(row.line_total).toBe(900)
  })

  it('prefers total over line_total when a caller supplies both', () => {
    const [row] = build([{ quantity: 2, price: 10, line_total: 9999, total: 20 }])
    expect(row.line_total).toBe(20)
  })
})

describe('description — never bill a customer for "Item"', () => {
  it('prefers the line description', () => {
    expect(build([{ description: '40W Highbay', item_name: 'X' }])[0].description).toBe('40W Highbay')
  })

  it('falls back to the joined product name', () => {
    expect(build([{ item: { name: 'Joined Name' } }])[0].description).toBe('Joined Name')
  })

  it('falls back to item_name on a raw job_lines row', () => {
    // FieldScout and Invoices pass raw rows; this fallback is what they lost.
    expect(build([{ item_name: 'Raw Name' }])[0].description).toBe('Raw Name')
  })

  it('only says "Item" when there is genuinely no name anywhere', () => {
    expect(build([{ quantity: 1, price: 5 }])[0].description).toBe('Item')
  })
})

describe('labor_cost — carried through so PDFs can split Parts vs Labor', () => {
  it('carries a real labor cost', () => {
    expect(build([{ labor_cost: 125.5 }])[0].labor_cost).toBe(125.5)
  })

  it('defaults to 0 rather than null or undefined', () => {
    expect(build([{ quantity: 1 }])[0].labor_cost).toBe(0)
  })
})

describe('in_utility_scope — the out-of-scope invoice section', () => {
  it('defaults to in-scope when the flag is absent', () => {
    expect(build([{ description: 'A' }])[0].in_utility_scope).toBe(true)
  })

  it('preserves an explicit out-of-scope add-on', () => {
    expect(build([{ description: 'Extended Coverage', in_utility_scope: false }])[0].in_utility_scope).toBe(false)
  })

  it('treats null as in-scope, not out-of-scope', () => {
    // Only an explicit false means out-of-scope; a null column must not
    // silently move work into "Additional Services".
    expect(build([{ description: 'A', in_utility_scope: null }])[0].in_utility_scope).toBe(true)
  })
})

describe('row shape and ordering', () => {
  it('numbers lines from 1 and sorts from 0', () => {
    const rows = build([{ description: 'A' }, { description: 'B' }])
    expect(rows.map(r => r.line_number)).toEqual([1, 2])
    expect(rows.map(r => r.sort_order)).toEqual([0, 1])
  })

  it('stamps company and invoice on every row', () => {
    for (const r of build([{ description: 'A' }, { description: 'B' }])) {
      expect(r.company_id).toBe(3)
      expect(r.invoice_id).toBe(555)
    }
  })

  it('writes exactly the columns invoice_lines has', () => {
    // Guards against a stray property causing a PostgREST insert to fail.
    expect(Object.keys(build([{ description: 'A' }])[0]).sort()).toEqual([
      'company_id', 'description', 'discount', 'in_utility_scope', 'invoice_id',
      'item_id', 'labor_cost', 'line_number', 'line_total', 'quantity',
      'sort_order', 'unit_price',
    ])
  })

  it('defaults quantity to 1 and price to 0', () => {
    const [row] = build([{ description: 'A' }])
    expect(row.quantity).toBe(1)
    expect(row.unit_price).toBe(0)
  })

  it('keeps a zero quantity rather than coercing it to 1', () => {
    expect(build([{ description: 'A', quantity: 0, total: 0 }])[0].quantity).toBe(0)
  })
})

describe('refuses to build junk', () => {
  it('returns nothing when there are no lines', () => {
    expect(build([])).toEqual([])
    expect(build(null)).toEqual([])
    expect(build(undefined)).toEqual([])
  })

  it('returns nothing without an invoice id, rather than orphan rows', () => {
    expect(build([{ description: 'A' }], { companyId: 3, invoiceId: null })).toEqual([])
  })

  it('produces finite numbers from junk input', () => {
    const [row] = build([{ quantity: 'x', price: 'y', discount: 'z', labor_cost: 'w' }])
    expect(Number.isFinite(row.unit_price)).toBe(true)
    expect(Number.isFinite(row.line_total)).toBe(true)
    expect(Number.isFinite(row.discount)).toBe(true)
    expect(Number.isFinite(row.labor_cost)).toBe(true)
  })
})
