// Christopher, 2026-10-14: "when I ask to make a job recurring … if it is just
// windows assign Dusty … anything other than just windows Gage or Logan".
// Arnie said yes and had no way to do either. job_recurrence and job_crew are
// those two cards; business_unit is "my jobs means HHH, not Energy Scout".
import { describe, it, expect, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { RECORD_TARGETS, RECURRENCES } from '../../supabase/functions/_shared/arnieRecords.ts'
import { proposeRecordChange, applyRecordProposal, rollbackRecordProposal } from '../../supabase/functions/_shared/arnieRecordPropose.ts'

const R = { url: 'https://proj.supabase.co', key: 'svc' }
const MANAGER = { email: 'christopher@demo.test', companyId: 25, employeeId: 14, role: 'manager', level: 2 }
const TECH = { email: 'tech@demo.test', companyId: 25, employeeId: 9, role: 'user', level: 0 }

function world() {
  const db = { jobs: [{ id: 501, job_id: 'JOB-AZALEA', job_title: 'Azalea window cleaning', customer_name: 'Azalea Apartments', business_name: null, status: 'Scheduled', notes: null, start_date: '2026-10-28', address: '1 Azalea Way', recurrence: 'None', assigned_team: null }] }
  const posted = [], patched = []
  const fn = vi.fn(async (url, init = {}) => {
    const u = decodeURIComponent(String(url))
    const m = u.match(/\/rest\/v1\/([a-z_]+)(?:\?(.*))?$/)
    if (!m) return new Response('[]', { status: 200 })
    const [, table, qs = ''] = m
    if (init.method === 'POST') { const body = JSON.parse(init.body); posted.push({ table, body }); return new Response(JSON.stringify([{ id: 1, ...body }]), { status: 201 }) }
    if (init.method === 'PATCH') { patched.push({ table, qs, body: JSON.parse(init.body) }); return new Response(null, { status: 204 }) }
    let rows = db[table] || []
    const id = (qs.match(/(?:^|&)id=eq\.([^&]+)/) || [])[1]
    if (id) rows = rows.filter((r) => String(r.id) === id)
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

describe('a repeating job', () => {
  const realFetch = globalThis.fetch
  afterEach(() => { globalThis.fetch = realFetch })

  it('is one column on the job, at the manager bar', () => {
    expect([RECORD_TARGETS.job_recurrence.table, RECORD_TARGETS.job_recurrence.field, RECORD_TARGETS.job_recurrence.minLevel]).toEqual(['jobs', 'recurrence', 2])
    expect([RECORD_TARGETS.job_crew.table, RECORD_TARGETS.job_crew.field, RECORD_TARGETS.job_crew.minLevel]).toEqual(['jobs', 'assigned_team', 2])
  })

  it('only the repeats the database trigger knows — the same nine plus None', () => {
    const trig = ['Daily', 'Weekly', 'Bi-Weekly', 'Every 6 Weeks', 'Monthly', 'Bi-Monthly', 'Quarterly', 'Bi-Annually', 'Annually']
    expect(RECURRENCES).toEqual(['None', ...trig])
    expect(RECORD_TARGETS.job_recurrence.checkValue('Monthly')).toBeNull()
    expect(RECORD_TARGETS.job_recurrence.checkValue('every month')).toMatch(/Use exactly one of/)
  })

  it('drafts "make Azalea monthly", writes nothing until approved, applies and rolls back', async () => {
    const w = world(); globalThis.fetch = w.fn
    const r = await proposeRecordChange(R, MANAGER, { target: 'job_recurrence', record_query: 'Azalea', value: 'Monthly' })
    expect(r.error).toBeUndefined()
    expect(r.preview).toMatchObject({ kind: 'record', field: 'recurrence', before: 'None', after: 'Monthly' })
    expect(w.patched).toEqual([])
    const prop = { target: 'job_recurrence', payload: { entity_id: 501, field: 'recurrence' }, before_value: 'None', after_value: 'Monthly' }
    expect(await applyRecordProposal(R, 25, prop)).toMatchObject({ ok: true })
    expect(w.patched[0]).toEqual({ table: 'jobs', qs: 'id=eq.501&company_id=eq.25', body: { recurrence: 'Monthly' } })
    w.db.jobs[0].recurrence = 'Monthly'
    expect(await rollbackRecordProposal(R, 25, prop)).toMatchObject({ ok: true })
    expect(w.patched[1].body).toEqual({ recurrence: 'None' })
  })

  it('puts Dusty on it on a second card', async () => {
    const w = world(); globalThis.fetch = w.fn
    const r = await proposeRecordChange(R, MANAGER, { target: 'job_crew', record_query: 'Azalea', value: 'Dusty Sensabaugh' })
    expect(r.preview).toMatchObject({ field: 'assigned_team', after: 'Dusty Sensabaugh' })
  })

  it('a tech cannot', async () => {
    const w = world(); globalThis.fetch = w.fn
    const r = await proposeRecordChange(R, TECH, { target: 'job_recurrence', record_query: 'Azalea', value: 'Monthly' })
    expect(r.error).toMatch(/above your access level/)
  })
})

describe('"my jobs" means one side of the company', () => {
  const chat = readFileSync(new URL('../../supabase/functions/arnie-chat/index.ts', import.meta.url), 'utf8')
  it('query_jobs filters by business unit, loosely', () => {
    expect(chat).toMatch(/business_unit: \{ type: 'string', description: 'Only jobs in this business unit/)
    expect(chat).toMatch(/if \(bu\) params\.append\('business_unit', `ilike\.\*\$\{bu\}\*`\)/)
  })
  it('he is told a repeat books the next visit on completion, and only on a job', () => {
    const p = readFileSync(new URL('../../supabase/functions/_shared/arniePrompt.ts', import.meta.url), 'utf8')
    expect(p).toMatch(/The next visit is booked when the current one is marked Completed/)
    expect(p).toMatch(/if they name an estimate or a lead, say it has to become a job first/)
  })
})
