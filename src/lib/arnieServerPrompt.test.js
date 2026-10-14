import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fromLegacyPrompt, frameData } from '../../supabase/functions/_shared/arnieServerPrompt.ts'
import { buildArniePrompt } from '../../supabase/functions/_shared/arniePrompt.ts'
import { JOBSCOUT_KNOWLEDGE, featureContextForMessage } from '../../supabase/functions/_shared/arnieKnowledge.ts'
import { getFeatureContextForMessage } from '../pages/agents/arnie/arnieKnowledge.js'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const chat = read('../../supabase/functions/arnie-chat/index.ts')
const engine = read('../pages/agents/arnie/arnieEngine.js')

describe('the rules are built on the server', () => {
  it('arnie-chat builds them for every Arnie turn, from the caller', () => {
    expect(chat).toMatch(/await serverArniePrompt\(\{ url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY \}, caller, body\)/)
  })
  it('the phone sends data, never rules', () => {
    expect(engine).not.toMatch(/systemPrompt:/)
    expect(engine).not.toMatch(/buildArniePrompt/)
    expect(engine).toMatch(/promptVersion: 2,/)
    expect(engine).toMatch(/dataContext: dataContext \|\| '',/)
  })
})

describe('an OLD phone gets the NEW rules', () => {
  // A phone on last week's bundle still posts a whole prompt. Its rules are
  // thrown away; only its data section is kept.
  const old = buildArniePrompt({ email: 'a@b.c' }, { company_name: 'HHH' }, 'user', 'field', 'OLD KNOWLEDGE', 'arnie', '', { spoken: true })
    + '\n\n## Current Data Context (REAL DATA — use ONLY these facts)\nJobs: 3 open'

  it('keeps only the data section', () => {
    const l = fromLegacyPrompt(old)
    expect(l.data.startsWith('\n\n## Current Data Context')).toBe(true)
    expect(l.data).toMatch(/Jobs: 3 open/)
    expect(l.data).not.toMatch(/OLD KNOWLEDGE/)
  })
  it('and the two facts the old rules carried: spoken, and field', () => {
    const l = fromLegacyPrompt(old)
    expect(l.spoken).toBe(true)
    expect(l.field).toBe(true)
    expect(fromLegacyPrompt('').data).toBe('')
  })
})

describe('the data section, framed as before', () => {
  it('with a snapshot', () => {
    expect(frameData('Jobs: 3')).toMatch(/^\n\n## Current Data Context \(REAL DATA/)
  })
  it('without one, it says to use the tools', () => {
    expect(frameData('')).toMatch(/No preloaded data — call a query_\* tool/)
  })
})

describe('the server knows what the browser knew', () => {
  it('the same feature index and static block', () => {
    expect(JOBSCOUT_KNOWLEDGE).toMatch(/## JobScout Feature Reference/)
    expect(JOBSCOUT_KNOWLEDGE.length).toBeGreaterThan(3000)
  })
  it('and picks the same cards for the same message', () => {
    for (const m of ['how do I set up the lead setter', 'where are recurring jobs', 'customer portal link', 'payroll inbox']) {
      expect(featureContextForMessage(m), m).toBe(getFeatureContextForMessage(m))
    }
  })
})

describe('"today" is their today', () => {
  it('a zone passed in is used for the date line', () => {
    const p = buildArniePrompt({}, {}, 'user', 'office', '', 'arnie', '', { timeZone: 'Pacific/Kiritimati' })
    expect(p).toMatch(/\(Pacific\/Kiritimati\)/)
  })
  it('a nonsense zone falls back instead of throwing', () => {
    expect(() => buildArniePrompt({}, {}, 'user', 'office', '', 'arnie', '', { timeZone: 'Not/AZone' })).not.toThrow()
  })
})
