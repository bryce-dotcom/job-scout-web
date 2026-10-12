import { describe, it, expect, vi } from 'vitest'
import { pickEstimateForJob, linkLeadEstimateToJob, MAX_DAYS } from './leadEstimateLink.js'

const job = { id: 900, created_at: '2026-03-09T18:00:00Z' }

describe('pickEstimateForJob: the one estimate a lead-page job plausibly is', () => {
  it('the most recent staged estimate written shortly before the job', () => {
    const quotes = [
      { id: 1, status: 'Sent', created_at: '2026-03-01T00:00:00Z' },
      { id: 2, status: 'Sent', created_at: '2026-03-09T10:00:00Z' },
      { id: 3, status: 'Draft', created_at: '2026-03-09T12:00:00Z' },
    ]
    expect(pickEstimateForJob(quotes, job.created_at)?.id).toBe(2)
  })
  it('never a draft, a rejected one, or one that is already a job', () => {
    expect(pickEstimateForJob([{ id: 1, status: 'Draft', created_at: '2026-03-09T00:00:00Z' }], job.created_at)).toBeNull()
    expect(pickEstimateForJob([{ id: 1, status: 'Rejected', created_at: '2026-03-09T00:00:00Z' }], job.created_at)).toBeNull()
    expect(pickEstimateForJob([{ id: 1, status: 'Approved', created_at: '2026-03-09T00:00:00Z', job_id: 55 }], job.created_at)).toBeNull()
  })
  it("a repeat customer's old estimates are not this job", () => {
    expect(MAX_DAYS).toBe(120)
    const old = [{ id: 106, status: 'Sent', created_at: '2021-08-18T00:00:00Z' }, { id: 119, status: 'Sent', created_at: '2022-02-15T00:00:00Z' }]
    expect(pickEstimateForJob(old, '2026-01-08T00:00:00Z')).toBeNull()
  })
  it('nor an estimate written after the job', () => {
    expect(pickEstimateForJob([{ id: 1, status: 'Sent', created_at: '2026-03-12T00:00:00Z' }], job.created_at)).toBeNull()
  })
  it('survives junk', () => {
    expect(pickEstimateForJob(null, job.created_at)).toBeNull()
    expect(pickEstimateForJob([null, {}], job.created_at)).toBeNull()
    expect(pickEstimateForJob([{ id: 1, status: 'Sent', created_at: 'nope' }], job.created_at)).toBeNull()
    expect(pickEstimateForJob([{ id: 1, status: 'Sent', created_at: '2026-03-09T00:00:00Z' }], 'nope')).toBeNull()
  })
})

describe('linkLeadEstimateToJob writes both sides and never throws', () => {
  const makeSb = (fail = null) => {
    const calls = []
    const chain = (table) => ({
      update: (patch) => ({
        eq: (col, val) => ({
          is: async () => { calls.push({ table, patch, col, val }); return { error: fail === table ? new Error('boom') : null } },
        }),
      }),
    })
    return { from: vi.fn((table) => chain(table)), calls }
  }
  const quotes = [{ id: 2704, status: 'Sent', created_at: '2026-03-09T10:00:00Z' }]
  it('stamps quotes.job_id and jobs.quote_id', async () => {
    const sb = makeSb()
    expect((await linkLeadEstimateToJob(sb, { quotes, job }))?.id).toBe(2704)
    expect(sb.calls).toEqual([
      { table: 'quotes', patch: { job_id: 900 }, col: 'id', val: 2704 },
      { table: 'jobs', patch: { quote_id: 2704 }, col: 'id', val: 900 },
    ])
  })
  it('does nothing without a candidate, and reports null on a failed write', async () => {
    const sb = makeSb()
    expect(await linkLeadEstimateToJob(sb, { quotes: [], job })).toBeNull()
    expect(sb.calls).toEqual([])
    expect(await linkLeadEstimateToJob(makeSb('quotes'), { quotes, job })).toBeNull()
    expect(await linkLeadEstimateToJob({ from: () => { throw new Error('offline') } }, { quotes, job })).toBeNull()
  })
})
