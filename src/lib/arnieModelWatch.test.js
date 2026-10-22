// Keep Arnie on the best model, automatically (Bryce, 2026-10-22). The rules
// that decide a switch, and that Arnie reads his model from one place.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { pickCandidates, decideTrial } from '../../supabase/functions/_shared/arnieModelWatch.ts'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

const LIST = [
  { id: 'claude-sonnet-4-5-20250929', created_at: '2025-09-29T00:00:00Z' },
  { id: 'claude-opus-5-5', created_at: '2026-08-01T00:00:00Z' },
  { id: 'claude-sonnet-5-5', created_at: '2026-08-01T00:00:00Z' },
  { id: 'claude-haiku-5-5', created_at: '2026-08-01T00:00:00Z' },
]

describe('what is worth trying', () => {
  it('nothing newer than Sonnet 5.5 today — Opus 5.5 came out the same day and is not newer', () => {
    expect(pickCandidates(LIST, 'claude-sonnet-5-5', new Set())).toEqual([])
  })
  it('a new Sonnet and a new Opus are each tried once', () => {
    const list = [...LIST, { id: 'claude-sonnet-6', created_at: '2026-12-01T00:00:00Z' }, { id: 'claude-opus-6', created_at: '2026-12-02T00:00:00Z' }]
    expect(pickCandidates(list, 'claude-sonnet-5-5', new Set()).map((m) => m.id)).toEqual(['claude-sonnet-6', 'claude-opus-6'])
    expect(pickCandidates(list, 'claude-sonnet-5-5', new Set(['claude-sonnet-6'])).map((m) => m.id)).toEqual(['claude-opus-6'])
  })
  it('Haiku and other families are never candidates', () => {
    const list = [...LIST, { id: 'claude-haiku-6', created_at: '2027-01-01T00:00:00Z' }, { id: 'claude-fable-6', created_at: '2027-01-01T00:00:00Z' }]
    expect(pickCandidates(list, 'claude-sonnet-5-5', new Set())).toEqual([])
  })
})

describe('when a candidate replaces the current model', () => {
  const base = { baselinePassed: 79, baselineTotal: 80, baselineCostPerCall: 0.04, priced: true }
  it('as good or better, 95%+, within 30% of the cost → switched', () => {
    expect(decideTrial({ ...base, passed: 80, total: 80, costPerCall: 0.045 }).decision).toBe('switched')
    expect(decideTrial({ ...base, passed: 79, total: 80, costPerCall: 0.052 }).decision).toBe('switched')
  })
  it('one case worse → kept', () => {
    expect(decideTrial({ ...base, passed: 78, total: 80, costPerCall: 0.03 }).decision).toBe('kept')
  })
  it('Opus-style: as good but twice the cost → kept, and says why', () => {
    const d = decideTrial({ ...base, passed: 79, total: 80, costPerCall: 0.08 })
    expect(d.decision).toBe('kept')
    expect(d.why).toMatch(/costs 100% more per reply/)
  })
  it('a price guessed from the family is never switched to', () => {
    expect(decideTrial({ ...base, passed: 80, total: 80, costPerCall: 0.03, priced: false }).decision).toBe('not_priced')
  })
  it('an eval that did not finish decides nothing', () => {
    expect(decideTrial({ ...base, passed: 0, total: 0, costPerCall: null }).decision).toBe('failed')
  })
})

describe('Arnie reads his model from one place', () => {
  it('arnie-chat answers on the live model; the other Arnie features use it too', () => {
    expect(read('supabase/functions/arnie-chat/index.ts')).toMatch(/activeModel = await liveArnieModel\(\)/)
    expect(read('supabase/functions/arnie-chat/index.ts')).toMatch(/const model = chosen\?\.model \|\| activeModel/)
    expect(read('supabase/functions/arnie-teach/index.ts')).toMatch(/model: await liveArnieModel\(\),/)
    expect(read('supabase/functions/_shared/arnieReceiptItems.ts')).toMatch(/model: await liveArnieModel\(\), max_tokens: 6000/)
    expect(read('supabase/functions/arnie-brief-push/index.ts')).toMatch(/\.\.\.\(await quickCall\(4000\)\)/)
    expect(read('supabase/functions/_shared/arnieConfig.ts')).toMatch(/\.\.\.\(await quickCall\(2000\)\)/)
  })
  it('the setting falls back to the code\'s model if it cannot be read', () => {
    const m = read('supabase/functions/_shared/arnieModel.ts')
    expect(m).toMatch(/let model = ARNIE_MODEL/)
    expect(m).toMatch(/arnie_model_state\?select=model&id=eq\.1/)
  })
  it('a test may name a real model id, but only the demo company or the internal path', () => {
    const c = read('supabase/functions/arnie-chat/index.ts')
    expect(c).toMatch(/\/\^claude-\(sonnet\|opus\|haiku\|fable\)-\[a-z0-9-\]\{1,40\}\$\//)
    expect(c).toMatch(/if \(caller && evalModelId\(body\?\.eval_model\) && \(caller\.companyId === 25 \|\| !inTheApp\)\)/)
  })
  it('runs weekly on GitHub, away from the nightly eval', () => {
    expect(read('.github/workflows/arnie-model-watch.yml')).toMatch(/cron: '17 9 \* \* 0'/)
  })
})
