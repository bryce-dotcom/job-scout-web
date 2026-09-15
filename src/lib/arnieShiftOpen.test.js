import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const shift = read('../../supabase/functions/_shared/arnieShift.ts')
const records = read('../../supabase/functions/_shared/arnieRecords.ts')
const field = read('../pages/FieldScout.jsx')
const timeClock = read('./timeClock.js')
const engine = read('../pages/agents/arnie/arnieEngine.js')
const card = read('./featureKnowledge/arnie.js')

const propose = shift.slice(shift.indexOf('export async function proposeShiftOpen'), shift.indexOf('export async function applyShiftOpen'))
const apply = shift.slice(shift.indexOf('export async function applyShiftOpen'), shift.indexOf('export async function rollbackShiftOpen'))
const rollback = shift.slice(shift.indexOf('export async function rollbackShiftOpen'))

describe('the clock-in is Field Scout\'s write, not a new one', () => {
  it('the switch leaves the same stamp, and opens the new punch one second later', () => {
    expect(field).toContain('[SWITCHED JOBS at ${switchedAt.toISOString()} — continued on job ${newJobId}]')
    expect(apply).toContain('[SWITCHED JOBS at ${now.toISOString()} — continued on job ${p.job_id ?? \'General\'}]')
    expect(field).toContain('clock_in: new Date(switchedAt.getTime() + 1000).toISOString()')
    expect(apply).toContain('clock_in: new Date(now.getTime() + (cur ? 1000 : 0)).toISOString()')
  })
  it('bumps Chillin/Scheduled to In Progress like the button, and only those', () => {
    expect(field).toMatch(/\.in\('status', \['Chillin', 'Scheduled'\]\)/)
    expect(apply).toMatch(/\['Chillin', 'Scheduled'\]\.includes\(j\.status\)/)
  })
  it('the stale-shift rule is the same 16 hours', () => {
    expect(timeClock).toMatch(/STALE_SHIFT_HOURS = 16/)
    expect(shift).toMatch(/const STALE_HOURS = 16/)
    expect(propose).toMatch(/if \(hrs > STALE_HOURS\) return \{ error: `You still have a shift open/)
  })
})

describe('yourself, now, no GPS', () => {
  it('never clocks in someone else — even for an admin', () => {
    expect(propose).toMatch(/if \(other && !SELF\.test\(q\)\) return \{ error: `I clock in the person talking to me/)
    expect(propose).not.toMatch(/caller\.level/)
  })
  it('a punch at an earlier time is refused as a Payroll adjustment', () => {
    expect(propose).toMatch(/if \(v && v !== 'now'\) return \{ error: 'I clock you in at the moment you approve the card/)
    expect(apply).toMatch(/const now = new Date\(\)/)
  })
  it('the card says there is no GPS from chat', () => {
    expect(propose).toMatch(/No GPS from here\./)
  })
  it('own punch passes below admin: minLevel 3 with ownerOf = identity', () => {
    expect(records).toMatch(/shift_open: \{[\s\S]*?minLevel: 3[\s\S]*?ownerOf: async \(_r, _companyId, rowId\) => rowId/)
    expect(propose).toMatch(/entity_table: 'employees', entity_id: me\.id/)
  })
})

describe('apply refuses when the picture changed; rollback undoes both halves', () => {
  it('a fresh clock-in refuses if a shift opened meanwhile; a switch refuses if its shift closed', () => {
    expect(apply).toMatch(/if \(expectedSwitch \? \(!cur \|\| String\(cur\.id\) !== String\(p\.switch_from\.id\)\) : !!cur\)/)
    expect(apply).toMatch(/stale: true/)
  })
  it('a 23505 on the insert reopens the punch it just closed', () => {
    expect(apply).toMatch(/if \(cur\) await patchRow\(r, 'time_clock', companyId, cur\.id, \{ clock_out: null, total_hours: null, notes: cur\.notes \?\? null \}\)/)
    expect(apply).toMatch(/duplicate key\|one_open_per_employee/)
  })
  it('rollback deletes only a punch nobody has worked, reopens the switched-from one, restores the job status it bumped', () => {
    expect(rollback).toMatch(/if \(row\.clock_out \|\| row\.lunch_start\) return \{ ok: false/)
    expect(rollback).toMatch(/p\.switched_out\?\.id/)
    expect(rollback).toMatch(/if \(j\?\.status === 'In Progress'\) await patchRow\(r, 'jobs', companyId, p\.job_id, \{ status: p\.job_status_before \}\)/)
  })
})

describe('what Arnie says about himself matches what is wired', () => {
  it('every record target the registry has is one the prompt teaches', () => {
    const keys = [...records.matchAll(/^  (\w+): \{$/gm)].map((m) => m[1]).filter((k) => k !== 'RECORD_TARGETS')
    for (const k of keys) expect(engine).toContain(`\\\`${k}\\\``)
  })
  it('the knowledge card claims only rails that exist', () => {
    const claims = ['closing an open shift', 'merging a duplicate lead', 'a follow-up on a quiet quote', 'a Draft quote from the price book']
    for (const c of claims) expect(card).toContain(c)
    expect(card).toMatch(/Can he create invoices or purchase orders\?[\s\S]*?Not yet/)
  })
})
