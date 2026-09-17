import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const create = read('../../supabase/functions/_shared/arnieCreate.ts')
const chat = read('../../supabase/functions/arnie-chat/index.ts')
const engine = read('../pages/agents/arnie/arnieEngine.js')
const migration = read('../../supabase/migrations/20260916200000_arnie_memories.sql')
const panel = read('../pages/agents/arnie/ArnieMemories.jsx')
const setup = read('../pages/agents/arnie/ArnieSetup.jsx')

const start = create.indexOf('  memory: {')
const entry = create.slice(start, create.indexOf('\n  },\n}', start))

describe('a memory is the person\'s own', () => {
  it('written with the caller\'s employee id from the token, never a field the model fills', () => {
    expect(entry).toMatch(/columns: \{ employee_id: caller\.employeeId, created_by: caller\.email, source: 'arnie' \}/)
    const keys = [...entry.matchAll(/^\s+(\w+):\s+\{ column/gm)].map((m) => m[1]).sort()
    expect(keys).toEqual(['kind', 'text'])
  })
  it('read into the prompt server-side from the caller\'s identity — Arnie only, never Frankie', () => {
    expect(chat).toMatch(/agent === 'arnie' && companyId != null && caller\.employeeId != null\s*\? systemPrompt \+ await memoriesBlock\(companyId, caller\.employeeId\)/)
    expect(chat).toMatch(/arnie_memories\?select=kind,text&company_id=eq\.\$\{companyId\}&employee_id=eq\.\$\{employeeId\}/)
    expect(chat).toMatch(/streamWithTools\(cleaned, systemPromptFinal/)
    expect(chat).toMatch(/callWithTools\(cleaned, systemPromptFinal/)
  })
  it('the guard: yours, or an admin\'s; the service role passes', () => {
    expect(migration).toMatch(/if jwt_email is null then return coalesce\(new, old\); end if;/)
    expect(migration).toMatch(/current_user_access_level\(\) >= 3/)
    expect(migration).toMatch(/me is distinct from coalesce\(new\.employee_id, old\.employee_id\)/)
  })
})

describe('what he will not keep', () => {
  it('no passwords or account numbers, no duplicates, a ceiling of forty', () => {
    expect(entry).toMatch(/password\|passcode\|ssn\|social security\|card number\|cvv\|routing number\|account number/)
    expect(entry).toMatch(/I already have that/)
    expect(entry).toMatch(/mine\.length >= 40/)
  })
  it('the prompt keeps company facts on the record, not in a head', () => {
    expect(engine).toMatch(/A fact about the company or a customer .* belongs on that record as a note — offer lead_note or job_note instead/)
    expect(engine).toMatch(/never "got it, remembered"/)
  })
})

describe('the card says Remember, and forgetting is one tap', () => {
  it('verb and done', () => {
    expect(entry).toMatch(/verb: 'Remember'/)
    expect(entry).toMatch(/forget it from Arnie → Settings/)
  })
  it('the settings panel lists only the caller\'s rows, with a delete and no add', () => {
    expect(panel).toMatch(/\.eq\('company_id', companyId\)\.eq\('employee_id', user\.id\)/)
    expect(panel).toMatch(/from\('arnie_memories'\)\.delete\(\)\.eq\('id', id\)/)
    expect(panel).not.toMatch(/\.insert\(/)
    expect((setup.match(/<ArnieMemories \/>/g) || []).length).toBe(2)   // both branches of the page
  })
})
