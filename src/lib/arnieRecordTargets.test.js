import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  RECORD_TARGETS, isRecordTarget, computeAfter, describeAfter,
} from '../../supabase/functions/_shared/arnieRecords.ts'

const here = dirname(fileURLToPath(import.meta.url))
const src = (p) => readFileSync(resolve(here, '../../supabase/functions', p), 'utf8')

// arnieConfig.ts cannot be imported here: it pulls in the Anthropic wrapper,
// which imports over https and the ESM loader will not resolve that. The list
// is read out of the source instead — which also means this test fails if the
// declaration is ever reshaped, rather than silently passing on a stale copy.
const ALLOWED_TARGETS = (() => {
  const m = src('_shared/arnieConfig.ts').match(/const ALLOWED_TARGETS = \[([^\]]+)\]/)
  if (!m) throw new Error('ALLOWED_TARGETS not found in arnieConfig.ts')
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
})()

describe('a note is added, never swapped', () => {
  const noteTarget = RECORD_TARGETS.job_note

  it('keeps what was already written', () => {
    // The whole point of a note is the history. Overwriting to record a new
    // one destroys the thing being recorded, and the approval card cannot warn
    // about content it never saw.
    expect(computeAfter(noteTarget, 'Gate code is 4417.', 'Panel is on the north wall.'))
      .toBe('Gate code is 4417.\nPanel is on the north wall.')
  })

  it('handles an empty or missing existing note', () => {
    expect(computeAfter(noteTarget, '', 'First note.')).toBe('First note.')
    expect(computeAfter(noteTarget, null, 'First note.')).toBe('First note.')
    expect(computeAfter(noteTarget, '   ', 'First note.')).toBe('First note.')
  })

  it('says on the card that the old note survives', () => {
    expect(describeAfter(noteTarget, 'Gate code is 4417.', 'New thing'))
      .toMatch(/existing note kept/)
    expect(describeAfter(noteTarget, '', 'New thing')).toBe('"New thing"')
  })

  it('replaces outright for a set field, which is what status means', () => {
    expect(computeAfter(RECORD_TARGETS.job_status, 'Scheduled', 'Completed')).toBe('Completed')
  })
})

describe('the target registry', () => {
  it('never collides with the config targets', () => {
    // Apply routes on the target name alone, so an overlap would send a
    // record change down the settings path or the reverse.
    for (const t of ALLOWED_TARGETS) expect(isRecordTarget(t)).toBe(false)
    for (const k of Object.keys(RECORD_TARGETS)) expect(ALLOWED_TARGETS).not.toContain(k)
  })

  it('only writes to jobs and leads', () => {
    // Widening this set is a deliberate act, not something that should slip in
    // — invoices and payments are explicitly out of reach.
    const tables = new Set(Object.values(RECORD_TARGETS).map(t => t.table))
    expect([...tables].sort()).toEqual(['jobs', 'leads'])
  })

  it('requires a manager for everything by default', () => {
    for (const [key, t] of Object.entries(RECORD_TARGETS)) {
      expect(t.minLevel, `${key} must not be below manager`).toBeGreaterThanOrEqual(2)
    }
  })

  it('carves out exactly one relaxation, and only for a note', () => {
    const relaxed = Object.entries(RECORD_TARGETS).filter(([, t]) => t.allowOnActiveJob)
    expect(relaxed.map(([k]) => k)).toEqual(['job_note'])
    // A relaxed target must be append-only: the clocked-in exception should
    // never be able to overwrite a field.
    expect(relaxed[0][1].mode).toBe('append')
  })

  it('validates free-text status fields against real usage', () => {
    // jobs.status carries values like "Chillin" and "Needs scheduling". Left
    // unchecked, "mark it done" writes "Done" and the row drops out of every
    // filter that looks for the real values.
    expect(RECORD_TARGETS.job_status.validateAgainstExisting).toBe(true)
    expect(RECORD_TARGETS.lead_status.validateAgainstExisting).toBe(true)
    expect(RECORD_TARGETS.job_note.validateAgainstExisting).toBeFalsy()
  })
})

describe('the model is never the one that picks a row', () => {
  const records = src('_shared/arnieRecords.ts')
  const propose = src('_shared/arnieRecordPropose.ts')

  it('returns candidates instead of choosing when a description is ambiguous', () => {
    expect(records).toMatch(/if \(rows\.length > 1\)/)
    expect(records).toMatch(/candidates:/)
    expect(propose).toMatch(/needs_choice/)
  })

  it('refuses a description too thin to identify anything', () => {
    expect(records).toMatch(/q\.length < 3/)
  })

  it('re-reads the row at apply time and refuses a stale change', () => {
    // An approval is consent to a specific change, not a licence to overwrite
    // whatever happens to be there later.
    expect(propose).toMatch(/String\(current \?\? ''\) !== String\(prop\.before_value \?\? ''\)/)
    expect(propose).toMatch(/stale: true/)
  })

  it('scopes every write by company as well as row id', () => {
    expect(src('_shared/arnieRest.ts')).toMatch(/id=eq\.\$\{id\}&company_id=eq\.\$\{companyId\}/)
  })
})
