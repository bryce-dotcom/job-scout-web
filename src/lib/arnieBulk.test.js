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
  it('touches the catalogue and the expense book, and nothing else', () => {
    // Widening this is a deliberate act, and this assertion is where the act
    // happens. Expenses joined on 2026-09-25: a real book had all 60 rows
    // filed "Materials", McDonald's included, because fixing them one at a
    // time is work nobody does. Jobs, leads, invoices and payments stay out —
    // those carry money that has MOVED, not money that was filed wrong.
    const tables = new Set(Object.values(BULK_TARGETS).map(t => t.table))
    expect([...tables].sort()).toEqual(['expenses', 'products_services'])
    for (const banned of ['jobs', 'leads', 'invoices', 'payments', 'employees', 'quotes']) {
      expect(tables.has(banned), `${banned} must not be bulk-editable`).toBe(false)
    }
  })

  it('only ever edits the filing, never an amount, a date or who it belongs to', () => {
    const fields = Object.values(BULK_TARGETS).filter(t => t.table === 'expenses').map(t => t.field)
    expect(fields).toEqual(['category'])
    for (const money of ['amount', 'date', 'job_id', 'status', 'receipt_url']) {
      expect(fields.includes(money), `${money} must not be bulk-editable`).toBe(false)
    }
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

  it('matches exactly unless the target has opted into a word match, and the catalogue never has', () => {
    // The bug being fixed on PRODUCTS is whitespace, so `eq.` is load-bearing
    // there: an ilike would match "MES" and "MES " together and quietly
    // rewrite both. Expenses opted into a word match on 2026-09-25 because
    // their text is free-form and exact match cannot express "the Chevron
    // ones". The opt-in is per target and declared in the registry, so this
    // is the assertion that keeps it from spreading by accident.
    expect(bulk).toMatch(/`eq\.\$\{filterValue\}`/)
    for (const [key, t] of Object.entries(BULK_TARGETS)) {
      if (t.table !== 'products_services') continue
      expect(t.containsFilters, `${key} must match the whole value`).toBeUndefined()
      expect(t.textFilters, `${key} must match the whole value`).toBeUndefined()
    }
    // Both fuzzy branches are reachable only through those declarations.
    expect(bulk).toMatch(/const acrossText = field === 'text' && !!\(target\.textFilters \|\| \[\]\)\.length/)
    expect(bulk).toMatch(/const byWord = acrossText \|\| \(\(target\.containsFilters \|\| \[\]\)\.includes\(field\) && filterValue !== ''\)/)
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

describe('re-filing the books', () => {
  const t = BULK_TARGETS.expense_category

  it('takes only a category the Expenses page offers, however it is typed', () => {
    expect(t.coerce('fuel')).toBe('Fuel')
    expect(t.coerce('  MEALS ')).toBe('Meals')
    expect(t.coerce('Cost of sale')).toBe('Cost of Sale')
    // A typo must not invent a fifteenth category nobody can filter by later.
    expect(t.coerce('Fuell')).toBeNull()
    expect(t.coerce('gas')).toBeNull()
    expect(t.coerce('')).toBeNull()
  })

  it('the page and the rail keep the same list', async () => {
    const { EXPENSE_CATEGORIES } = await import('./schema.js')
    for (const c of EXPENSE_CATEGORIES) expect(t.coerce(c), c).toBe(c)
    const listed = bulk.match(/const EXPENSE_CATEGORIES = \[([\s\S]*?)\]/)[1]
    expect([...listed.matchAll(/'([^']+)'/g)].map(m => m[1])).toEqual(EXPENSE_CATEGORIES)
  })

  it('a row on the card carries what a person needs to judge it: when, who, how much, what it says', () => {
    expect(t.labelOf({ date: '2026-09-16T00:00:00+00:00', vendor: null, amount: 96.41, description: 'FUEL - CHEVRON #2214' }))
      .toBe('2026-09-16 · $96.41 · FUEL - CHEVRON #2214')
    expect(t.labelOf({ date: '2026-09-22', vendor: 'Chevron', amount: 71.05, description: 'gas' }))
      .toBe('2026-09-22 · Chevron · $71.05 · gas')
    expect(t.labelOf({ date: '2026-09-01', amount: 1234.5 })).toBe('2026-09-01 · $1,234.50')
  })

  it('"the Chevron ones" searches vendor, merchant AND description together', () => {
    // One row names the shop in a vendor column and the next buries it in free
    // text; filtering one column finds a third of them and reads as success.
    expect(t.filterable).toContain('text')
    expect(t.textFilters).toEqual(['vendor', 'merchant', 'description'])
    expect(bulk).toMatch(/const acrossText = field === 'text' && !!\(target\.textFilters \|\| \[\]\)\.length/)
    expect(bulk).toMatch(/params\.append\('or', `\(\$\{target\.textFilters!\.map\(\(c\) => `\$\{c\}\.ilike\.\*\$\{word\}\*`\)\.join\(','\)\}\)`\)/)
  })

  it('a word match is for expenses only — the catalogue still matches the whole value', () => {
    expect(BULK_TARGETS.product_manufacturer.containsFilters).toBeUndefined()
    expect(BULK_TARGETS.product_manufacturer.textFilters).toBeUndefined()
    expect(t.containsFilters).toEqual(['vendor', 'merchant', 'description'])
  })

  it('the ceiling, the every-row card and the all-or-nothing apply still hold for it', () => {
    // The word match widens what can be selected, so the three things that make
    // a bulk approval honest matter more here, not less.
    expect(BULK_MAX).toBe(200)
    expect(bulk).toMatch(/rows\.length > BULK_MAX/)
    expect(bulk).toMatch(/previewRows = changing\.map/)
    expect(bulk).toMatch(/stale: true, error: `One \$\{target\.noun\}/)
    expect(isBulkTarget('expense_category')).toBe(true)
  })

  it('the card calls an expense an expense — the noun rides on the preview', () => {
    // Only visible in a browser: the card header hardcoded "products" and read
    // "3 PRODUCTS — EXPENSE CATEGORY" over a list of expenses.
    expect(bulk).toMatch(/noun: string/)
    expect(bulk).toMatch(/noun: target.noun,/)
    const chat = readFileSync(resolve(here, '../pages/agents/arnie/ArnieChat.jsx'), 'utf8')
    expect(chat).toContain("{rows.length} {(pv.noun || 'product') + (rows.length === 1 ? '' : 's')}")
    expect(chat).not.toContain("rows.length === 1 ? 'product' : 'products'")
    // The filter phrase has to read as a sentence after the card's "Where ".
    expect(bulk).toContain('`anything mentions ${JSON.stringify(word)}`')
  })

  it('admin only, and the refusal says where, not "the catalogue"', () => {
    expect(t.minLevel).toBeGreaterThanOrEqual(3)
    expect(t.scope).toBe('the books')
    expect(t.noun).toBe('expense')
    expect(bulk).toMatch(/needs admin access/)
    expect(bulk).not.toMatch(/across the catalogue needs admin/)
  })
})

describe('the tool and the prompt say how to aim it', () => {
  const chat = src('arnie-chat/index.ts')
  const engine = readFileSync(resolve(here, '../pages/agents/arnie/arnieEngine.js'), 'utf8')
  it('the tool offers expense_category and explains "text"', () => {
    expect(chat).toMatch(/product_active or expense_category/)
    expect(chat).toMatch(/"text" \(a word anywhere in the vendor, merchant or description/)
    expect(chat).toMatch(/Cost of Sale, Materials, Labor/)
  })
  it('the prompt tells it not to filter on vendor alone', () => {
    expect(engine).toMatch(/## Re-filing the books/)
    expect(engine).toMatch(/Do not filter on vendor alone/)
    expect(engine).toMatch(/never how much/)
  })
})
