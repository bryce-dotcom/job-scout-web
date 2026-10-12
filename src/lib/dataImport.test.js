import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const strip = (src) => src.split('\n')
  .filter((l) => {
    const x = l.trim()
    return !x.startsWith('//') && !x.startsWith('*') && !x.startsWith('/*') && !x.startsWith('--')
  }).join('\n')

const fnSrc = read('../../supabase/functions/data-import/index.ts')
const fn = strip(fnSrc)
const sql = strip(read('../../supabase/migrations/20261012190000_data_imports.sql'))

// Bringing a company's history in from the system they are leaving is the
// most destructive thing the product does on purpose: thousands of rows, once,
// usually on their first day. Each of these is a property that, if it stopped
// holding, would make a migration worse than not having one.

describe('rows never go near a model', () => {
  it('the model sees headings and a few samples, nothing else', () => {
    const plan = fn.slice(fn.indexOf("action === 'plan'"), fn.indexOf("action === 'apply'"))
    expect(plan).toMatch(/callAnthropic/)
    expect(plan).toMatch(/\.slice\(0, 5\)/)       // samples are capped
    expect(plan).toMatch(/\.slice\(0, 80\)/)      // and so are headings
    // The apply path — the one that carries the actual customers — must not
    // call a model at all. A model near 5,000 rows is slow, expensive, and
    // able to quietly change a phone number on row 3,814.
    const apply = fn.slice(fn.indexOf("action === 'apply'"), fn.indexOf("action === 'undo'"))
    expect(apply).not.toMatch(/callAnthropic|anthropic/i)
  })

  it('and the model may only name fields that exist', () => {
    // It is about to write to real columns on a real table.
    expect(fn).toMatch(/if \(field && CUSTOMER_FIELDS\[field\]\) mapping\[col\] = field/)
  })
})

describe('the same export twice is not two companies worth of customers', () => {
  it('upserts on a key that is unique in the database', () => {
    expect(fn).toMatch(/on_conflict=company_id,source_system,source_id/)
    expect(fn).toMatch(/resolution=merge-duplicates/)
    expect(sql).toMatch(/create unique index if not exists customers_source_unique/)
  })

  it('and that index is NOT partial', () => {
    // PostgREST cannot target a partial unique index in an upsert (42P10) and
    // the write vanishes silently. This project has paid for that once.
    const idx = sql.slice(sql.indexOf('customers_source_unique'))
    expect(idx.slice(0, 200)).not.toMatch(/\bwhere\b/)
  })

  it('a row with no id of its own still gets a stable key', () => {
    expect(fn).toMatch(/out\.source_id = clean\(out\.email\) \|\| clean\(out\.phone\) \|\| clean\(out\.name\)/)
  })
})

describe('the address comes out forwards', () => {
  it('column order is read from an array, never from the mapping object', () => {
    // jsonb SORTS an object's keys. A mapping stored as Street/City/State/Zip
    // comes back City/State/Street/Zip, and the join produced "84601, Provo,
    // UT, 101 Mill Road" on every row — a real address, backwards, with
    // nothing erroring. A jsonb array keeps its order.
    expect(fn).toMatch(/const order: string\[\] = Array\.isArray\(job\.columns\)/)
    expect(fn).toMatch(/const addressCols = order\.filter\(\(c\) => mapping\[c\] === 'address'\)/)
    expect(fn).toMatch(/columns: headers/)
    expect(sql).toMatch(/add column if not exists columns jsonb/)
  })
})

describe('what it refuses', () => {
  it('importing is for admins and owners', () => {
    expect(fn).toMatch(/if \(caller\.level < 3\) return json\(\{ error: 'Importing data is for admins and owners\.' \}, 403\)/)
  })

  it('it only ever touches the caller\'s own company', () => {
    expect(fn).toMatch(/company_id=eq\.\$\{company\}/)
    expect(fn).toMatch(/out\.company_id = company/)
    // Never a company id from the request body.
    expect(fn).not.toMatch(/body\.company_id/)
  })

  it('a row with no name is counted, not invented', () => {
    expect(fn).toMatch(/else \{ skipped\+\+; continue \}/)
  })

  it('batches are bounded', () => {
    expect(fn).toMatch(/const MAX_ROWS_PER_CALL = 250/)
    expect(fn).toMatch(/rows\.length > MAX_ROWS_PER_CALL/)
  })
})

describe('undoing one does not take somebody\'s work with it', () => {
  it('a customer who has been worked on is kept', () => {
    // Deleting a customer who now has a job would take the job too. Asked of
    // the tables that point at them, rather than hoping a cascade is kind.
    const undo = fn.slice(fn.indexOf("action === 'undo'"))
    expect(undo).toMatch(/for \(const table of \['jobs', 'quotes', 'invoices', 'leads'\]\)/)
    expect(undo).toMatch(/const removable = ids\.filter\(\(id: number\) => !busy\.has\(id\)\)/)
    expect(undo).toMatch(/kept: busy\.size/)
  })

  it('and only rows this import created', () => {
    const undo = fn.slice(fn.indexOf("action === 'undo'"))
    expect(undo).toMatch(/import_id=eq\.\$\{importId\}&company_id=eq\.\$\{company\}/)
  })
})
