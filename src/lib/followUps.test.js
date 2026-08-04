import { describe, it, expect } from 'vitest'
import {
  latestByLead, daysSince, followUpState, followUpQueue, buildFollowUpRow,
  COLD, DUE, AGING, FRESH, UNTOUCHED,
} from './followUps'

const NOW = new Date('2026-08-04T18:00:00Z').getTime()
const ago = (d) => new Date(NOW - d * 86400000).toISOString()
const touch = (over = {}) => ({ id: 1, lead_id: 10, contacted_at: ago(1), ...over })

describe('finding the last touch', () => {
  it('picks the most recent, whatever order rows arrive in', () => {
    const m = latestByLead([
      touch({ id: 1, contacted_at: ago(10), note: 'old' }),
      touch({ id: 2, contacted_at: ago(2), note: 'newest' }),
      touch({ id: 3, contacted_at: ago(6), note: 'middle' }),
    ])
    expect(m.get('10').note).toBe('newest')
  })

  it('keeps leads apart', () => {
    const m = latestByLead([touch({ lead_id: 10 }), touch({ lead_id: 20 })])
    expect(m.size).toBe(2)
  })

  it('matches whether the id is a string or a number', () => {
    // jobs.lead_id is TEXT while leads.id is INT — the trap that cost us
    // $232,049 of attribution. Keys are strings on both sides here.
    const m = latestByLead([touch({ lead_id: '10' })])
    expect(m.get('10')).toBeTruthy()
  })

  it('ignores rows with no lead', () => {
    expect(latestByLead([{ contacted_at: ago(1) }]).size).toBe(0)
    expect(latestByLead(null).size).toBe(0)
  })
})

describe('how a deal reads', () => {
  it('a deal never touched says so', () => {
    expect(followUpState(null, NOW).state).toBe(UNTOUCHED)
  })

  it('recently worked is left alone', () => {
    expect(followUpState(touch({ contacted_at: ago(2) }), NOW).state).toBe(FRESH)
  })

  it('drifts to aging after a week', () => {
    expect(followUpState(touch({ contacted_at: ago(8) }), NOW).state).toBe(AGING)
  })

  it('goes cold after two weeks, and says how long', () => {
    const s = followUpState(touch({ contacted_at: ago(24) }), NOW)
    expect(s.state).toBe(COLD)
    expect(s.label).toBe('24 days cold')
  })

  it('a scheduled callback beats the day count', () => {
    // "Call back Tuesday" must surface on Tuesday even if they spoke Monday.
    const s = followUpState(touch({ contacted_at: ago(1), next_follow_up_at: ago(0) }), NOW)
    expect(s.state).toBe(DUE)
  })

  it('says how overdue a scheduled callback is', () => {
    const s = followUpState(touch({ contacted_at: ago(1), next_follow_up_at: ago(3) }), NOW)
    expect(s.label).toBe('Due 3d ago')
  })

  it('a callback still in the future does NOT nag', () => {
    const future = new Date(NOW + 3 * 86400000).toISOString()
    const s = followUpState(touch({ contacted_at: ago(2), next_follow_up_at: future }), NOW)
    expect(s.state).toBe(FRESH)
  })

  it('survives a junk timestamp instead of showing NaN days', () => {
    expect(followUpState({ contacted_at: 'nonsense' }, NOW).state).toBe(UNTOUCHED)
    expect(daysSince(null)).toBeNull()
  })
})

describe('the queue is a worklist, not a bucket', () => {
  const open = (s) => !['Won', 'Lost', 'Closed', 'Paid'].includes(s)
  const cards = [
    { id: 1, status: 'Negotiation', customer_name: 'Cold co' },
    { id: 2, status: 'Quote Sent', customer_name: 'Due co' },
    { id: 3, status: 'Contacted', customer_name: 'Fresh co' },
    { id: 4, status: 'Qualified', customer_name: 'Never co' },
    { id: 5, status: 'Won', customer_name: 'Won co' },
  ]
  const latest = latestByLead([
    { id: 1, lead_id: 1, contacted_at: ago(30) },
    { id: 2, lead_id: 2, contacted_at: ago(1), next_follow_up_at: ago(1) },
    { id: 3, lead_id: 3, contacted_at: ago(1) },
  ])
  const q = followUpQueue(cards, latest, { isOpenStage: open, now: NOW })

  it('leaves out deals that were just worked', () => {
    expect(q.find(c => c.id === 3)).toBeUndefined()
  })

  it('leaves out deals that are no longer winnable', () => {
    // A won deal is nobody's follow-up.
    expect(q.find(c => c.id === 5)).toBeUndefined()
  })

  it('puts the coldest at the top', () => {
    expect(q[0].id).toBe(1)
    expect(q[0]._followUp.state).toBe(COLD)
  })

  it('surfaces a due callback and a never-touched deal', () => {
    expect(q.map(c => c.id)).toContain(2)
    expect(q.map(c => c.id)).toContain(4)
  })

  it('tags every card with what to display', () => {
    for (const c of q) {
      expect(c._followUp.label.length).toBeGreaterThan(0)
      expect(c._followUp.state).toBeTruthy()
    }
  })

  it('does not mutate the cards it was given', () => {
    expect(cards[0]._followUp).toBeUndefined()
  })

  it('can show everything when asked', () => {
    const all = followUpQueue(cards, latest, { isOpenStage: open, now: NOW, needsAttentionOnly: false })
    expect(all.length).toBe(4)   // the Won deal is still excluded
  })

  it('survives junk input', () => {
    expect(followUpQueue(null, null, {})).toEqual([])
    expect(followUpQueue([null], new Map(), {})).toEqual([])
  })
})

describe('logging a touch', () => {
  it('builds a row a rep can save in one tap', () => {
    const r = buildFollowUpRow({ companyId: 3, leadId: 10, employeeId: 16, method: 'call' })
    expect(r.company_id).toBe(3)
    expect(r.lead_id).toBe(10)
    expect(r.method).toBe('call')
    expect(r.contacted_at).toBeTruthy()
  })

  it('defaults to a call when no method is chosen', () => {
    expect(buildFollowUpRow({ companyId: 3, leadId: 10 }).method).toBe('call')
  })

  it('stores an empty note as null rather than blank text', () => {
    expect(buildFollowUpRow({ companyId: 3, leadId: 10, note: '   ' }).note).toBeNull()
  })

  it('works for a job as well as a lead', () => {
    expect(buildFollowUpRow({ companyId: 3, jobId: 99 }).job_id).toBe(99)
  })

  it('refuses to build an orphan or a cross-tenant row', () => {
    expect(buildFollowUpRow({ companyId: 3 })).toBeNull()
    expect(buildFollowUpRow({ leadId: 10 })).toBeNull()
  })
})
