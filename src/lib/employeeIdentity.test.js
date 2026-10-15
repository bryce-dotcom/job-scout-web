import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  IDENTITY_FIELDS, stripIdentity, splitIdentity, identityHasValues, identitySavePlan,
  mergeIdentity, mergeIdentityOne, fetchIdentityMap, saveIdentity,
} from './employeeIdentity'

// Coworkers' SSN, DOB, home address and bank fields were readable by every
// signed-in employee off public.employees (found 2026-10-14). They moved to
// employee_identity, readable only by the person and payroll admins. These
// tests pin the client side of that: one field list, a merge that never shows
// legacy values, and a save that never blanks what it could not load.

const here = dirname(fileURLToPath(import.meta.url))
const repo = resolve(here, '../..')

describe('one identity field list', () => {
  it('the edge twin lists the same fields', () => {
    const ts = readFileSync(resolve(repo, 'supabase/functions/_shared/employeeIdentity.ts'), 'utf8')
    const block = ts.match(/IDENTITY_FIELDS = \[([\s\S]*?)\] as const/)[1]
    const edge = [...block.matchAll(/'([a-z0-9_]+)'/g)].map(m => m[1])
    expect(edge).toEqual([...IDENTITY_FIELDS])
  })

  it('the employee_identity table has exactly these columns (plus keys and stamps)', () => {
    const sql = readFileSync(resolve(repo, 'supabase/migrations/20261015121000_employee_identity.sql'), 'utf8')
    const body = sql.match(/create table if not exists public\.employee_identity \(([\s\S]*?)\n\);/)[1]
    const cols = [...body.matchAll(/^\s+([a-z0-9_]+)\s+/gm)].map(m => m[1])
      .filter(c => !['employee_id', 'company_id', 'created_at', 'updated_at'].includes(c))
    expect(cols.sort()).toEqual([...IDENTITY_FIELDS].sort())
  })

  it('the audit log strips the same fields', () => {
    const sql = readFileSync(resolve(repo, 'supabase/migrations/20261015120000_employee_private_access.sql'), 'utf8')
    const arr = sql.match(/private_keys text\[\] := array\[([\s\S]*?)\];/)[1]
    const keys = [...arr.matchAll(/'([a-z0-9_]+)'/g)].map(m => m[1])
    expect(keys.sort()).toEqual([...IDENTITY_FIELDS].sort())
  })
})

describe('splitIdentity', () => {
  it('sends identity keys to identity and everything else to employees', () => {
    const { employee, identity, hasIdentity } = splitIdentity({
      name: 'Ana', hourly_rate: 30, home_address: '1 Main', ssn_last4: '6789', date_of_birth: null,
    })
    expect(employee).toEqual({ name: 'Ana', hourly_rate: 30 })
    expect(identity).toEqual({ home_address: '1 Main', ssn_last4: '6789', date_of_birth: null })
    expect(hasIdentity).toBe(true)
  })

  it('only keys present in the payload: an untyped SSN is not sent, so it is not overwritten', () => {
    const { identity } = splitIdentity({ name: 'Ana', home_city: 'Ogden' })
    expect(identity).toEqual({ home_city: 'Ogden' })
    expect('ssn_encrypted' in identity).toBe(false)
  })
})

describe('identityHasValues', () => {
  it('nulls and blanks are not values', () => {
    expect(identityHasValues({ home_address: null, home_zip: '', date_of_birth: undefined })).toBe(false)
    expect(identityHasValues({ home_zip: '84401' })).toBe(true)
    expect(identityHasValues({ name: 'not identity' })).toBe(false)
  })
})

describe('identitySavePlan: a save never blanks identity it could not load', () => {
  const blanks = { date_of_birth: null, home_address: null, home_city: null, home_state: null, home_zip: null }

  it('coworker whose row did not load: blanks are NOT written', () => {
    expect(identitySavePlan({ isNew: false, employeeId: 7, loadedIds: new Set([1]), identity: blanks }))
      .toEqual({ write: false, refuse: false })
  })

  it('coworker whose row did not load, but something was typed: refuse, do not drop it silently', () => {
    expect(identitySavePlan({ isNew: false, employeeId: 7, loadedIds: new Set([1]), identity: { ...blanks, home_zip: '84401' } }))
      .toEqual({ write: false, refuse: true })
  })

  it('row loaded: write the round-tripped values', () => {
    expect(identitySavePlan({ isNew: false, employeeId: 7, loadedIds: new Set([7]), identity: blanks }))
      .toEqual({ write: true, refuse: false })
  })

  it('new hire: write only when something was entered', () => {
    expect(identitySavePlan({ isNew: true, loadedIds: new Set(), identity: blanks })).toEqual({ write: false, refuse: false })
    expect(identitySavePlan({ isNew: true, loadedIds: new Set(), identity: { home_zip: '84401' } })).toEqual({ write: true, refuse: false })
  })

  it('identity load failed (empty set) on an existing person: nothing written', () => {
    expect(identitySavePlan({ isNew: false, employeeId: 7, loadedIds: new Set(), identity: blanks }).write).toBe(false)
  })
})

describe('mergeIdentity', () => {
  const legacy = { id: 7, name: 'Ana', ssn_last4: '1111', home_address: 'OLD', hourly_rate: 30 }

  it('a coworker you may not see comes back with NO identity fields, even while legacy columns hold values', () => {
    const [row] = mergeIdentity([legacy], new Map())
    expect(row).toEqual({ id: 7, name: 'Ana', hourly_rate: 30 })
  })

  it('the identity row is the only source, including its nulls', () => {
    const [row] = mergeIdentity([legacy], new Map([[7, { employee_id: 7, ssn_last4: '6789', home_address: null }]]))
    expect(row.ssn_last4).toBe('6789')
    expect(row.home_address).toBeNull()
    expect(row.name).toBe('Ana')
  })

  it('accepts a plain object keyed by id, and mergeIdentityOne for one row', () => {
    expect(mergeIdentity([legacy], { 7: { ssn_last4: '2222' } })[0].ssn_last4).toBe('2222')
    expect(mergeIdentityOne(legacy, { ssn_last4: '3333' }).ssn_last4).toBe('3333')
    expect(mergeIdentityOne(legacy, null).ssn_last4).toBeUndefined()
  })

  it('stripIdentity removes every identity field', () => {
    const all = Object.fromEntries(IDENTITY_FIELDS.map(k => [k, 'x']))
    expect(stripIdentity({ id: 1, ...all })).toEqual({ id: 1 })
  })
})

// A minimal stand-in for the supabase-js query builder.
function fakeSb(result, calls = []) {
  const q = {
    select(s) { calls.push(['select', s]); return q },
    in(c, v) { calls.push(['in', c, v]); return q },
    eq(c, v) { calls.push(['eq', c, v]); return q },
    upsert(row, opts) { calls.push(['upsert', row, opts]); return Promise.resolve(result) },
    then(res, rej) { return Promise.resolve(result).then(res, rej) },
  }
  return { from(t) { calls.push(['from', t]); return q }, calls }
}

describe('fetchIdentityMap / saveIdentity', () => {
  it('reads employee_identity by company and keys rows by employee_id', async () => {
    const calls = []
    const sb = fakeSb({ data: [{ employee_id: 7, ssn_last4: '6789' }], error: null }, calls)
    const { map, error } = await fetchIdentityMap(sb, { companyId: 25 })
    expect(error).toBeNull()
    expect(map.get(7).ssn_last4).toBe('6789')
    expect(calls[0]).toEqual(['from', 'employee_identity'])
    expect(calls).toContainEqual(['eq', 'company_id', 25])
  })

  it('an error comes back as error with an empty map (callers decide), never a throw', async () => {
    const sb = fakeSb({ data: null, error: { message: 'boom' } })
    const { map, error } = await fetchIdentityMap(sb, { ids: [1] })
    expect(map.size).toBe(0)
    expect(error.message).toBe('boom')
  })

  it('no ids means no query', async () => {
    const calls = []
    const { map } = await fetchIdentityMap(fakeSb({ data: [] }, calls), { ids: [null] })
    expect(map.size).toBe(0)
    expect(calls.some(c => c[0] === 'in')).toBe(false)
  })

  it('saveIdentity upserts only identity keys, on employee_id', async () => {
    const calls = []
    const { error } = await saveIdentity(fakeSb({ error: null }, calls), 7, 25, { home_zip: '84401', name: 'ignored' })
    expect(error).toBeNull()
    const up = calls.find(c => c[0] === 'upsert')
    expect(up[1]).toEqual({ employee_id: 7, company_id: 25, home_zip: '84401' })
    expect(up[2]).toEqual({ onConflict: 'employee_id' })
  })

  it('saveIdentity with nothing to write does not touch the network', async () => {
    const calls = []
    await saveIdentity(fakeSb({ error: null }, calls), 7, 25, { name: 'x' })
    expect(calls.length).toBe(0)
  })
})
