import { describe, it, expect } from 'vitest'
import { quotedMatch, resolutionMessage, resolutionNote, isAutomatedReporter, touchesProductCode } from './feedbackMatch'

// The nightly sweep closes tickets and emails people using this. Every rule
// here exists because a wrong close is worse than a late one: the bug stops
// being tracked and the reporter is told it is done.

const commit = (over) => ({ hash: 'abcdef1234', iso: '2026-08-18T10:08:00Z', subject: 'Fix the thing', body: '', ...over })

describe('what counts as proof', () => {
  const ticket = {
    created_at: '2026-08-10T15:21:00Z',
    subject: 'categorizing transactions in books',
    message: 'I am struggling to categorize each transaction and it will not let me move on',
  }

  it('matches when the commit quotes the ticket back', () => {
    const m = quotedMatch(ticket, [commit({ body: 'Tracy: "I am struggling to categorize each transaction" — fixed.' })])
    expect(m).not.toBe(null)
    expect(m.run).toContain('struggling to categorize each transaction')
  })

  it('refuses a run of pure grammar', () => {
    const t = { created_at: '2026-01-01T00:00:00Z', message: 'i need to be able to do this' }
    expect(quotedMatch(t, [commit({ body: 'we now let you i need to be able to see it' })])).toBe(null)
  })

  it('refuses a commit that predates the report — by the INSTANT, not the day', () => {
    // The real failure: a 10:08 commit credited with fixing a 23:00 crash.
    const crash = { created_at: '2026-08-18T23:00:00Z', message: 'window google maps Map is not a constructor on company map' }
    expect(quotedMatch(crash, [commit({ iso: '2026-08-18T10:08:00Z', body: 'window google maps Map is not a constructor on company map' })])).toBe(null)
  })

  it('accepts a commit later the same day', () => {
    const crash = { created_at: '2026-08-18T09:00:00Z', message: 'window google maps Map is not a constructor on company map' }
    expect(quotedMatch(crash, [commit({ iso: '2026-08-18T10:08:00Z', body: 'window google maps Map is not a constructor on company map' })])).not.toBe(null)
  })

  it('returns null rather than throwing on junk', () => {
    expect(quotedMatch(null, [])).toBe(null)
    expect(quotedMatch({ message: 'hi' }, [commit()])).toBe(null)
    expect(quotedMatch({ created_at: 'x', message: 'a b c d e f g' }, [])).toBe(null)
  })
})

describe('the message a person receives', () => {
  const ticket = { created_at: '2026-08-10T00:00:00Z', message: 'the calendar shows sun and mon combined and it changes my times' }
  const c = commit({ subject: 'Appointments: stop moving the time, and stop squashing the days' })

  it('quotes their own words back', () => {
    expect(resolutionMessage({ ticket, commit: c })).toContain('calendar shows sun and mon combined')
  })

  it('names what shipped and when', () => {
    const m = resolutionMessage({ ticket, commit: c })
    expect(m).toContain('stop squashing the days')
    expect(m).toContain('2026-08-18')
  })

  it('invites a correction rather than declaring victory', () => {
    expect(resolutionMessage({ ticket, commit: c })).toMatch(/still looks wrong/i)
  })

  it('truncates a very long report instead of quoting an essay back', () => {
    const long = { ...ticket, message: 'x'.repeat(500) }
    expect(resolutionMessage({ ticket: long, commit: c })).toContain('…')
  })
})

describe('who never gets written to', () => {
  it('skips the automated crash reporter', () => {
    expect(isAutomatedReporter('system@jobscout')).toBe(true)
    expect(isAutomatedReporter('')).toBe(true)
    expect(isAutomatedReporter(null)).toBe(true)
  })

  it('writes to real people', () => {
    expect(isAutomatedReporter('tracy@hhh.services')).toBe(false)
  })
})

describe('the note stored on the ticket', () => {
  it('records which commit did it, so a wrong close can be traced', () => {
    expect(resolutionNote(commit())).toBe('Resolved by commit abcdef12 (2026-08-18): Fix the thing')
  })
})

describe('quoting a ticket is not fixing it', () => {
  // The sweep's first live run closed a crash that was still happening: a
  // commit about the MATCHER quoted the crash text as an example of what not
  // to close, and that read as proof.
  it('a commit that only edits scripts has not fixed a user-facing bug', () => {
    expect(touchesProductCode([{ filename: 'scripts/match-feedback-to-commits.mjs' }])).toBe(false)
  })

  it('app code, edge functions, migrations and crons all count', () => {
    expect(touchesProductCode([{ filename: 'src/pages/Books.jsx' }])).toBe(true)
    expect(touchesProductCode([{ filename: 'supabase/functions/health-check/index.ts' }])).toBe(true)
    expect(touchesProductCode([{ filename: 'supabase/migrations/2026_x.sql' }])).toBe(true)
    expect(touchesProductCode([{ filename: 'api/cron/plaid-sync.js' }])).toBe(true)
  })

  it('counts a commit that touches both', () => {
    expect(touchesProductCode([{ filename: 'scripts/x.mjs' }, { filename: 'src/lib/y.js' }])).toBe(true)
  })

  it('refuses to close when the file list is unknown, rather than guessing', () => {
    expect(touchesProductCode([])).toBe(false)
    expect(touchesProductCode()).toBe(false)
  })
})
