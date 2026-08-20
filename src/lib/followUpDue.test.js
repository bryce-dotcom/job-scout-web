import { describe, it, expect } from 'vitest'
import { countDueFromRows, dueKeysFromRows } from './followUpDue'

const NOW = new Date('2026-08-04T18:00:00Z').getTime()
const ago = (d) => new Date(NOW - d * 86400000).toISOString()
const ahead = (d) => new Date(NOW + d * 86400000).toISOString()

describe('the due count is what a badge should mean', () => {
  it('counts a scheduled follow-up whose date has arrived', () => {
    expect(countDueFromRows([
      { lead_id: 1, contacted_at: ago(14), next_follow_up_at: ago(1) },
    ], NOW)).toBe(1)
  })

  it('does NOT count one still in the future', () => {
    expect(countDueFromRows([
      { lead_id: 1, contacted_at: ago(1), next_follow_up_at: ahead(5) },
    ], NOW)).toBe(0)
  })

  it('does NOT count a deal that has merely gone quiet', () => {
    // Worth flagging on the card, wrong for a badge — a number that counts
    // every stale deal is too big to act on and gets ignored.
    expect(countDueFromRows([
      { lead_id: 1, contacted_at: ago(60), next_follow_up_at: null },
    ], NOW)).toBe(0)
  })

  it('counts a deal ONCE however many times it has been chased', () => {
    expect(countDueFromRows([
      { lead_id: 1, contacted_at: ago(30), next_follow_up_at: ago(20) },
      { lead_id: 1, contacted_at: ago(20), next_follow_up_at: ago(10) },
      { lead_id: 1, contacted_at: ago(10), next_follow_up_at: ago(1) },
    ], NOW)).toBe(1)
  })

  it('LATEST touch wins — rescheduling forward clears it', () => {
    // The trap: an old row saying "due last week" must not keep a deal
    // flagged after the rep pushed it out to next month.
    expect(countDueFromRows([
      { lead_id: 1, contacted_at: ago(30), next_follow_up_at: ago(20) },
      { lead_id: 1, contacted_at: ago(1), next_follow_up_at: ahead(30) },
    ], NOW)).toBe(0)
  })

  it('counts separate deals separately', () => {
    expect(countDueFromRows([
      { lead_id: 1, contacted_at: ago(5), next_follow_up_at: ago(1) },
      { lead_id: 2, contacted_at: ago(5), next_follow_up_at: ago(1) },
    ], NOW)).toBe(2)
  })

  it('handles job-based follow-ups too, without colliding with lead ids', () => {
    expect(countDueFromRows([
      { lead_id: 1, contacted_at: ago(5), next_follow_up_at: ago(1) },
      { job_id: 1, contacted_at: ago(5), next_follow_up_at: ago(1) },
    ], NOW)).toBe(2)
  })

  it('counts a follow-up due today', () => {
    expect(countDueFromRows([
      { lead_id: 1, contacted_at: ago(14), next_follow_up_at: new Date(NOW).toISOString() },
    ], NOW)).toBe(1)
  })

  it('survives junk instead of breaking the badge', () => {
    expect(countDueFromRows(null, NOW)).toBe(0)
    expect(countDueFromRows([null, {}, { lead_id: 1, next_follow_up_at: 'nonsense' }], NOW)).toBe(0)
  })
})

// The Follow-up tab filters with dueKeysFromRows; the badge counts with
// countDueFromRows, which is now that set's size. Cole asked for the tab
// ("can i get a tab on pipe line for follow up today") — before it existed the
// board showed him the number and left him to find the red cards himself.
describe('which deals are due, not just how many', () => {
  it('agrees with the badge, always', () => {
    const rows = [
      { lead_id: 1, contacted_at: ago(9), next_follow_up_at: ago(1) },   // due
      { lead_id: 2, contacted_at: ago(9), next_follow_up_at: ago(-3) },  // future
      { job_id: 7,  contacted_at: ago(9), next_follow_up_at: ago(2) },   // due
      { lead_id: 3, contacted_at: ago(9), next_follow_up_at: null },     // none set
    ]
    expect(dueKeysFromRows(rows, NOW).size).toBe(countDueFromRows(rows, NOW))
  })

  it('names the deals, keyed the way the board keys its cards', () => {
    const keys = dueKeysFromRows([
      { lead_id: 42, contacted_at: ago(9), next_follow_up_at: ago(1) },
      { job_id: 42,  contacted_at: ago(9), next_follow_up_at: ago(1) },
      { lead_id: 43, contacted_at: ago(9), next_follow_up_at: ago(-5) },
    ], NOW)
    expect(keys.has('l42')).toBe(true)
    expect(keys.has('j42')).toBe(true)      // a job id never collides with a lead id
    expect(keys.has('l43')).toBe(false)
    expect(keys.size).toBe(2)
  })

  // The trap the count already guards: an old row keeps a deal looking due
  // forever after someone pushes the date out. The tab must not list it either.
  it('drops a deal whose latest touch pushed the date into the future', () => {
    const keys = dueKeysFromRows([
      { lead_id: 5, contacted_at: ago(30), next_follow_up_at: ago(20) },
      { lead_id: 5, contacted_at: ago(1),  next_follow_up_at: ago(-7) },
    ], NOW)
    expect(keys.has('l5')).toBe(false)
  })

  it('survives junk instead of emptying the board', () => {
    expect(dueKeysFromRows(null, NOW).size).toBe(0)
    expect(dueKeysFromRows([null, {}, { lead_id: 1, next_follow_up_at: 'nonsense' }], NOW).size).toBe(0)
  })
})
