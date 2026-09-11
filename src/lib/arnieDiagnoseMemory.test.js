import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const create = read('../../supabase/functions/_shared/arnieCreate.ts')
const records = read('../../supabase/functions/_shared/arnieRecords.ts')
const chatTs = read('../../supabase/functions/arnie-chat/index.ts')
const engine = read('../pages/agents/arnie/arnieEngine.js')
const migration = read('../../supabase/migrations/20260911150000_job_diagnoses.sql')

// Diagnose slice 2: what fixed it is kept, and asked for first next time.

describe('a diagnosis is a create target with the right shape', () => {
  const block = create.slice(create.indexOf('diagnosis: {'), create.indexOf('export const isCreateTarget'))

  it('exists, writes to job_diagnoses, and anyone can log one', () => {
    expect(block).toMatch(/table: 'job_diagnoses'/)
    expect(block).toMatch(/minLevel: 0/)
  })

  it('symptom and fix are required; the job is resolved, never a column the model writes', () => {
    expect(block).toMatch(/symptom:\s*\{[^}]*required: true/)
    expect(block).toMatch(/fix:\s*\{[^}]*required: true/)
    expect(block).toMatch(/job:\s*\{\s*column: null/)
  })

  it('outcome is one of a fixed set — an honest partial beats a confident fixed', () => {
    expect(block).toMatch(/oneOf: \['fixed', 'partial', 'escalated', 'unresolved'\]/)
    expect(migration).toMatch(/check \(outcome in \('fixed', 'partial', 'escalated', 'unresolved'\)\)/)
  })

  it('stamps who logged it and that Arnie was the source', () => {
    expect(create).toMatch(/row\.created_by_employee_id = prop\.payload\?\.proposer_employee_id/)
    expect(create).toMatch(/row\.source = 'arnie'/)
  })
})

describe('past fixes are searched, and searched first', () => {
  it('query_past_fixes is a read tool offered to everyone, backed by search_diagnoses()', () => {
    expect(chatTs).toMatch(/name: 'query_past_fixes'/)
    expect(chatTs).toMatch(/rpc\/search_diagnoses/)
    // Not a proposal tool: it must not be card-gated.
    expect(chatTs).not.toMatch(/query_past_fixes: '/)
  })

  it('the prompt says to check the company\'s own fixes before general knowledge', () => {
    const diag = engine.slice(engine.indexOf('## Diagnose'), engine.indexOf('## When you find a problem'))
    expect(diag).toMatch(/Check what this company has fixed before, FIRST/)
    expect(diag).toMatch(/query_past_fixes/)
    expect(diag).toMatch(/propose_create with target=diagnosis/)
  })

  it('search ORs the query words — two techs never describe a fault the same way', () => {
    // "fires then shuts off after 30 seconds, lockout" must find
    // "lights, runs half a minute, dies, locks out". AND-ing every word
    // (websearch_to_tsquery) missed it in the first live run.
    expect(migration).toMatch(/replace\(plainto_tsquery\('english', coalesce\(p_query, ''\)\)::text, ' & ', ' \| '\)/)
    expect(migration).toMatch(/word_similarity\(lower\(d\.equipment\), q\.said\)/)
    expect(migration).not.toMatch(/websearch_to_tsquery/)
  })

  it('an empty result is described as a fact about our records, not the fault', () => {
    expect(chatTs).toMatch(/That is a fact about our records, not about the fault/)
  })
})

describe('a record named in words is never silently matched to the wrong row', () => {
  // "Riverside Apartments" matched the one job with "Apartments" in it —
  // Aspen Grove Apartments — because the fallback took the LONGEST word.
  // A diagnosis would have been logged on the wrong job with nobody asked.
  const fn = records.slice(records.indexOf('export async function resolveEntity'), records.indexOf('export async function valuesInUse'))

  it('no longer picks the longest word', () => {
    expect(fn).not.toMatch(/\.sort\(\(a, b\) => b\.length - a\.length\)\[0\]/)
  })

  it('returns a row alone only when it matched EVERY distinctive word', () => {
    expect(fn).toMatch(/if \(top\.length === 1 && best === words\.length\) return \{ row: top\[0\] \}/)
  })

  it('anything less is a choice for the person, not a pick', () => {
    expect(fn).toMatch(/if \(top\.length\) \{\s*return \{ candidates:/)
  })

  it('a job label carries the customer, so the card can be checked by eye', () => {
    const label = records.slice(records.indexOf('const jobLabel'), records.indexOf('const leadLabel'))
    expect(label).toMatch(/r\.customer_name \|\| r\.business_name/)
    expect(label).toMatch(/r\.job_title/)
  })
})
