import { describe, it, expect, vi } from 'vitest'

vi.mock('./supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }))

import {
  normalizeResearchResults,
  mergeResearchResults,
  parseStreamedJson,
  runWithConcurrency,
  researchUtilityState,
} from './utilityResearch'

describe('normalizeResearchResults', () => {
  it('always yields the six arrays and maps legacy "rates" to incentives', () => {
    const out = normalizeResearchResults({ providers: [{ a: 1 }], rates: [{ r: 1 }] })
    expect(Object.keys(out).sort()).toEqual(['forms', 'incentives', 'prescriptive_measures', 'programs', 'providers', 'rate_schedules'])
    expect(out.providers).toEqual([{ a: 1 }])
    expect(out.incentives).toEqual([{ r: 1 }])
    expect(out.forms).toEqual([])
  })
  it('tolerates garbage', () => {
    expect(normalizeResearchResults(null).programs).toEqual([])
    expect(normalizeResearchResults({ programs: 'nope' }).programs).toEqual([])
  })
})

describe('mergeResearchResults', () => {
  it('appends a measures phase onto the discover document', () => {
    const base = normalizeResearchResults({ programs: [{ program_name: 'A' }] })
    mergeResearchResults(base, { incentives: [{ i: 1 }], prescriptive_measures: [{ m: 1 }] })
    mergeResearchResults(base, { incentives: [{ i: 2 }] })
    expect(base.programs).toHaveLength(1)
    expect(base.incentives).toEqual([{ i: 1 }, { i: 2 }])
    expect(base.prescriptive_measures).toEqual([{ m: 1 }])
  })
})

describe('parseStreamedJson', () => {
  const res = (text, ok = true, status = 200) => ({ ok, status, statusText: '', text: async () => text })
  it('skips the heartbeat whitespace before the document', async () => {
    const data = await parseStreamedJson(res('      \n  {"success":true,"x":1}'))
    expect(data).toEqual({ success: true, x: 1 })
  })
  it('surfaces the gateway message on a non-200', async () => {
    await expect(parseStreamedJson(res('{"code":"IDLE_TIMEOUT","message":"Request idle timeout limit (150s) reached"}', false, 504)))
      .rejects.toThrow(/idle timeout/)
  })
  it('rejects an empty 200 body', async () => {
    await expect(parseStreamedJson(res('   '))).rejects.toThrow(/Empty response/)
  })
})

describe('runWithConcurrency', () => {
  it('keeps item order and never exceeds the limit', async () => {
    let inFlight = 0, peak = 0
    const out = await runWithConcurrency([30, 10, 20], 2, async (ms, i) => {
      inFlight++; peak = Math.max(peak, inFlight)
      await new Promise(r => setTimeout(r, ms))
      inFlight--
      return i
    })
    expect(out).toEqual([0, 1, 2])
    expect(peak).toBe(2)
  })
  it('handles an empty list', async () => {
    expect(await runWithConcurrency([], 3, async () => 1)).toEqual([])
  })
})

describe('researchUtilityState', () => {
  const programs = [
    { provider_name: 'RMP', program_name: 'wattsmart (2025)' },
    { provider_name: 'RMP', program_name: 'Express (2025)' },
  ]
  const fakeCall = (measuresFor = () => ({ success: true, results: { incentives: [{ i: 1 }], prescriptive_measures: [{ m: 1 }, { m: 2 }] } })) =>
    vi.fn(async (body) => {
      if (body.phase === 'discover') return { success: true, results: { providers: [{ provider_name: 'RMP' }], programs, rate_schedules: [{ s: 1 }], forms: [] } }
      if (body.phase === 'measures') return measuresFor(body.programs[0])
      if (body.phase === 'pdfs') return { success: true, discovered_pdfs: [{ url: 'x.pdf' }] }
    })

  it('runs discover, then one measures call per program, and merges', async () => {
    const call = fakeCall()
    const progress = []
    const { results, failures, discovered_pdfs } = await researchUtilityState({ state: 'UT', call, onProgress: (m) => progress.push(m) })
    expect(call).toHaveBeenCalledTimes(3)
    expect(call.mock.calls.filter(([b]) => b.phase === 'measures').map(([b]) => b.programs[0].program_name).sort())
      .toEqual(['Express (2025)', 'wattsmart (2025)'])
    expect(results.providers).toHaveLength(1)
    expect(results.incentives).toHaveLength(2)
    expect(results.prescriptive_measures).toHaveLength(4)
    expect(results.rate_schedules).toHaveLength(1)
    expect(failures).toEqual([])
    expect(discovered_pdfs).toEqual([])
    expect(progress.at(-1)).toMatch(/Measures 2\/2/)
  })

  it('keeps the document when one program\'s measures fail', async () => {
    const call = fakeCall((p) => p.program_name.startsWith('Express')
      ? { success: false, error: 'AI analysis failed' }
      : { success: true, results: { incentives: [{ i: 1 }], prescriptive_measures: [] } })
    const { results, failures } = await researchUtilityState({ state: 'UT', call })
    expect(results.incentives).toHaveLength(1)
    expect(failures).toEqual([{ program_name: 'Express (2025)', provider_name: 'RMP', error: 'AI analysis failed' }])
  })

  it('treats a thrown measures call as a failure, not a crash', async () => {
    const call = fakeCall(() => { throw new Error('504 Gateway Timeout') })
    const { failures } = await researchUtilityState({ state: 'UT', call })
    expect(failures).toHaveLength(2)
    expect(failures[0].error).toMatch(/504/)
  })

  it('runs the pdfs phase only when asked', async () => {
    const call = fakeCall()
    const { discovered_pdfs } = await researchUtilityState({ state: 'UT', fetchPdfs: true, call })
    expect(discovered_pdfs).toEqual([{ url: 'x.pdf' }])
    expect(call.mock.calls.at(-1)[0]).toMatchObject({ phase: 'pdfs' })
  })

  it('fails loudly when discover fails', async () => {
    const call = vi.fn(async () => ({ success: false, error: 'State is required' }))
    await expect(researchUtilityState({ state: 'UT', call })).rejects.toThrow('State is required')
  })
})
