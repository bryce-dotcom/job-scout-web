import { describe, it, expect, vi } from 'vitest'
import {
  intakeLineRows, intakeLineSum, intakeTotal, intakeQuoteRow,
  validateIntake, intakeResidual, normalizeExtras,
  createEstimateFromIntake,
} from './estimateIntake'
import * as core from '../../supabase/functions/_shared/estimateIntake.ts'

const base = (over) => ({
  source: 'test', company_id: 3, lead_id: 4060,
  lines: [{ item_name: 'A', quantity: 2, price: 10 }],
  ...over,
})

describe('line rows', () => {
  it('derives line_total when the producer omits it', () => {
    const [r] = intakeLineRows(base(), 99)
    expect(r.line_total).toBe(20)
    expect(r.quote_id).toBe(99)
    expect(r.company_id).toBe(3)
  })
  it('trusts an explicit line_total over quantity x price', () => {
    // A carried total may include an override the caller already applied.
    const [r] = intakeLineRows(base({ lines: [{ item_name: 'A', quantity: 2, price: 10, line_total: 17.5 }] }), 1)
    expect(r.line_total).toBe(17.5)
  })
  it('always assigns sort_order — Lenard wrote 0 on every line', () => {
    const rows = intakeLineRows(base({
      lines: [{ item_name: 'A' }, { item_name: 'B' }, { item_name: 'C' }],
    }), 1)
    expect(rows.map(r => r.sort_order)).toEqual([0, 1, 2])
  })
  it('defaults quantity to 1', () => {
    expect(intakeLineRows(base({ lines: [{ item_name: 'A', price: 5 }] }), 1)[0].quantity).toBe(1)
  })
  it('carries the field notes and photos through', () => {
    const [r] = intakeLineRows(base({
      lines: [{ item_name: 'A', notes: 'ballast bypass needed', photos: ['p1.jpg'] }],
    }), 1)
    expect(r.notes).toBe('ballast bypass needed')
    expect(r.photos).toEqual(['p1.jpg'])
  })
  it('stores no photos rather than an empty array', () => {
    expect(intakeLineRows(base({ lines: [{ item_name: 'A', photos: [] }] }), 1)[0].photos).toBe(null)
  })
  it('defaults in_utility_scope true and preserves an explicit false', () => {
    const rows = intakeLineRows(base({
      lines: [{ item_name: 'A' }, { item_name: 'B', in_utility_scope: false }],
    }), 1)
    expect(rows[0].in_utility_scope).toBe(true)
    expect(rows[1].in_utility_scope).toBe(false)
  })
})

describe('extras', () => {
  const withExtras = base({
    lines: [{ item_name: 'Fixtures', quantity: 1, price: 1000 }],
    extras: [
      { label: 'Disposal', amount: 200 },
      { label: 'Warranty', amount: 300, in_utility_scope: false },
    ],
  })
  it('become their own lines, never folded into a fixture price', () => {
    const rows = intakeLineRows(withExtras, 1)
    expect(rows).toHaveLength(3)
    expect(rows[0].price).toBe(1000)   // untouched
    expect(rows[1].item_name).toBe('Disposal')
    expect(rows[2].item_name).toBe('Warranty')
  })
  it('keep their utility scope, so out-of-scope money cannot reach the cap', () => {
    const rows = intakeLineRows(withExtras, 1)
    expect(rows[1].in_utility_scope).toBe(true)
    expect(rows[2].in_utility_scope).toBe(false)
  })
  it('continue the sort order after the lines', () => {
    expect(intakeLineRows(withExtras, 1).map(r => r.sort_order)).toEqual([0, 1, 2])
  })
  it('drop zero-value and malformed entries', () => {
    expect(normalizeExtras([{ label: 'x', amount: 0 }, null, undefined])).toEqual([])
  })
  it('are included in the line sum', () => {
    expect(intakeLineSum(withExtras)).toBe(1500)
  })
})

describe('totals and reconciliation', () => {
  it('derives the headline from the lines when none is given', () => {
    expect(intakeTotal(base())).toBe(20)
    expect(intakeResidual(base())).toBe(0)
  })
  it('keeps a producer-supplied headline (a signed document already shows it)', () => {
    const i = base({ quote_amount: 25 })
    expect(intakeTotal(i)).toBe(25)
    expect(intakeResidual(i)).toBe(5)   // surfaced, not smeared across lines
  })
  it('reconciles the restated Cocola estimate exactly', () => {
    const cocola = base({
      source: 'lenard',
      lines: [
        { item_name: 'SMBE Highbay', quantity: 30, price: 434.98 },
        { item_name: 'SMBE Linear', quantity: 3, price: 397.50 },
        { item_name: 'SMBE Linear', quantity: 3, price: 397.50 },
        { item_name: 'SMBE Linear', quantity: 1, price: 397.50 },
        { item_name: 'SMBE Linear', quantity: 4, price: 397.50 },
        { item_name: 'SMBE Vapor Tight', quantity: 8, price: 391.00 },
      ],
    })
    expect(intakeLineSum(cocola)).toBeCloseTo(20549.90, 2)
    expect(intakeResidual(cocola)).toBe(0)
  })
})

describe('quote row', () => {
  it('nulls every field a producer does not supply, never undefined', () => {
    const row = intakeQuoteRow(base())
    for (const k of ['customer_id', 'salesperson_id', 'audit_id', 'audit_type',
      'service_type', 'business_unit', 'estimate_name', 'summary', 'notes', 'utility_incentive']) {
      expect(row[k], k).toBe(null)
    }
  })
  it('defaults status to Draft', () => {
    expect(intakeQuoteRow(base()).status).toBe('Draft')
  })
  it('carries the fields Lenard used to drop', () => {
    const row = intakeQuoteRow(base({
      salesperson_id: 7, service_type: 'Lighting', business_unit: 'Energy Scout',
      estimate_name: 'Lighting — Cocola', utility_incentive: 15412.43,
    }))
    expect(row.salesperson_id).toBe(7)
    expect(row.service_type).toBe('Lighting')
    expect(row.business_unit).toBe('Energy Scout')
    expect(row.utility_incentive).toBe(15412.43)
  })
})

describe('validation', () => {
  it('refuses an estimate with no lines — the silent-loss bug', () => {
    expect(validateIntake(base({ lines: [] }))).toContain(
      'an estimate needs at least one line — a quote with no lines is not a bid')
  })
  it('requires a tenant', () => {
    expect(validateIntake(base({ company_id: 0 })).join()).toMatch(/company_id/)
  })
  it('requires the estimate to belong to someone', () => {
    expect(validateIntake(base({ lead_id: null, customer_id: null })).join()).toMatch(/lead_id or customer_id/)
  })
  it('accepts a customer without a lead', () => {
    expect(validateIntake(base({ lead_id: null, customer_id: 7963 }))).toEqual([])
  })
  it('names the offending line', () => {
    expect(validateIntake(base({ lines: [{ item_name: 'ok' }, { item_name: '  ' }] })).join())
      .toMatch(/line 2 has no item_name/)
  })
  it('a valid intake has no problems', () => {
    expect(validateIntake(base())).toEqual([])
  })
})

// ---- the writer ----
function fakeDb({ failLines = false, failQuote = false, shortBy = 0 } = {}) {
  const calls = { inserted: [], deleted: [], leadPatch: null }
  return {
    calls,
    from(table) {
      return {
        insert(payload) {
          calls.inserted.push({ table, payload })
          if (table === 'quote_lines') {
            const rows = (payload || []).map((_, k) => ({ id: k + 1 }))
            return {
              select: () => failLines
                ? Promise.resolve({ data: null, error: { message: 'boom' } })
                : Promise.resolve({ data: rows.slice(0, rows.length - shortBy), error: null }),
            }
          }
          return {
            select: () => ({
              single: () => failQuote
                ? Promise.resolve({ data: null, error: { message: 'nope' } })
                : Promise.resolve({ data: { id: 555 }, error: null }),
            }),
          }
        },
        update(patch) { return { eq: (_c, id) => { calls.leadPatch = { table, patch, id }; return Promise.resolve({ error: null }) } } },
        delete() { return { eq: (_c, id) => { calls.deleted.push({ table, id }); return Promise.resolve({ error: null }) } } },
      }
    },
  }
}

describe('createEstimateFromIntake', () => {
  it('writes the header, the lines, and links the lead', async () => {
    const db = fakeDb()
    const res = await createEstimateFromIntake(db, base())
    expect(res.quote.id).toBe(555)
    expect(res.lineCount).toBe(1)
    expect(db.calls.inserted.map(c => c.table)).toEqual(['quotes', 'quote_lines'])
    expect(db.calls.leadPatch.patch).toEqual({ quote_id: 555, status: 'Estimate Sent' })
  })
  it('rolls the header back when the lines fail, instead of warning', async () => {
    const db = fakeDb({ failLines: true })
    await expect(createEstimateFromIntake(db, base())).rejects.toThrow(/lines failed, header rolled back/)
    expect(db.calls.deleted).toEqual([{ table: 'quotes', id: 555 }])
  })
  it('treats a short write as a failure — a half-itemised bid looks finished', async () => {
    const db = fakeDb({ shortBy: 1 })
    const intake = base({ lines: [{ item_name: 'A' }, { item_name: 'B' }] })
    await expect(createEstimateFromIntake(db, intake)).rejects.toThrow(/only 1 of 2 lines were written/)
    expect(db.calls.deleted).toEqual([{ table: 'quotes', id: 555 }])
  })
  it('never writes anything for an invalid intake', async () => {
    const db = fakeDb()
    await expect(createEstimateFromIntake(db, base({ lines: [] }))).rejects.toThrow(/at least one line/)
    expect(db.calls.inserted).toEqual([])
  })
  it('can leave the lead status alone', async () => {
    const db = fakeDb()
    await createEstimateFromIntake(db, base(), { advanceLeadTo: null })
    expect(db.calls.leadPatch.patch).toEqual({ quote_id: 555 })
  })
  it('surfaces a header failure', async () => {
    await expect(createEstimateFromIntake(fakeDb({ failQuote: true }), base())).rejects.toThrow(/header failed/)
  })
})

// ---- drift guard ----
describe('shim and core cannot drift', () => {
  it('produce identical output for the same intake', () => {
    const i = base({
      lines: [{ item_name: 'A', quantity: 2, price: 10, in_utility_scope: false }],
      extras: [{ label: 'X', amount: 5 }],
      quote_amount: 30,
    })
    expect(intakeLineRows(i, 7)).toEqual(core.intakeLineRows(i, 7))
    expect(intakeQuoteRow(i)).toEqual(core.intakeQuoteRow(i))
    expect(intakeResidual(i)).toBe(core.intakeResidual(i))
    expect(validateIntake(i)).toEqual(core.validateIntake(i))
  })
})
