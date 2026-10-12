import { describe, it, expect, beforeEach } from 'vitest'
import { shouldIntroduce, markIntroDone, INTRO_KICKOFF } from './arnieIntro'

import { _forgetIntros } from './arnieIntro'

beforeEach(() => { _forgetIntros() })

// Everything Arnie can do sat behind four tab labels nobody had been told the
// meaning of, which is the same as it not being there. He introduces himself
// now — and the risk of a thing that opens itself is that it opens twice.

describe('he introduces himself exactly once', () => {
  const base = { userId: 7, sessionCount: 0, path: '/', alreadyOpen: false }

  it('to somebody who has never talked to him', () => {
    expect(shouldIntroduce(base)).toBe(true)
  })

  it('and never again on that device', () => {
    markIntroDone(7)
    expect(shouldIntroduce(base)).toBe(false)
  })

  it('and never to somebody who HAS talked to him, whatever the device thinks', () => {
    // The real state is the conversation count; the flag only stops it
    // re-asking somebody who closed it without answering.
    expect(shouldIntroduce({ ...base, sessionCount: 1 })).toBe(false)
  })

  it('not over the top of the onboarding that already introduces him', () => {
    for (const p of ['/onboarding', '/login', '/signup', '/connect?code=x', '/portal/abc']) {
      expect(shouldIntroduce({ ...base, path: p }), p).toBe(false)
    }
  })

  it('not while somebody is already using him', () => {
    expect(shouldIntroduce({ ...base, alreadyOpen: true })).toBe(false)
  })

  it('and not at all when nobody is signed in', () => {
    expect(shouldIntroduce({ ...base, userId: null })).toBe(false)
  })
})

describe('what he is asked to open with', () => {
  it('asks him to look and act, not to recite a welcome', () => {
    // A written welcome cannot say what THIS company is missing. He can.
    expect(INTRO_KICKOFF).toMatch(/what should we set up first/i)
    expect(INTRO_KICKOFF).toMatch(/missing/i)
    expect(INTRO_KICKOFF).toMatch(/do the work for me/i)
    expect(INTRO_KICKOFF.length).toBeLessThan(400)
  })
})
