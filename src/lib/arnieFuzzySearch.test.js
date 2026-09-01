import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
// Normalised to LF: this repo checks out CRLF on Windows and the assertions
// below match on the shape of the source.
const chatTs = readFileSync(resolve(here, '../../supabase/functions/arnie-chat/index.ts'), 'utf8')
  .replace(/\r\n/g, '\n')

// Asked "how many highbays do I have in stock", Arnie matched nothing and said
// so, while 62 LED High Bay 150W sat in the warehouse. One ilike on the raw
// term cannot bridge "highbay" and "High Bay", and trade language is full of
// that gap: wallpack/wall pack, hi-bay, T8/T-8, 2x4/2X4.
//
// The fix compares on a squashed form. The FIRST attempt at it shipped a
// ReferenceError — a restore line meant for the products branch was written
// into the inventory branch, where the variable it names does not exist, so
// every fuzzy inventory search died with "exactOr is not defined". It went
// unnoticed because the model quietly retried with "high bay", took the exact
// path, and produced the right answer anyway. The verification looked green
// because the ANSWER was right; the new code path had never once run.

const branch = (name, next) => {
  const start = chatTs.indexOf(`if (name === '${name}')`)
  const end = chatTs.indexOf(`if (name === '${next}')`)
  expect(start, `${name} branch not found`).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return chatTs.slice(start, end)
}

/** The shipped squash helper, lifted out of the edge function and run. */
const squash = (() => {
  const m = chatTs.match(/const squash = (\(s: unknown\) =>[^\n]*)/)
  if (!m) throw new Error('squash helper is gone — fuzzy search cannot work without it')
  // eslint-disable-next-line no-new-func
  return new Function('s', `return (${m[1].replace(': unknown', '')})(s)`)
})()

describe('the squashed form bridges trade spelling and stored spelling', () => {
  const finds = (term, stored) => squash(stored).includes(squash(term))

  it('finds the highbay that started this', () => {
    expect(finds('highbay', 'LED High Bay 150W')).toBe(true)
  })

  it('handles the rest of the way trades actually talk', () => {
    expect(finds('wallpack', 'Exterior Wall Pack 80W')).toBe(true)
    expect(finds('hi-bay', 'LED High Bay 150W')).toBe(false) // 'hibay' is not a substring
    expect(finds('t-8', 'LED Tube T8 4ft')).toBe(true)
    expect(finds('2x4', 'LED Panel 2X4 40W')).toBe(true)
    expect(finds('occupancy sensor', 'Occupancy Sensor')).toBe(true)
  })

  it('does not match things that are genuinely different', () => {
    expect(finds('highbay', 'LED Panel 2x4 40W')).toBe(false)
    expect(finds('wallpack', 'Occupancy Sensor')).toBe(false)
  })
})

describe('the fallback only references variables it declares', () => {
  // The exact bug: inventory has no `or` filter and never declares exactOr,
  // so naming it there is a ReferenceError on the only path that matters.
  it('the inventory branch does not reach for exactOr', () => {
    expect(branch('query_inventory', 'query_quotes')).not.toMatch(/exactOr/)
  })

  it('the products branch declares exactOr before it restores it', () => {
    const products = branch('query_products', 'propose_bulk_change')
    const declared = products.indexOf("const exactOr = params.get('or')")
    const used = products.indexOf("params.set('or', exactOr)")
    expect(declared, 'exactOr is never declared').toBeGreaterThan(-1)
    expect(used, 'the exact filter is never put back').toBeGreaterThan(declared)
  })

  it('every identifier the two fallbacks use is one they declare', () => {
    for (const [name, next] of [['query_inventory', 'query_quotes'], ['query_products', 'propose_bulk_change']]) {
      const src = branch(name, next)
      const declared = new Set([
        ...[...src.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)].map(m => m[1]),
        // in scope from further out
        'params', 'input', 'hdr', 'sb', 'fetchRows', 'squash', 'companyId', 'isAdmin',
        'aggregate', 'MAX_ROWS', 'String', 'Number', 'Object', 'Array', 'Math', 'JSON', 'URLSearchParams',
      ])
      const suspects = ['exactOr', 'matchedLoosely', 'want', 'hits', 'wide', 'term', 'got', 'cap', 'grouping']
      for (const id of suspects) {
        if (new RegExp(`\b${id}\b`).test(src)) {
          expect(declared.has(id), `${name} uses ${id} without declaring it`).toBe(true)
        }
      }
    }
  })
})

describe('the exact match still runs first', () => {
  it('inventory pays for the wide read only on a miss', () => {
    const inv = branch('query_inventory', 'query_quotes')
    expect(inv).toMatch(/if \(term\) params\.append\('name'/)
    expect(inv).toMatch(/if \(term && got\.rows\.length === 0\)/)
  })

  it('products skips the fallback entirely when grouping', () => {
    // A grouped catalogue audit has to read the true set, not a fuzzy subset.
    expect(branch('query_products', 'propose_bulk_change'))
      .toMatch(/if \(term && !grouping && got\.rows\.length === 0\)/)
  })

  it('says so when the match was loose, so the stored name gets quoted back', () => {
    expect(branch('query_inventory', 'query_quotes')).toMatch(/matchedLoosely/)
    expect(chatTs).toMatch(/matched ignoring spaces, case and punctuation/)
  })
})
