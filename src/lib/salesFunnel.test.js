import { describe, it, expect } from 'vitest'
import { computeSalesFunnel, funnelTotals, funnelWindow, funnelSince, UNATTRIBUTED } from './salesFunnel'

// ─────────────────────────────────────────────────────────────────────────
// The Sales Performance page, against what the real data does (HHH 2026):
// one credit rule shared with the pipeline and payroll, an honest total,
// drafts not counted as written, closed value = what was sold, and windows
// that end at "now".
// ─────────────────────────────────────────────────────────────────────────

const employees = [{ id: 1, name: 'Noah' }, { id: 2, name: 'Cole' }, { id: 3, name: 'Tracy' }]
const leads = [
  { id: 10, salesperson_id: 1 },                                  // Noah's lead
  { id: 11, salesperson_id: null, lead_owner_id: 3 },             // Tracy OWNS it; nobody is selling it
  { id: 12, salesperson_id: null, salesperson_ids: [2, 1] },      // two reps on the lead; Cole is first
  { id: 13 },                                                     // nothing
]
const now = '2026-07-20T12:00:00Z'
const appointments = [
  { salesperson_id: 1, lead_id: 10, start_time: '2026-07-10T17:00:00Z' },
  { salesperson_id: 1, lead_id: 10, start_time: '2026-07-11T17:00:00Z' },
  { salesperson_id: 2, lead_id: 12, start_time: '2026-07-12T17:00:00Z' },
  { salesperson_id: 2, appointment_type: 'Block', start_time: '2026-07-12T18:00:00Z' },        // blocked time
  { employee_id: 7, job_id: 500, appointment_type: 'Job', start_time: '2026-07-13T17:00:00Z' }, // field work, not a meeting
  { employee_id: 7, job_id: 501, appointment_type: 'Recurring Job', start_time: '2026-07-13T18:00:00Z' },
  { salesperson_ids: [2], lead_id: 13, start_time: '2026-07-14T17:00:00Z' },                    // rep only in the array
  { lead_id: 10, start_time: '2026-07-15T17:00:00Z' },                                          // no rep on it: the lead's rep (Noah)
  { lead_id: 11, start_time: '2026-07-15T18:00:00Z' },                                          // Tracy's lead, no seller: nobody's meeting
  { salesperson_id: 1, lead_id: 10, start_time: '2026-08-01T17:00:00Z' },                       // booked for later: not yet
]
const quotes = [
  { id: 100, lead_id: 10, status: 'Approved', quote_amount: 5000, created_at: '2026-07-13T00:00:00Z' },        // Noah, closed, became job 900 ($5,400)
  { id: 101, lead_id: 10, status: 'Sent', quote_amount: 800, created_at: '2026-07-14T00:00:00Z' },            // Noah, sent
  { id: 102, lead_id: 10, status: 'Draft', quote_amount: 999, created_at: '2026-07-14T01:00:00Z' },           // a draft: not written
  { id: 103, lead_id: 11, status: 'Approved', quote_amount: 3000, created_at: '2026-07-15T00:00:00Z' },       // Tracy's lead — unattributed, closed
  { id: 104, lead_id: 12, status: 'Sent', quote_amount: 700, created_at: '2026-07-16T00:00:00Z' },            // Cole via salesperson_ids
  { id: 105, salesperson_id: 2, lead_id: null, status: 'Sent', quote_amount: 600, created_at: '2026-07-17T00:00:00Z' }, // Cole on the quote
  { id: 106, lead_id: 13, status: 'Sent', quote_amount: 400, created_at: '2026-07-18T00:00:00Z', job_id: 901 },        // no rep anywhere but the job it became has one (Cole)
  { id: 107, lead_id: null, status: 'Approved', quote_amount: 1651117.14, created_at: '2026-07-18T00:00:00Z', job_id: 902 }, // the $1.65M typo; the job is $16,299.20
  { id: 108, lead_id: 10, status: 'Sent', quote_amount: 100, created_at: '2026-06-01T00:00:00Z' },            // before the window
]
const jobs = [
  { id: 900, quote_id: 100, job_total: 5400 },
  { id: 901, salesperson_id: 2, job_total: 450 },
  { id: 902, salesperson_id: 1, job_total: 16299.2 },
]
const win = { sinceIso: '2026-07-01T00:00:00Z', untilIso: now }
const rows = computeSalesFunnel({ appointments, quotes, leads, employees, jobs }, win)
const noah = rows.find((r) => r.repId === '1')
const cole = rows.find((r) => r.repId === '2')
const tracy = rows.find((r) => r.repId === '3')
const nobody = rows.find((r) => r.repId === null)

describe('meetings', () => {
  it('counts sales meetings per rep and nothing that is field work or blocked time', () => {
    expect(noah.meetings).toBe(3)   // two of his own + the one on his lead with no rep on it
    expect(cole.meetings).toBe(2)   // one direct + one where he is only in salesperson_ids
  })
  it('does not count a meeting booked for after the window', () => {
    expect(rows.reduce((s, r) => s + r.meetings, 0)).toBe(5)
  })
  it('a meeting on a lead nobody is selling is not credited to the lead owner', () => {
    expect(tracy).toBeUndefined()
  })
})

describe('estimates and closes', () => {
  it('credits by the one ownership rule — the lead owner is not a seller', () => {
    expect(noah.takeoffs).toBe(3)  // 100, 101, and the $1.65M one via its job's rep
    expect(cole.takeoffs).toBe(3)  // 104 via salesperson_ids, 105 direct, 106 via the job it became
    expect(tracy).toBeUndefined()
  })
  it('keeps what nobody is credited for in an Unattributed row so the totals are whole', () => {
    expect(nobody).toBeDefined()
    expect(nobody.repName).toBe('Unattributed')
    expect(nobody.takeoffs).toBe(1)
    expect(nobody.closed).toBe(1)
    expect(nobody.closedValue).toBe(3000)
  })
  it('a draft is not an estimate written', () => {
    expect(rows.reduce((s, r) => s + r.takeoffs, 0)).toBe(7)
  })
  it('closed = approved, or turned into a job', () => {
    expect(noah.closed).toBe(2)   // 100 approved, 107 approved
    expect(cole.closed).toBe(1)   // 106: Sent, but it became a job
  })
  it('closed value is the job total once there is a job — the $1.65M estimate is worth its $16,299.20 job', () => {
    expect(noah.closedValue).toBe(5400 + 16299.2)
    expect(cole.closedValue).toBe(450)
  })
  it('close rate = closed / estimates', () => {
    expect(noah.closeRate).toBe(67)
    expect(cole.closeRate).toBe(33)
  })
  it('orders reps by results and puts Unattributed last', () => {
    expect(rows[rows.length - 1].repId).toBe(null)
    expect(rows[0].repId).toBe('1')
  })
})

describe('totals', () => {
  it('are the whole company, unattributed included', () => {
    expect(funnelTotals(rows)).toMatchObject({ meetings: 5, takeoffs: 7, closed: 4, closeRate: 57 })
    expect(funnelTotals(rows).closedValue).toBe(5400 + 16299.2 + 450 + 3000)
  })
})

describe('windows end at now', () => {
  const at = new Date('2026-07-20T12:00:00Z')
  it('every named range has an end, and "all" has no start', () => {
    for (const r of ['mtd', 'ytd', 'last90']) {
      const w = funnelWindow(r, at)
      expect(w.sinceIso).toBeTruthy()
      expect(w.untilIso).toBe(at.toISOString())
    }
    expect(funnelWindow('all', at).sinceIso).toBe(null)
    expect(funnelWindow('all', at).untilIso).toBe(at.toISOString())
  })
  it('funnelSince still answers the start', () => {
    expect(funnelSince('ytd', at)).toBe(new Date(2026, 0, 1).toISOString())
  })
  it('nothing outside the window counts, in either direction', () => {
    const later = computeSalesFunnel({ appointments, quotes, leads, employees, jobs }, { sinceIso: '2026-07-14T00:00:00Z', untilIso: '2026-07-16T23:59:59Z' })
    const n = later.find((r) => r.repId === '1')
    expect(n.meetings).toBe(1)     // the 07-15 one on his lead
    expect(n.takeoffs).toBe(1)     // only 101 (the draft never counts)
  })
})

describe('junk', () => {
  it('survives empty and missing inputs', () => {
    expect(computeSalesFunnel()).toEqual([])
    expect(computeSalesFunnel({ appointments: [null], quotes: [null], leads: [null], employees: [null], jobs: [null] })).toEqual([])
    expect(funnelTotals([])).toMatchObject({ meetings: 0, takeoffs: 0, closed: 0, closedValue: 0, closeRate: 0 })
  })
  it(`exports the unattributed key (${UNATTRIBUTED})`, () => {
    expect(UNATTRIBUTED).toBe('unattributed')
  })
})
