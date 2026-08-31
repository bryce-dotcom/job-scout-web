import { describe, it, expect, vi } from 'vitest'
import { fetchUtilityInvoicedJobIds, isUtilityInvoiced } from './utilityInvoiced'

// Minimal PostgREST stand-in: .from().select().eq().not() resolves to a result.
const fakeSupabase = (result) => {
  const chain = {
    select: () => chain,
    eq: () => chain,
    not: () => Promise.resolve(result),
  }
  return { from: () => chain }
}

describe('fetchUtilityInvoicedJobIds', () => {
  it('returns the job ids that have a utility invoice', async () => {
    const sb = fakeSupabase({ data: [{ job_id: 21014 }, { job_id: 21005 }], error: null })
    const ids = await fetchUtilityInvoicedJobIds(sb, 3)
    expect(ids.has('21014')).toBe(true)
    expect(ids.has('21005')).toBe(true)
    expect(ids.size).toBe(2)
  })

  it('collapses several utility invoices on one job to a single entry', async () => {
    const sb = fakeSupabase({ data: [{ job_id: 21014 }, { job_id: 21014 }], error: null })
    expect((await fetchUtilityInvoicedJobIds(sb, 3)).size).toBe(1)
  })

  it('drops rows with no job_id rather than matching every job', async () => {
    const sb = fakeSupabase({ data: [{ job_id: null }, { job_id: 21014 }], error: null })
    const ids = await fetchUtilityInvoicedJobIds(sb, 3)
    expect(ids.size).toBe(1)
    expect(ids.has('21014')).toBe(true)
  })

  // A failed lookup must hide the badge, never break the job list.
  it('returns an empty set on error instead of throwing', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const sb = fakeSupabase({ data: null, error: { message: 'boom' } })
    expect((await fetchUtilityInvoicedJobIds(sb, 3)).size).toBe(0)
    warn.mockRestore()
  })

  it('returns an empty set without a client or a company', async () => {
    expect((await fetchUtilityInvoicedJobIds(null, 3)).size).toBe(0)
    expect((await fetchUtilityInvoicedJobIds(fakeSupabase({ data: [], error: null }), null)).size).toBe(0)
  })
})

describe('isUtilityInvoiced', () => {
  const ids = new Set(['21014'])

  it('matches a job whose id is in the set', () => {
    expect(isUtilityInvoiced(ids, { id: 21014 })).toBe(true)
  })

  it('does not match a job that has no utility invoice', () => {
    expect(isUtilityInvoiced(ids, { id: 99999 })).toBe(false)
  })

  // jobs.lead_id is TEXT while leads.id is INT — that mismatch made rep totals
  // read low. Compare as strings so this can never repeat here.
  it('matches regardless of whether the id arrives as a number or a string', () => {
    expect(isUtilityInvoiced(ids, { id: '21014' })).toBe(true)
    expect(isUtilityInvoiced(new Set(['21014']), { id: 21014 })).toBe(true)
  })

  it('is false for missing input rather than throwing', () => {
    expect(isUtilityInvoiced(ids, null)).toBe(false)
    expect(isUtilityInvoiced(null, { id: 21014 })).toBe(false)
    expect(isUtilityInvoiced(ids, {})).toBe(false)
  })
})
