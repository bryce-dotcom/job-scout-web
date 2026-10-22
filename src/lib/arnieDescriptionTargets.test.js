import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { RECORD_TARGETS, recordTargetsSentence } from '../../supabase/functions/_shared/arnieRecords.ts'
import { proposeRecordChange, applyRecordProposal, rollbackRecordProposal, mayChange } from '../../supabase/functions/_shared/arnieRecordPropose.ts'
import { pickLine, checkDescription, DESCRIPTION_COLUMNS, DESCRIPTION_MAX } from '../../supabase/functions/_shared/arnieDescriptions.ts'

// Bryce (2026-10-20): "Arnie should be able to edit descriptions but not
// amounts." These pin both halves: the five description targets each write
// one text column, and nothing on the record rail can reach a number.

const here = dirname(fileURLToPath(import.meta.url))
const chat = readFileSync(resolve(here, '../../supabase/functions/arnie-chat/index.ts'), 'utf8')

const DESCRIPTION_TARGETS = {
  job_description: ['jobs', 'details'],
  estimate_summary: ['quotes', 'summary'],
  estimate_line_description: ['quote_lines', 'description'],
  invoice_line_description: ['invoice_lines', 'description'],
  product_description: ['products_services', 'description'],
}
const AMOUNTISH = /price|amount|total|quantity|qty|cost|discount|tax|fee|owes|incentive|deposit/i

describe('descriptions, never amounts', () => {
  it('each description target writes exactly its one text column', () => {
    for (const [key, [table, field]] of Object.entries(DESCRIPTION_TARGETS)) {
      const t = RECORD_TARGETS[key]
      expect(t, key).toBeTruthy()
      expect([t.table, t.field, t.mode], key).toEqual([table, field, 'set'])
      expect(DESCRIPTION_COLUMNS).toContain(t.field)
      expect(t.checkValue, `${key} checks the wording`).toBeTypeOf('function')
    }
  })

  it('no record target on the rail writes an amount column', () => {
    for (const [key, t] of Object.entries(RECORD_TARGETS)) expect(t.field, key).not.toMatch(AMOUNTISH)
  })

  it('gates like the pages: manager for text, the rep for their own estimate, admin + unlocked for invoice lines', () => {
    for (const key of Object.keys(DESCRIPTION_TARGETS)) expect(RECORD_TARGETS[key].minLevel, key).toBeGreaterThanOrEqual(2)
    expect(RECORD_TARGETS.invoice_line_description.minLevel).toBe(3)
    expect(RECORD_TARGETS.invoice_line_description.guard).toBeTypeOf('function')
    expect(RECORD_TARGETS.estimate_summary.ownerOf).toBeTypeOf('function')
    expect(RECORD_TARGETS.estimate_line_description.ownerOf).toBeTypeOf('function')
    expect(RECORD_TARGETS.invoice_line_description.ownerOf).toBeUndefined()
  })

  it('the model is told the targets and can name a line', () => {
    for (const key of Object.keys(DESCRIPTION_TARGETS)) expect(recordTargetsSentence()).toContain(key)
    expect(chat).toMatch(/line: \{ type: 'string', description: 'For estimate_line_description \/ invoice_line_description \/ job_line_note \/ invoice_line_note only/)
    expect(chat).toMatch(/line: input\?\.line == null \? undefined : String\(input\.line\)/)
  })
})

describe('which line', () => {
  const lines = [
    { id: 11, item_name: 'LED Troffer 2x4', description: 'Replace fluorescent troffers', quantity: 40, price: 89 },
    { id: 12, item_name: 'Wall Pack 80W', description: 'Exterior wall packs', quantity: 6, price: 210 },
    { id: 13, item_name: 'Labor', description: 'Install and haul-away', quantity: 1, price: 1200 },
  ]
  it('by number, however it is said', () => {
    for (const s of ['2', 'line 2', 'Line #2', '#2', '2nd']) expect(pickLine(lines, s)).toMatchObject({ pos: 2, line: { id: 12 } })
  })
  it('refuses a number past the end instead of picking the last', () => {
    expect(pickLine(lines, 'line 7')).toEqual({ error: expect.stringMatching(/no line 7.*3 lines/) })
  })
  it('by words, only when every word hits one line', () => {
    expect(pickLine(lines, 'the troffers')).toMatchObject({ pos: 1 })
    expect(pickLine(lines, 'wall pack')).toMatchObject({ pos: 2 })
    // One word of two is a guess, even when only one line has it.
    expect(pickLine(lines, 'troffer gazebo')).toEqual({ candidates: [{ id: 1, label: expect.stringMatching(/^Line 1: LED Troffer/) }] })
  })
  it('offers choices — by position, with the current wording — rather than guessing', () => {
    const r = pickLine(lines, '')
    expect(r.candidates.map((c) => c.id)).toEqual([1, 2, 3])
    expect(r.candidates[0].label).toBe('Line 1: LED Troffer 2x4 — 40 × $89.00 — reads: "Replace fluorescent troffers"')
    expect(pickLine(lines, 'gazebo').candidates).toHaveLength(3)
  })
  it('takes the only line when there is one', () => {
    expect(pickLine([lines[0]], undefined)).toMatchObject({ pos: 1 })
    expect(pickLine([], '1')).toEqual({ error: expect.any(String) })
  })
  it('checks the wording', () => {
    expect(checkDescription('  ')).toMatch(/Nothing to set/)
    expect(checkDescription('x'.repeat(DESCRIPTION_MAX + 1))).toMatch(/Shorten/)
    expect(checkDescription('Includes haul-away')).toBeNull()
  })
})

// ── the rail end to end, against a fake PostgREST ─────────────────────────
const R = { url: 'https://proj.supabase.co', key: 'svc' }
const ADMIN = { email: 'boss@demo.test', companyId: 25, employeeId: 1, role: 'admin', level: 3 }
const REP = { email: 'rep@demo.test', companyId: 25, employeeId: 7, role: 'user', level: 0 }

function world({ locked = false } = {}) {
  const db = {
    invoices: [{ id: 900, invoice_id: 'INV-1062', customer_id: 50, job_id: null, amount: 1500, payment_status: 'Pending', is_locked: locked }],
    invoice_lines: [
      { id: 31, invoice_id: 900, item_id: 1, description: 'LED troffers', quantity: 10, unit_price: 100, line_total: 1000, sort_order: 1 },
      { id: 32, invoice_id: 900, item_id: 2, description: 'Labor', quantity: 1, unit_price: 500, line_total: 500, sort_order: 2 },
    ],
    quotes: [{ id: 700, quote_id: 'EST-700', estimate_name: null, quote_amount: 900, status: 'Sent', salesperson_id: 7, lead_id: null, customer_id: 50, summary: 'Old scope' }],
    quote_lines: [{ id: 41, quote_id: 700, item_name: 'Wall Pack', description: 'Wall packs', quantity: 3, price: 300, line_total: 900, sort_order: 1 }],
    customers: [{ id: 50, name: 'Pat', business_name: 'Halifax Flooring' }],
  }
  const posted = [], patched = []
  const fn = vi.fn(async (url, init = {}) => {
    const u = decodeURIComponent(String(url))
    const m = u.match(/\/rest\/v1\/([a-z_]+)(?:\?(.*))?$/)
    if (!m) return new Response('[]', { status: 200 })
    const [, table, qs = ''] = m
    if (init.method === 'POST') {
      const body = JSON.parse(init.body); posted.push({ table, body })
      return new Response(JSON.stringify([{ id: 1, ...body }]), { status: 201 })
    }
    if (init.method === 'PATCH') {
      patched.push({ table, qs, body: JSON.parse(init.body) })
      return new Response(null, { status: 204 })
    }
    let rows = db[table] || []
    const eq = (k) => (qs.match(new RegExp(`(?:^|&)${k}=eq\\.([^&]+)`)) || [])[1]
    for (const k of ['id', 'invoice_id', 'quote_id']) if (eq(k) != null) rows = rows.filter((r) => String(r[k]) === eq(k))
    const like = qs.match(/(?:^|&)invoice_id=ilike\.\*([^*&]+)\*/)
    if (like) rows = rows.filter((r) => String(r.invoice_id || '').toLowerCase().includes(like[1].toLowerCase()))
    if (table === 'employees') rows = []
    return new Response(JSON.stringify(rows), { status: 200 })
  })
  return { fn, db, posted, patched }
}

describe('invoice line wording, end to end', () => {
  const realFetch = globalThis.fetch
  let w
  afterEach(() => { globalThis.fetch = realFetch })

  it('drafts the description of the named line and nothing else', async () => {
    w = world(); globalThis.fetch = w.fn
    const r = await proposeRecordChange(R, ADMIN, { target: 'invoice_line_description', record_query: 'INV-1062', line: 'line 2', value: 'Install, haul-away and cleanup' })
    expect(r.error).toBeUndefined()
    expect(r.preview).toMatchObject({ kind: 'record', field: 'description', before: 'Labor', after: 'Install, haul-away and cleanup' })
    expect(r.preview.entity).toMatch(/INV-1062 — Halifax Flooring — line 2/)
    const prop = w.posted.find((p) => p.table === 'arnie_proposals').body
    expect(prop.payload).toMatchObject({ entity_table: 'invoice_lines', entity_id: 32, field: 'description' })
    expect(w.patched).toEqual([]) // nothing written until approved
  })

  it('applies as ONE column on ONE line, and rolls back the same way', async () => {
    w = world(); globalThis.fetch = w.fn
    const prop = { target: 'invoice_line_description', payload: { entity_id: 32, field: 'description' }, before_value: 'Labor', after_value: 'Install and cleanup' }
    expect(await applyRecordProposal(R, 25, prop)).toMatchObject({ ok: true })
    expect(w.patched).toEqual([{ table: 'invoice_lines', qs: 'id=eq.32&company_id=eq.25', body: { description: 'Install and cleanup' } }])
    w.db.invoice_lines[1].description = 'Install and cleanup'
    expect(await rollbackRecordProposal(R, 25, prop)).toMatchObject({ ok: true })
    expect(w.patched[1].body).toEqual({ description: 'Labor' })
  })

  it('refuses a locked invoice at draft, and at apply if it was locked after the draft', async () => {
    w = world({ locked: true }); globalThis.fetch = w.fn
    const r = await proposeRecordChange(R, ADMIN, { target: 'invoice_line_description', record_query: 'INV-1062', line: '1', value: 'New words' })
    expect(r.error).toMatch(/locked/)
    const prop = { target: 'invoice_line_description', payload: { entity_id: 31, field: 'description' }, before_value: 'LED troffers', after_value: 'New words' }
    expect(await applyRecordProposal(R, 25, prop)).toMatchObject({ ok: false, error: expect.stringMatching(/locked/) })
    expect(w.patched).toEqual([])
  })

  it('lists the lines when it cannot tell which, and says how to pick', async () => {
    w = world(); globalThis.fetch = w.fn
    const r = await proposeRecordChange(R, ADMIN, { target: 'invoice_line_description', record_query: 'INV-1062', value: 'New words' })
    expect(r.needs_choice.map((c) => c.id)).toEqual([1, 2])
    expect(r.message).toMatch(/record_id=900 and line/)
  })

  it('is admin-only, like the invoice page', async () => {
    w = world(); globalThis.fetch = w.fn
    const r = await proposeRecordChange(R, REP, { target: 'invoice_line_description', record_query: 'INV-1062', line: '1', value: 'New words' })
    expect(r.error).toMatch(/above your access level/)
  })
})

describe('estimate wording: the rep may change their own', () => {
  const realFetch = globalThis.fetch
  afterEach(() => { globalThis.fetch = realFetch })

  it("lets the estimate's rep reword its line and scope below manager, and nobody else's", async () => {
    const w = world(); globalThis.fetch = w.fn
    expect(await mayChange(R, REP, 'estimate_line_description', 41)).toEqual({ ok: true })
    expect(await mayChange(R, REP, 'estimate_summary', 700)).toEqual({ ok: true })
    expect((await mayChange(R, { ...REP, employeeId: 8 }, 'estimate_line_description', 41)).ok).toBe(false)
  })
})
