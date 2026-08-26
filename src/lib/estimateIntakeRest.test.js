// The REST writer the two edge functions share. It runs in Deno, but it uses
// nothing beyond global fetch, so it is exercised here against a fake fetch
// alongside the supabase-js writer it mirrors.
import { describe, it, expect } from 'vitest'
import {
  createEstimateFromIntakeRest,
  IntakeWriteError,
} from '../../supabase/functions/_shared/estimateIntakeRest.ts'

const BASE = 'https://x.supabase.co'
const target = { baseUrl: BASE, headers: { apikey: 'k' } }

const base = (over) => ({
  source: 'test', company_id: 3, lead_id: 4060,
  lines: [{ item_name: 'A', quantity: 2, price: 10 }],
  ...over,
})

/**
 * @param opts.quote     'ok' | 'reject' | 'empty'
 * @param opts.lines     'ok' | 'reject' | number (how many rows come back)
 * @param opts.rollback  'ok' | 'reject' | 'nothing' (DELETE matched no rows)
 */
function fakeFetch(opts = {}) {
  const { quote = 'ok', lines = 'ok', rollback = 'ok' } = opts
  const calls = []
  const res = (status, body) => Promise.resolve(new Response(
    body === null ? '' : JSON.stringify(body),
    { status, headers: { 'Content-Type': 'application/json' } },
  ))

  const impl = (url, init = {}) => {
    calls.push({ url, method: init.method, body: init.body ? JSON.parse(init.body) : null })

    if (url.includes('/quotes') && init.method === 'POST') {
      if (quote === 'reject') return res(400, { code: '23502', message: 'null value in column "company_id"' })
      if (quote === 'empty') return res(201, [])
      return res(201, [{ id: 555, company_id: 3 }])
    }
    if (url.includes('/quote_lines') && init.method === 'POST') {
      if (lines === 'reject') {
        return res(400, { code: '22P02', message: 'invalid input syntax for type integer', details: 'row 1' })
      }
      const sent = JSON.parse(init.body)
      const n = typeof lines === 'number' ? lines : sent.length
      return res(201, sent.slice(0, n).map((_, i) => ({ id: 900 + i })))
    }
    if (url.includes('/quotes') && init.method === 'DELETE') {
      if (rollback === 'reject') return res(500, { message: 'nope' })
      if (rollback === 'nothing') return res(200, [])
      return res(200, [{ id: 555 }])
    }
    if (url.includes('/leads')) return res(200, [{ id: 4060 }])
    throw new Error(`unexpected fetch: ${init.method} ${url}`)
  }

  return { impl, calls }
}

async function withFetch(fake, fn) {
  const real = globalThis.fetch
  globalThis.fetch = fake.impl
  try { return await fn() } finally { globalThis.fetch = real }
}

describe('createEstimateFromIntakeRest', () => {
  it('writes the header, the lines, and links the lead', async () => {
    const fake = fakeFetch()
    const out = await withFetch(fake, () => createEstimateFromIntakeRest(target, base()))
    expect(out.quoteId).toBe(555)
    expect(out.lineCount).toBe(1)
    expect(fake.calls.map(c => `${c.method} ${c.url.split('/rest/v1/')[1].split('?')[0]}`))
      .toEqual(['POST quotes', 'POST quote_lines', 'PATCH leads'])
    expect(fake.calls[2].body).toEqual({ quote_id: 555, status: 'Estimate Sent' })
  })

  it('can leave the lead status alone — Lenard creates a Draft nobody has sent', async () => {
    const fake = fakeFetch()
    await withFetch(fake, () => createEstimateFromIntakeRest(target, base(), { advanceLeadTo: null }))
    expect(fake.calls[2].body).toEqual({ quote_id: 555 })
  })

  // This is the bug that shipped: lenard-save's supabasePost threw on a non-2xx
  // quote_lines response, so the rollback under it never ran and the header
  // stayed in the pipeline with a total and no lines.
  it('rolls the header back when PostgREST REJECTS the lines', async () => {
    const fake = fakeFetch({ lines: 'reject' })
    await withFetch(fake, () => expect(createEstimateFromIntakeRest(target, base()))
      .rejects.toThrow(/lines failed, header rolled back/))
    const del = fake.calls.find(c => c.method === 'DELETE')
    expect(del.url).toContain('quotes?id=eq.555')
    expect(fake.calls.some(c => c.url.includes('/leads'))).toBe(false)
  })

  it('carries the database\'s actual reason out, not a bare "insert failed"', async () => {
    const fake = fakeFetch({ lines: 'reject' })
    await withFetch(fake, () => expect(createEstimateFromIntakeRest(target, base()))
      .rejects.toThrow(/invalid input syntax for type integer \| row 1 \| 22P02/))
  })

  it('treats a short write as a failure — a half-itemised bid looks finished', async () => {
    const fake = fakeFetch({ lines: 1 })
    const intake = base({ lines: [{ item_name: 'A' }, { item_name: 'B' }] })
    await withFetch(fake, () => expect(createEstimateFromIntakeRest(target, intake))
      .rejects.toThrow(/only 1 of 2 lines were written/))
    expect(fake.calls.some(c => c.method === 'DELETE')).toBe(true)
  })

  it('says so when the rollback ITSELF fails, rather than claiming a clean undo', async () => {
    for (const rollback of ['reject', 'nothing']) {
      const fake = fakeFetch({ lines: 'reject', rollback })
      const err = await withFetch(fake, () =>
        createEstimateFromIntakeRest(target, base()).catch(e => e))
      expect(err).toBeInstanceOf(IntakeWriteError)
      expect(err.kind).toBe('lines')
      expect(err.rolledBack).toBe(false)
      expect(err.orphanQuoteId).toBe(555)
      expect(err.message).toMatch(/rollback failed/)
      expect(err.message).toMatch(/Quote #555 is still in the pipeline/)
    }
  })

  it('reports a rolled-back failure as rolled back', async () => {
    const fake = fakeFetch({ lines: 'reject' })
    const err = await withFetch(fake, () =>
      createEstimateFromIntakeRest(target, base()).catch(e => e))
    expect(err.rolledBack).toBe(true)
    expect(err.orphanQuoteId).toBe(null)
  })

  it('surfaces a header failure and never touches the lines', async () => {
    const fake = fakeFetch({ quote: 'reject' })
    await withFetch(fake, () => expect(createEstimateFromIntakeRest(target, base()))
      .rejects.toThrow(/header failed.*null value in column "company_id"/s))
    expect(fake.calls.some(c => c.url.includes('quote_lines'))).toBe(false)
  })

  it('treats a 2xx header with no row as a failure', async () => {
    const fake = fakeFetch({ quote: 'empty' })
    await withFetch(fake, () => expect(createEstimateFromIntakeRest(target, base()))
      .rejects.toThrow(/header failed/))
    expect(fake.calls.some(c => c.url.includes('quote_lines'))).toBe(false)
  })

  it('never writes anything for an invalid intake, and says it was the payload', async () => {
    const fake = fakeFetch()
    const err = await withFetch(fake, () =>
      createEstimateFromIntakeRest(target, base({ lines: [] })).catch(e => e))
    expect(err.message).toMatch(/at least one line/)
    // lenard-save answers 4xx on this and 5xx on the rest.
    expect(err.kind).toBe('invalid')
    expect(fake.calls).toEqual([])
  })

  it('sends exactly the shared shape — quote_id, sort_order and derived totals', async () => {
    const fake = fakeFetch()
    await withFetch(fake, () => createEstimateFromIntakeRest(target, base({
      lines: [{ item_name: 'A', quantity: 2, price: 10 }, { item_name: 'B', price: 5 }],
    })))
    const sent = fake.calls.find(c => c.url.includes('quote_lines')).body
    expect(sent.map(r => [r.item_name, r.quote_id, r.sort_order, r.line_total]))
      .toEqual([['A', 555, 0, 20], ['B', 555, 1, 5]])
  })
})
