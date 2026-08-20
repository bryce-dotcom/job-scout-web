import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BULK_TARGETS, BULK_MAX, isBulkTarget } from '../../supabase/functions/_shared/arnieBulk.ts'

const here = dirname(fileURLToPath(import.meta.url))
const src = (p) => readFileSync(resolve(here, '../../supabase/functions', p), 'utf8')
const bulk = src('_shared/arnieBulk.ts')

// Bulk exists because the honest single-record path was unusable for the work
// people actually have: ten products carrying a manufacturer with a trailing
// space is ten approvals, so nobody uses it and the catalogue stays wrong.
// Everything below is the price of making it plural.

describe('what bulk can touch', () => {
  it('stays inside the product catalogue', () => {
    // Widening this is a deliberate act. Bulk edits to jobs, leads, invoices
    // or payments are not something that should arrive by accident.
    const tables = new Set(Object.values(BULK_TARGETS).map(t => t.table))
    expect([...tables]).toEqual(['products_services'])
  })

  it('is admin-only, every target', () => {
    for (const [key, t] of Object.entries(BULK_TARGETS)) {
      expect(t.minLevel, `${key} must require admin`).toBeGreaterThanOrEqual(3)
    }
  })

  it('offers deactivation and no deletion at all', () => {
    // Products are referenced by quote_lines, job_lines, invoice_lines and
    // purchase_order_lines. Deleting one orphans historical documents, so the
    // "remove it" request resolves to active=false and stays reversible.
    expect(isBulkTarget('product_active')).toBe(true)
    expect(bulk).not.toMatch(/method:\s*'DELETE'/)
    expect(bulk.toLowerCase()).not.toMatch(/\bdelete from\b/)
  })

  it('does not collide with the single-record or config targets', () => {
    const recordKeys = [...src('_shared/arnieRecords.ts').matchAll(/^ {2}(\w+): \{$/gm)].map(m => m[1])
    for (const k of Object.keys(BULK_TARGETS)) expect(recordKeys).not.toContain(k)
  })
})

describe('the model supplies a filter, never a list of rows', () => {
  it('only matches on an allow-listed column', () => {
    // A free-form column would let a typo point the write somewhere else
    // entirely, and the error would look like a normal empty result.
    expect(bulk).toMatch(/if \(!target\.filterable\.includes\(field\)\)/)
    for (const t of Object.values(BULK_TARGETS)) {
      expect(t.filterable.length).toBeGreaterThan(0)
      expect(t.filterable).not.toContain('id')
    }
  })

  it('matches exactly, never fuzzily', () => {
    // The bug being fixed IS whitespace, so `eq.` is load-bearing: an ilike
    // would match "MES" and "MES " together and quietly rewrite both.
    expect(bulk).toMatch(/`eq\.\$\{filterValue\}`/)
    expect(bulk).not.toMatch(/ilike/)
  })

  it('refuses a set too large for a human to review', () => {
    expect(BULK_MAX).toBeLessThanOrEqual(200)
    expect(bulk).toMatch(/rows\.length > BULK_MAX/)
  })

  it('pins the affected rows at draft time instead of re-running the filter', () => {
    // If apply re-ran the filter, approving a card showing 9 products could
    // write to a different set than the one that was shown.
    expect(bulk).toMatch(/entity_ids: changing\.map/)
  })
})

describe('applying is all-or-nothing against the shown state', () => {
  it('refuses when any row moved since the draft', () => {
    expect(bulk).toMatch(/stale: true/)
    expect(bulk).toMatch(/rows\.length !== ids\.length/)
  })

  it('records the previous value of every row so rollback is exact', () => {
    expect(bulk).toMatch(/before_value: changing\.map/)
    expect(bulk).toMatch(/rollbackBulkProposal/)
  })

  it('skips rows that already hold the target value', () => {
    // Otherwise rollback would "restore" a value the change never touched.
    expect(bulk).toMatch(/const changing = rows\.filter/)
  })
})

describe('coercing a value', () => {
  const active = BULK_TARGETS.product_active
  it('reads the words people actually type for a boolean', () => {
    expect(active.coerce('true')).toBe(true)
    expect(active.coerce('Active')).toBe(true)
    expect(active.coerce('no')).toBe(false)
    expect(active.coerce('inactive')).toBe(false)
  })

  it('rejects anything ambiguous rather than guessing', () => {
    // Guessing here silently deactivates a chunk of the catalogue.
    expect(active.coerce('maybe')).toBeNull()
    expect(active.coerce('')).toBeNull()
  })
})
