// A count a person reads must be the TRUE count, not the page size.
// Cole's daily refresh said "200 stale quotes" (there were 931) and "50
// approved estimates not yet jobs" (there were 157) because those were the
// limit= on a single read (2026-10-14).
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { readAllRecords } from '../../supabase/functions/_shared/arnieRest.ts'

const src = (f) => readFileSync(new URL(`../../supabase/functions/_shared/${f}`, import.meta.url), 'utf8')

afterEach(() => vi.unstubAllGlobals())

describe('readAllRecords', () => {
  it('pages past the 1000-row server cap until a short page', async () => {
    const ranges = []
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      const range = init.headers.Range
      ranges.push(range)
      const from = Number(range.split('-')[0])
      const n = Math.max(0, Math.min(1000, 2345 - from))
      return { ok: true, status: 206, json: async () => Array.from({ length: n }, (_, i) => ({ id: from + i })) }
    }))
    const rows = await readAllRecords({ url: 'https://x', key: 'k' }, 'quotes?select=id')
    expect(rows).toHaveLength(2345)
    expect(ranges).toEqual(['0-999', '1000-1999', '2000-2999'])
  })

  it('stops on a failed read rather than looping', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })))
    expect(await readAllRecords({ url: 'https://x', key: 'k' }, 'quotes?select=id')).toEqual([])
  })
})

describe('the counts Cole reads are uncapped', () => {
  it('stale quotes in the brief are read in full', () => {
    const line = src('arnieBrief.ts').split('\n').find((l) => l.includes('quotes?select=') && l.includes('approved_date=is.null'))
    expect(line).toMatch(/readAllRecords\(/)
    expect(line).not.toMatch(/limit=/)
  })

  it('approved estimates not yet jobs are read in full', () => {
    const line = src('arnieRefresh.ts').split('\n').find((l) => l.includes('status=eq.Approved&job_id=is.null'))
    expect(line).toMatch(/readAllRecords\(/)
    expect(line).not.toMatch(/limit=/)
  })

  it('an estimate a job points back to counts as converted', () => {
    expect(src('arnieRefresh.ts')).toMatch(/jobs\?select=quote_id/)
  })
})
