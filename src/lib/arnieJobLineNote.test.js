// Alayda, 2026-10-21: "I need fixture part numbers in the notes on fast auto
// job." Arnie offered, she said yes, and the reply came back blank — there
// was no way to write one job line's notes. job_line_note is that way: the
// job as she named it, the line by number or words, one card per line.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { RECORD_TARGETS } from '../../supabase/functions/_shared/arnieRecords.ts'
import { proposeRecordChange, applyRecordProposal, rollbackRecordProposal } from '../../supabase/functions/_shared/arnieRecordPropose.ts'

const R = { url: 'https://proj.supabase.co', key: 'svc' }
const ADMIN = { email: 'alayda@demo.test', companyId: 25, employeeId: 15, role: 'admin', level: 3 }
const TECH = { email: 'tech@demo.test', companyId: 25, employeeId: 9, role: 'user', level: 0 }

function world() {
  const db = {
    jobs: [{ id: 23599, job_id: 'JOB-MU2RNWR5', job_title: 'AZ fast auto parts', customer_name: 'Fast auto parts', business_name: null, status: 'Needs scheduling', notes: null, start_date: null, address: null, details: null }],
    job_lines: [
      { id: 12990, job_id: 23599, item_id: null, item_name: null, description: 'lift GM', notes: null, quantity: 1 },
      { id: 12991, job_id: 23599, item_id: 2260, item_name: null, description: 'Exterior, 12ft, Set at 60 w', notes: 'Set at 45W', quantity: 4 },
      { id: 13219, job_id: 23599, item_id: 2626, item_name: null, description: null, notes: null, quantity: 2 },
    ],
    products_services: [
      { id: 2260, name: 'SMBE 25/45/60W Flood', model_number: 'MES-FL-PG-60WBH8DA1-abcdeWg' },
      { id: 2626, name: 'Smart Thermostat Installed', model_number: 'TH2110WF4008/U' },
    ],
  }
  const posted = [], patched = []
  const fn = vi.fn(async (url, init = {}) => {
    const u = decodeURIComponent(String(url))
    const m = u.match(/\/rest\/v1\/([a-z_]+)(?:\?(.*))?$/)
    if (!m) return new Response('[]', { status: 200 })
    const [, table, qs = ''] = m
    if (init.method === 'POST') { const body = JSON.parse(init.body); posted.push({ table, body }); return new Response(JSON.stringify([{ id: 1, ...body }]), { status: 201 }) }
    if (init.method === 'PATCH') { patched.push({ table, qs, body: JSON.parse(init.body) }); return new Response(null, { status: 204 }) }
    let rows = db[table] || []
    for (const k of ['id', 'job_id']) {
      const v = (qs.match(new RegExp(`(?:^|&)${k}=eq\\.([^&]+)`)) || [])[1]
      if (v != null) rows = rows.filter((r) => String(r[k]) === v)
    }
    const inIds = qs.match(/(?:^|&)id=in\.\(([^)]+)\)/)
    if (inIds) rows = rows.filter((r) => inIds[1].split(',').includes(String(r.id)))
    const or = qs.match(/or=\(([^)]*)\)/)
    if (or) {
      const terms = [...or[1].matchAll(/([a-z_]+)\.ilike\.\*([^*]+)\*/g)]
      rows = rows.filter((r) => terms.some(([, col, t]) => String(r[col] ?? '').toLowerCase().includes(t.toLowerCase())))
    }
    if (table === 'employees' || table === 'time_clock') rows = []
    return new Response(JSON.stringify(rows), { status: 200 })
  })
  return { fn, db, posted, patched }
}

describe('job line notes (part numbers on the Fast Auto job)', () => {
  const realFetch = globalThis.fetch
  afterEach(() => { globalThis.fetch = realFetch })

  it('is one text column on job lines, at the job page\'s manager bar', () => {
    const t = RECORD_TARGETS.job_line_note
    expect([t.table, t.field, t.mode, t.minLevel]).toEqual(['job_lines', 'notes', 'set', 2])
    expect(t.checkValue).toBeTypeOf('function')
  })

  it('drafts the flood line\'s notes, keeping what was there, and writes nothing yet', async () => {
    const w = world(); globalThis.fetch = w.fn
    const r = await proposeRecordChange(R, ADMIN, { target: 'job_line_note', record_query: 'fast auto', line: 'flood', value: 'Set at 45W. Part #: MES-FL-PG-60WBH8DA1-abcdeWg' })
    expect(r.error).toBeUndefined()
    expect(r.preview).toMatchObject({ kind: 'record', field: 'notes', before: 'Set at 45W', after: 'Set at 45W. Part #: MES-FL-PG-60WBH8DA1-abcdeWg' })
    expect(r.preview.entity).toMatch(/line 2 \(SMBE 25\/45\/60W Flood\)/)
    expect(w.posted.find((p) => p.table === 'arnie_proposals').body.payload).toMatchObject({ entity_table: 'job_lines', entity_id: 12991, field: 'notes' })
    expect(w.patched).toEqual([])
  })

  it('a line with no name of its own is found by its price book name', async () => {
    const w = world(); globalThis.fetch = w.fn
    const r = await proposeRecordChange(R, ADMIN, { target: 'job_line_note', record_query: 'JOB-MU2RNWR5', line: 'thermostat', value: 'Part #: TH2110WF4008/U' })
    expect(w.posted.find((p) => p.table === 'arnie_proposals').body.payload.entity_id).toBe(13219)
    expect(r.preview.before).toBe('(empty)')
  })

  it('unsure which line: lists each with its part number and current notes', async () => {
    const w = world(); globalThis.fetch = w.fn
    const r = await proposeRecordChange(R, ADMIN, { target: 'job_line_note', record_query: 'fast auto', value: 'x' })
    expect(r.needs_choice.map((c) => c.id)).toEqual([1, 2, 3])
    expect(r.needs_choice[0].label).toMatch(/no part # in the price book/)
    expect(r.needs_choice[1].label).toMatch(/part #: MES-FL-PG-60WBH8DA1-abcdeWg — notes now: "Set at 45W"/)
    expect(r.message).toMatch(/record_id=23599 and line/)
  })

  it('a tech cannot', async () => {
    const w = world(); globalThis.fetch = w.fn
    const r = await proposeRecordChange(R, TECH, { target: 'job_line_note', record_query: 'fast auto', line: '2', value: 'x' })
    expect(r.error).toMatch(/above your access level/)
    expect(w.posted).toEqual([])
  })

  it('applies to that one line\'s notes, and rolls back', async () => {
    const w = world(); globalThis.fetch = w.fn
    const prop = { target: 'job_line_note', payload: { entity_id: 12991, field: 'notes' }, before_value: 'Set at 45W', after_value: 'Set at 45W. Part #: MES-FL' }
    expect(await applyRecordProposal(R, 25, prop)).toMatchObject({ ok: true })
    expect(w.patched).toEqual([{ table: 'job_lines', qs: 'id=eq.12991&company_id=eq.25', body: { notes: 'Set at 45W. Part #: MES-FL' } }])
    w.db.job_lines[1].notes = 'Set at 45W. Part #: MES-FL'
    expect(await rollbackRecordProposal(R, 25, prop)).toMatchObject({ ok: true })
    expect(w.patched[1].body).toEqual({ notes: 'Set at 45W' })
  })

  it('the one-job lookup hands Arnie each line\'s part number', () => {
    const chat = readFileSync(new URL('../../supabase/functions/arnie-chat/index.ts', import.meta.url), 'utf8')
    expect(chat).toMatch(/select: 'id,name,manufacturer,model_number'/)
    expect(chat).toMatch(/part_number: partNo\.get\(l\.item_id\) \|\| null,/)
    expect(chat).toMatch(/job_line_note \(set the NOTES on one line of a job/)
  })
})
