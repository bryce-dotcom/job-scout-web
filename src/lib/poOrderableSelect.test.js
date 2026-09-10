import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const partsTab = readFileSync(resolve(here, '../components/JobPartsTab.jsx'), 'utf8')
const poUtils = readFileSync(resolve(here, './poUtils.js'), 'utf8')

// ─────────────────────────────────────────────────────────────────────────
// isOrderableProduct decides whether a job line reaches a purchase order.
// It reads three columns. If the query that loads those lines omits one, it
// comes back undefined and the rule answers with confidence about a value it
// never saw — the fixture on Northwest Standard was skipped twice that way,
// once for the wrong rule and once for a starved query.
//
// No unit test can see a select string, so this reads the source. It is the
// only kind of test that would have caught it.
// ─────────────────────────────────────────────────────────────────────────
describe('the parts query feeds isOrderableProduct everything it reads', () => {
  // Columns the rule actually consults, taken from the function body itself
  // rather than a list here that could drift away from it.
  const consulted = [...poUtils
    .slice(poUtils.indexOf('function hasOrderCode'), poUtils.indexOf('export function isOrderableProduct') + 400)
    .matchAll(/product\??\.(\w+)/g)].map(m => m[1])

  it('reads the columns we think it reads', () => {
    expect(new Set(consulted)).toEqual(new Set(['vendor_sku', 'model_number', 'material_or_labor']))
  })

  it('JobPartsTab selects every one of them on the job_lines join', () => {
    const join = partsTab.match(/item:products_services\(([^)]*)\)/)
    expect(join, 'products_services join not found in JobPartsTab').toBeTruthy()
    const selected = join[1].split(',').map(s => s.trim())
    for (const col of new Set(consulted)) {
      expect(selected, `JobPartsTab must select "${col}" — omitted, it reads as undefined`).toContain(col)
    }
  })

  it('expandProductForPO selects them too, for bundle components', () => {
    // Components get the same test applied to them, so they need the same
    // columns — a labor component with no code must be droppable.
    const comp = poUtils.match(/component:products_services!component_product_id\(([^)]*)\)/)
    expect(comp, 'component join not found in poUtils').toBeTruthy()
    const selected = comp[1].split(',').map(s => s.trim())
    for (const col of new Set(consulted)) expect(selected).toContain(col)
  })
})
