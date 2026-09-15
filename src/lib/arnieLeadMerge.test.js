import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const m = read('../../supabase/functions/_shared/arnieLeadMerge.ts')
const records = read('../../supabase/functions/_shared/arnieRecords.ts')
const store = read('./store.js')
const engine = read('../pages/agents/arnie/arnieEngine.js')

const propose = m.slice(m.indexOf('export async function proposeLeadMerge'), m.indexOf('export async function applyLeadMerge'))
const apply = m.slice(m.indexOf('export async function applyLeadMerge'), m.indexOf('export async function rollbackLeadMerge'))
const rollback = m.slice(m.indexOf('export async function rollbackLeadMerge'))
const refs = [...m.slice(m.indexOf('const REFS'), m.indexOf('/** Blanks')).matchAll(/table: '(\w+)',\s+column: '(\w+)'/g)].map((x) => [x[1], x[2]])

describe('a merge moves what a delete only unlinks', () => {
  it('every table deleteLead unlinks is a table the merge moves', () => {
    const unlinked = [...store.slice(store.indexOf('deleteLead: async'), store.indexOf('// --- Sales Pipeline ---')).matchAll(/from\('(\w+)'\)\.(?:update|delete)/g)].map((x) => x[1])
    expect(unlinked.length).toBeGreaterThanOrEqual(6)
    for (const t of unlinked) expect(refs.map((r) => r[0])).toContain(t)
  })

  it('jobs.lead_id is TEXT — it is written as a string, both directions', () => {
    expect(apply).toMatch(/ref\.table === 'jobs' \? String\(keep\.id\) : keep\.id/)
    expect(rollback).toMatch(/ref\.table === 'jobs' \? String\(p\.dup_id\) : p\.dup_id/)
  })

  it('a third copy flagged against the removed one is re-flagged against the kept one, never against itself', () => {
    expect(refs).toContainEqual(['leads', 'possible_duplicate_of'])
    expect(m).toMatch(/ref\.table === 'leads' && exceptLeadId != null \? `&id=neq\.\$\{exceptLeadId\}`/)
  })

  it('moves by the ids recorded at draft, and refuses if those changed', () => {
    expect(apply).toMatch(/if \(!sameRefs\(refs, p\.refs \|\| \[\]\)\) return \{ ok: false, stale: true/)
    expect(apply).toMatch(/\$\{ref\.table\}\?id=in\.\(\$\{ref\.ids\.join\(','\)\}\)&company_id=eq\.\$\{companyId\}/)
  })
})

describe('the kept lead is filled, never overwritten', () => {
  it('only blanks are filled, and what was there is kept for rollback', () => {
    expect(propose).toMatch(/if \(blank\(keep\[c\]\) && !blank\(dup\[c\]\)\) \{ fill\[c\] = dup\[c\]; keptBefore\[c\] = keep\[c\] \?\? null \}/)
    expect(rollback).toMatch(/const before = p\.kept_before/)
  })
  it('the copy\'s notes ride along, appended, under a dated merge line', () => {
    expect(propose).toMatch(/\[Merged \$\{stamp\}\] Lead/)
    expect(propose).toMatch(/fill\.notes = \[keep\.notes, noteLine\]/)
  })
})

describe('pay is shown, not decided', () => {
  it('both setter fees stay on the merged lead and the card says so', () => {
    expect(propose).toMatch(/bothFees \? 'Both leads carry a setter fee — both stay on the merged lead; who earns it is decided on Lead Setter, not here\.'/)
    expect(m).not.toMatch(/payment_status/)
    expect(m).not.toMatch(/setter_amount/)
  })
  it('the prompt says the same', () => {
    expect(engine).toMatch(/a merge never decides pay/)
  })
})

describe('who, and what the model sees', () => {
  it('manager only — the bar for deleting a lead', () => {
    expect(records).toMatch(/lead_merge: \{[^}]*minLevel: 2/)
    expect(propose).toMatch(/if \(caller\.level < 2\) return \{ error: 'Merging leads removes one of them, so it needs a manager/)
  })
  it('the model and the card get the summary, not the copy\'s sixty columns', () => {
    expect(propose).toMatch(/const proposal = \{ \.\.\.saved, payload: \{ entity_table: 'leads', entity_id: keep\.id, entity_label: entity, keep_id: keep\.id, dup_id: dup\.id, moves, filled \} \}/)
  })
  it('rollback puts the copy back with its own id, then moves the children home', () => {
    expect(rollback).toMatch(/const row = \{ \.\.\.\(p\.dup_row \|\| \{\}\), company_id: companyId, id: p\.dup_id \}/)
    expect(rollback.indexOf('rest/v1/leads`')).toBeLessThan(rollback.indexOf('for (const ref of p.refs'))
  })
  it('the copy is removed LAST, after everything has moved', () => {
    expect(apply.indexOf("method: 'DELETE'")).toBeGreaterThan(apply.lastIndexOf("method: 'PATCH'"))
  })
})
