import { describe, it, expect } from 'vitest'
import {
  BROADCAST_TYPE, rosterTitles, broadcastRecipients, broadcastProblem, broadcastRows, broadcastKey,
} from './crewBroadcast'

// Bryce (d6a848b5): "Tried to send all 14 field crew a note about clocking in/out
// and leaving location on. There is no way to do it from the app."

const ROSTER = [
  { id: 1, name: 'Alex', role: 'Field Tech', active: true },
  { id: 2, name: 'Cam', role: 'Field Tech', active: true },
  { id: 3, name: 'Derrick', role: 'Installer', active: true },
  { id: 4, name: 'Tracy', role: 'Office', active: true },
  { id: 5, name: 'Gone', role: 'Field Tech', active: false },
  { id: 6, name: 'Untitled', role: null, active: true },
]

describe('who gets it', () => {
  it('everyone active when no title is chosen', () => {
    const r = broadcastRecipients(ROSTER)
    expect(r.map((e) => e.name)).toEqual(['Alex', 'Cam', 'Derrick', 'Tracy', 'Untitled'])
  })

  it('never anyone inactive', () => {
    expect(broadcastRecipients(ROSTER).some((e) => e.name === 'Gone')).toBe(false)
    expect(broadcastRecipients(ROSTER, { titles: ['Field Tech'] }).some((e) => e.name === 'Gone')).toBe(false)
  })

  it('narrows to the chosen job titles', () => {
    expect(broadcastRecipients(ROSTER, { titles: ['Field Tech', 'Installer'] }).map((e) => e.name))
      .toEqual(['Alex', 'Cam', 'Derrick'])
  })

  it('ignores casing, because the roster does not keep it tidy', () => {
    expect(broadcastRecipients(ROSTER, { titles: ['field tech'] }).map((e) => e.name)).toEqual(['Alex', 'Cam'])
  })

  it('includes someone with no job title in "everyone"', () => {
    // Leaving them out of a message about clocking in is the silent omission
    // that makes people stop trusting the tool.
    expect(broadcastRecipients(ROSTER).some((e) => e.name === 'Untitled')).toBe(true)
  })

  it('offers the titles the roster actually has, deduped and sorted', () => {
    expect(rosterTitles(ROSTER)).toEqual(['Field Tech', 'Installer', 'Office'])
  })

  it('survives junk', () => {
    expect(broadcastRecipients(null)).toEqual([])
    expect(broadcastRecipients([null, { active: true }])).toEqual([])   // no id
    expect(rosterTitles(null)).toEqual([])
  })
})

describe('what stops a send', () => {
  const ok = { title: 'Clock in and out', message: 'Leave location on, please.', recipients: [{ id: 1 }] }

  it('allows a complete message', () => {
    expect(broadcastProblem(ok)).toBe(null)
  })

  it('wants a subject and a body', () => {
    expect(broadcastProblem({ ...ok, title: '  ' })).toMatch(/subject/i)
    expect(broadcastProblem({ ...ok, message: '' })).toMatch(/message/i)
  })

  it('refuses a send to nobody rather than reporting success', () => {
    expect(broadcastProblem({ ...ok, recipients: [] })).toMatch(/nobody/i)
  })

  it('holds the line on length', () => {
    expect(broadcastProblem({ ...ok, title: 'x'.repeat(81) })).toMatch(/80/)
    expect(broadcastProblem({ ...ok, message: 'x'.repeat(1001) })).toMatch(/1000/)
  })
})

describe('the rows it writes', () => {
  const recipients = broadcastRecipients(ROSTER, { titles: ['Field Tech'] })
  const key = broadcastKey(new Date('2026-10-04T12:00:00Z'))
  const rows = broadcastRows({ companyId: 3, recipients, title: ' Clock in ', message: ' Leave location on. ', key, senderName: 'Bryce' })

  it('one row per recipient, each addressed to a person', () => {
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.employee_id)).toEqual([1, 2])
    expect(rows.every((r) => r.company_id === 3 && r.type === BROADCAST_TYPE)).toBe(true)
  })

  it('trims what the sender typed', () => {
    expect(rows[0].title).toBe('Clock in')
    expect(rows[0].message).toBe('Leave location on.')
  })

  it('shares ONE dedupe key, so a double tap cannot double-send', () => {
    // (employee_id, dedupe_key) is UNIQUE, so the second insert is refused by
    // the database rather than giving the crew two of everything.
    expect(new Set(rows.map((r) => r.dedupe_key)).size).toBe(1)
    expect(rows[0].dedupe_key).toContain(BROADCAST_TYPE)
  })

  it('a different send gets a different key', () => {
    expect(broadcastKey(new Date('2026-10-04T12:00:00Z')))
      .not.toBe(broadcastKey(new Date('2026-10-04T12:00:01Z')))
  })

  it('records who sent it and how many it went to', () => {
    expect(rows[0].metadata).toEqual({ from: 'Bryce', recipients: 2 })
  })
})
