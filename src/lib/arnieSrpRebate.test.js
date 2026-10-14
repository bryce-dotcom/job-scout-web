import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isGmLine } from '../../supabase/functions/_shared/arnieSrpRebate.ts'
import { parseTakeoff, planEstimate } from '../../supabase/functions/_shared/lightingPlaybook.ts'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const src = read('../../supabase/functions/_shared/arnieSrpRebate.ts')
const create = read('../../supabase/functions/_shared/arnieCreate.ts')

describe('which lines are GMs', () => {
  it('the mount items and the lift — nothing else', () => {
    for (const n of ['MES Cobra Head Mount - Slip Fit', 'MES Cobra Head Mount - Trunnion Fit', 'ES LIFT ', 'LIFT GM']) expect(isGmLine({ item_name: n }), n).toBe(true)
    for (const n of ['SMBE 60/80/100W Cobra Head LOW WATT', 'SMBE 25/45/60W Flood w/ Lift', 'Rocky Mountain Power Incentive']) expect(isGmLine({ item_name: n }), n).toBe(false)
  })
})

describe('the real rebate redoes the GMs against the fixtures AS THEY STAND', () => {
  const B = 'Electrical Services (Bundles)'
  const catalog = [
    [1505, 'ES LIFT ', 49.98], [2371, 'SMBE 60/80/100W Cobra Head LOW WATT', 417],
    [2255, 'MES Cobra Head Mount - Slip Fit', 26],
  ].map(([id, name, unit_price]) => ({ id, name, unit_price, type: B }))
  const items = parseTakeoff([{ kind: 'cobra', qty: 2, existing_watts: 400 }])

  it('room is measured from the subtotal on the estimate, not a fresh catalogue price', () => {
    // Someone knocked the cobras to $400 each on the estimate: $800, not $834.
    const p = planEstimate(items, catalog, { rebateGiven: 954, fixtureSubtotal: 800 })
    expect(p.lines.filter((l) => l.role === 'mount_gm')[0]).toMatchObject({ quantity: 2, price: 77 })
    expect(p.subtotal).toBe(954)
    expect(p.out_of_pocket).toBe(0)
  })
})

describe('the card', () => {
  it('only a Draft nobody has sent, built from a takeoff', () => {
    expect(src).toMatch(/if \(q\.status !== 'Draft' \|\| q\.last_sent_at \|\| q\.job_id\) return \{ ok: false, error/)
    expect(src).toMatch(/was not built from a takeoff/)
  })
  it('fixtures untouched; GM lines replaced; incentive and savings set', () => {
    expect(src).toMatch(/const fixtures = lines\.filter\(\(l: Any\) => !isGmLine\(l\)\)/)
    expect(src).toMatch(/after: \{ quote_amount: plan\.subtotal, utility_incentive: plan\.incentive/)
    expect(src).toMatch(/manual_annual_savings: money\(savings\)/)
  })
  it('refuses if the lines changed since it was drafted', () => {
    expect(src).toMatch(/The estimate\\'s lines changed since I drafted this/)
  })
  it('undo puts back exactly what was there', () => {
    expect(src).toMatch(/const old: Any\[\] = c\.old_gms \|\| \[\]/)
    expect(src).toMatch(/patchRow\(r, 'quotes', companyId, id, \{ \.\.\.\(c\.before \|\| \{\}\)/)
  })
  it('is a create target with the rebate required', () => {
    expect(create).toMatch(/srp_rebate: \{/)
    expect(create).toMatch(/rebate:\s*\{ column: null, label: 'Rebate',\s*required: true/)
  })
})
