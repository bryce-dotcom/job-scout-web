import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AGENT_STATES, agentState, computerState, describeAction } from './agentStatus'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const tab = read('../pages/agents/arnie/ArnieComputer.jsx')
const strip = read('../pages/agents/arnie/ArnieComputerStrip.jsx')

const live = { status: 'live', device_label: 'Cole’s laptop', last_seen_at: new Date().toISOString() }

describe('the badge is ambient, and exactly one state is loud', () => {
  it('only the states that need a person interrupt', () => {
    const loud = Object.entries(AGENT_STATES).filter(([, v]) => v.loud).map(([k]) => k)
    expect(loud).toEqual(['waiting', 'blocked'])
  })

  it('an unknown state falls back rather than rendering nothing', () => {
    expect(agentState('nonsense').label).toBe('Active')
    expect(agentState(undefined).label).toBe('Active')
  })
})

describe('an unanswered question is the state of the session until it is answered', () => {
  // Found by looking at the rendered page: judging by the NEWEST action alone
  // meant Arnie could stop at a sign-in page, take one more screenshot, and
  // the badge would drop back to green with nobody told.
  it('a handoff still shows even when something happened after it', () => {
    const actions = [
      { id: 9, decision: 'allowed', kind: 'screenshot', app: 'chrome' },
      { id: 8, decision: 'awaiting_human', kind: 'type', reason: 'That is a credential field.' },
    ]
    const s = computerState({ session: live, latest: actions[0], actions })
    expect(s.state).toBe('waiting')
    expect(s.actionId).toBe(8)
  })

  it('an ask-first counts as needing you too', () => {
    const actions = [{ id: 3, decision: 'needs_approval', reason: 'Check with me on the portal' }]
    expect(computerState({ session: live, actions }).state).toBe('waiting')
  })

  it('nothing outstanding reads idle', () => {
    const actions = [{ id: 1, decision: 'allowed', kind: 'click', app: 'chrome' }]
    const s = computerState({ session: live, actions })
    expect(s.state).toBe('idle')
    expect(s.detail).toMatch(/Cole/)
  })
})

describe('“Stopped” means a person stopped it, and nothing else', () => {
  it('the kill switch is blocked', () => {
    expect(computerState({ session: { ...live, status: 'stopped' } }).state).toBe('blocked')
    expect(AGENT_STATES.blocked.label).toBe('Stopped')
  })

  it('an agent that is not checking in is NOT "Stopped"', () => {
    // Telling somebody "Stopped" for a sleeping laptop sends them looking for
    // a decision they never made.
    const old = { ...live, last_seen_at: new Date(Date.now() - 10 * 60 * 1000).toISOString() }
    const s = computerState({ session: old })
    expect(s.state).toBe('stale')
    expect(AGENT_STATES.stale.label).toBe('Not answering')
    expect(s.detail).toMatch(/not checked in/i)
  })

  it('no session at all is idle, not an error', () => {
    expect(computerState({}).state).toBe('idle')
    expect(computerState({ session: { status: 'ended' } }).state).toBe('idle')
  })
})

describe('every decision the database can hold has a label', () => {
  // A missing key fell through to 'failed', so an action merely WAITING on
  // somebody read "Failed" in the log. Caught by reading the rendered page.
  it('the log can name all seven', () => {
    for (const d of ['queued', 'allowed', 'refused', 'awaiting_human', 'needs_approval', 'failed', 'expired']) {
      expect(tab).toMatch(new RegExp(`\\b${d}:\\s*\\{`))
    }
  })

  it('and waiting is never labelled as a failure', () => {
    const map = tab.slice(tab.indexOf('const DECISION = {'), tab.indexOf('const ago ='))
    expect(map).toMatch(/needs_approval: \{[^}]*label: 'Asking you'/)
    expect(map).toMatch(/awaiting_human: \{[^}]*label: 'Needs you'/)
  })
})

describe('the handoff footnote tells the truth about which handoff it is', () => {
  it('a sign-in says he never sees what you typed; a Submit does not', () => {
    expect(strip).toMatch(/credential\|sign in/)
    expect(strip).toMatch(/he never sees what you typed/)
    expect(strip).toMatch(/Read it over and click it yourself/)
  })
})

describe('one line a person can read', () => {
  it('names the verb, the thing and the place', () => {
    expect(describeAction({ kind: 'type', app: 'chrome', host: 'traksmart.test', target: { label: 'Meter #' } }))
      .toBe('Typing into “Meter #” in traksmart.test')
    expect(describeAction({ kind: 'click', app: 'excel', target: { x: 10, y: 20 } }))
      .toBe('Clicking “(10, 20)” in excel')
  })

  it('does not fall over on an empty action', () => {
    expect(describeAction(null)).toBe('')
    expect(describeAction({ kind: 'screenshot' })).toBe('Looking at')
  })
})
