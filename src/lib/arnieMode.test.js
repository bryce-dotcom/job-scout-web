import { describe, it, expect, vi, beforeEach } from 'vitest'

// arnieTools reaches into the Zustand store for time logs; the mode decision
// itself is what is under test, so the clocked-in signal is stubbed.
const isClockedIn = vi.fn()
vi.mock('../pages/agents/arnie/arnieTools', () => ({
  isClockedIn: (...a) => isClockedIn(...a),
  getUserRole: () => ({ role: 'user', userId: 1 }),
  assembleDataContext: () => '',
  getDataLoadStatus: () => ({}),
}))

const { detectMode } = await import('../pages/agents/arnie/arnieEngine')

beforeEach(() => isClockedIn.mockReset())

describe('who Arnie thinks he is talking to', () => {
  it('puts a clocked-in owner in field mode', () => {
    // The point of the whole split: an owner up a ladder is in the field,
    // whatever their access level says. Answering them with a markdown table
    // is the failure this prevents.
    isClockedIn.mockReturnValue(true)
    expect(detectMode('super_admin', 7)).toBe('field')
    expect(detectMode('developer', 7)).toBe('field')
  })

  it('puts a tech in field mode even before they clock in', () => {
    isClockedIn.mockReturnValue(false)
    expect(detectMode('user', 7)).toBe('field')
    expect(detectMode('team_lead', 7)).toBe('field')
  })

  it('leaves desk roles at the desk when nobody is clocked in', () => {
    isClockedIn.mockReturnValue(false)
    expect(detectMode('manager', 7)).toBe('office')
    expect(detectMode('admin', 7)).toBe('office')
    expect(detectMode('super_admin', 7)).toBe('office')
  })

  it('defaults to office for an unknown role', () => {
    isClockedIn.mockReturnValue(false)
    expect(detectMode(undefined, undefined)).toBe('office')
  })
})
