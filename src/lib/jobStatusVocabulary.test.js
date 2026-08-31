import { describe, it, expect } from 'vitest'
import { resolveJobStatuses, HIDDEN_JOB_STATUSES } from './jobStatusVocabulary'

// Company 3's real configured list, shortened to the tail that matters.
const CONFIGURED = [
  { id: 'Scheduled', name: 'Scheduled', color: '#5a6349' },
  { id: 'In Progress', name: 'In Progress', color: '#c28b38' },
  { id: 'Completed', name: 'Completed', color: '#4a7c59' },
  { id: 'Invoiced', name: 'Invoiced', color: '#5a6349' },
  { id: 'Paid', name: 'Paid', color: '#4a7c59' },
]

describe('resolveJobStatuses', () => {
  it('returns the configured list unchanged when nothing new is in the data', () => {
    const jobs = [{ status: 'Scheduled' }, { status: 'Completed' }, { status: 'Paid' }]
    expect(resolveJobStatuses(CONFIGURED, jobs)).toEqual(CONFIGURED)
  })

  it('is a no-op before jobs have loaded', () => {
    expect(resolveJobStatuses(CONFIGURED, [])).toEqual(CONFIGURED)
    expect(resolveJobStatuses(CONFIGURED, null)).toEqual(CONFIGURED)
  })

  // The actual bug. 126 HHH jobs sat at 'Invoiced' — written by InvoiceDetail
  // on send — while no tenant had it configured, so the board had no column
  // for them and getFilteredJobs dropped every one.
  it('gives an unconfigured status that exists in the data its own column', () => {
    const configured = CONFIGURED.filter((s) => s.id !== 'Invoiced')
    const jobs = [{ status: 'Scheduled' }, { status: 'Invoiced' }]
    const out = resolveJobStatuses(configured, jobs)
    const ids = out.map((s) => s.id)
    expect(ids).toContain('Invoiced')
    expect(out.find((s) => s.id === 'Invoiced').discovered).toBe(true)
  })

  it('never drops a status the data contains', () => {
    const jobs = [{ status: 'Invoiced' }, { status: 'Awaiting Parts' }, { status: 'Scheduled' }]
    const ids = resolveJobStatuses([], jobs).map((s) => s.id)
    for (const j of jobs) expect(ids).toContain(j.status)
  })

  it('keeps configured order and appends discovered statuses after it', () => {
    const jobs = [{ status: 'Mystery' }]
    const out = resolveJobStatuses(CONFIGURED, jobs)
    expect(out.slice(0, CONFIGURED.length)).toEqual(CONFIGURED)
    expect(out[out.length - 1].id).toBe('Mystery')
  })

  it('does not flag configured statuses as discovered', () => {
    const jobs = [{ status: 'Invoiced' }, { status: 'Mystery' }]
    const out = resolveJobStatuses(CONFIGURED, jobs)
    expect(out.find((s) => s.id === 'Invoiced').discovered).toBeUndefined()
    expect(out.find((s) => s.id === 'Mystery').discovered).toBe(true)
  })

  // Failing open must not bury the board: company 3 has 6,196 archived jobs.
  it('holds back the deliberately hidden statuses', () => {
    const jobs = [{ status: 'Archived' }, { status: 'Cancelled' }, { status: 'Invoiced' }]
    const ids = resolveJobStatuses([], jobs).map((s) => s.id)
    expect(ids).toEqual(['Invoiced'])
    expect(HIDDEN_JOB_STATUSES.has('Archived')).toBe(true)
    expect(HIDDEN_JOB_STATUSES.has('Cancelled')).toBe(true)
  })

  it('still shows a hidden status if the tenant configured it on purpose', () => {
    const configured = [{ id: 'Archived', name: 'Archived', color: '#999' }]
    expect(resolveJobStatuses(configured, [{ status: 'Archived' }]).map((s) => s.id)).toEqual(['Archived'])
  })

  it('emits one column per distinct status, not one per job', () => {
    const jobs = Array.from({ length: 50 }, () => ({ status: 'Invoiced' }))
    expect(resolveJobStatuses([], jobs)).toHaveLength(1)
  })

  it('ignores jobs with no status', () => {
    const jobs = [{ status: null }, { status: '' }, {}, { status: 'Invoiced' }]
    expect(resolveJobStatuses([], jobs).map((s) => s.id)).toEqual(['Invoiced'])
  })

  it('colours a discovered status from the supplied map, else a neutral grey', () => {
    const jobs = [{ status: 'Invoiced' }, { status: 'Mystery' }]
    const out = resolveJobStatuses([], jobs, { colors: { Invoiced: '#5a6349' } })
    expect(out.find((s) => s.id === 'Invoiced').color).toBe('#5a6349')
    expect(out.find((s) => s.id === 'Mystery').color).toBe('#9ca3af')
  })

  it('does not mutate the configured list it was given', () => {
    const configured = [{ id: 'Scheduled', name: 'Scheduled', color: '#5a6349' }]
    const before = JSON.stringify(configured)
    resolveJobStatuses(configured, [{ status: 'Invoiced' }])
    expect(JSON.stringify(configured)).toBe(before)
  })
})
