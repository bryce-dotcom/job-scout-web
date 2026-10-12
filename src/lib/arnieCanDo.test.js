import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { whatArnieCanDo, stateLabel, NEVER, READY, NEEDS_AGENT, NEEDS_TEACHING, BLOCKED } from './arnieCanDo'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')

// This list is what a person reads to decide whether to install anything, so
// the failure that matters is not a crash — it is the list claiming something
// is ready when it is not. That has happened on this project before: a
// storefront card advertising fleet features nobody had built.

describe('nothing reads ready when it is not', () => {
  it('with no computer connected, nothing is ready', () => {
    const rows = whatArnieCanDo({ connected: false })
    expect(rows.length).toBeGreaterThan(3)
    expect(rows.every((r) => r.state !== READY)).toBe(true)
    expect(rows.every((r) => r.state === NEEDS_AGENT)).toBe(true)
  })

  it('connected is not the same as taught', () => {
    const rows = whatArnieCanDo({ connected: true, platform: 'win32', skills: [] })
    const repeat = rows.find((r) => r.id === 'repeat')
    expect(repeat.state).toBe(NEEDS_TEACHING)
    expect(repeat.blurb).toMatch(/Nothing yet/)
    // The parts he can do are ready though — looking, clicking, opening.
    expect(rows.find((r) => r.id === 'look').state).toBe(READY)
  })

  it('a published skill makes the job real, and names it', () => {
    const rows = whatArnieCanDo({
      connected: true, platform: 'win32',
      skills: [{ name: 'File an SRP rebate', status: 'published', steps: { written: '1. open it' } }],
    })
    const repeat = rows.find((r) => r.id === 'repeat')
    expect(repeat.state).toBe(READY)
    expect(repeat.title).toMatch(/1 so far/)
    expect(repeat.blurb).toMatch(/File an SRP rebate/)
  })

  it('a Mac is told the truth about recording — when the Mac says so', () => {
    // It used to be assumed from the platform. A Mac with the switches ON got
    // the warning anyway, and one with them off got told it was Ready.
    const rows = whatArnieCanDo({ connected: true, platform: 'darwin', canRecord: false })
    expect(rows.find((r) => r.id === 'teach').blurb).toMatch(/System Settings/)
  })

  it('every state has words, and says whose move it is', () => {
    for (const r of whatArnieCanDo({ connected: true, platform: 'win32' })) {
      const s = stateLabel(r.state)
      expect(s.label.length).toBeGreaterThan(0)
      expect(typeof s.yours).toBe('boolean')
    }
    expect(stateLabel(NEEDS_AGENT).yours).toBe(true)
    expect(stateLabel(READY).yours).toBe(false)
  })
})

describe('what he will never do is on the page, not in a footnote', () => {
  it('names the four promises the whole design rests on', () => {
    const all = NEVER.join(' ').toLowerCase()
    expect(all).toMatch(/password/)
    expect(all).toMatch(/submit|cannot be taken back/)
    expect(all).toMatch(/not allowed|have not allowed/)
    expect(all).toMatch(/anybody else/)
  })

  it('the page draws them rather than describing them in prose', () => {
    const page = read('../pages/agents/arnie/ArnieComputer.jsx')
    expect(page).toMatch(/NEVER\.map/)
    expect(page).toMatch(/whatArnieCanDo\(/)
  })
})

describe('the list is a list of things that work', () => {
  it('no entry promises something for later', () => {
    const src = read('./arnieCanDo.js')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
      .join('\n')
    expect(src).not.toMatch(/coming soon|will be able|planned|soon\b/i)
  })

  it('and read_text is not advertised, because the agent cannot do it yet', () => {
    // The agent returns "this agent cannot read the screen yet" for read_text.
    // 'look' is a screenshot, which it really can do — the wording has to stay
    // honest about which of the two it means.
    const agent = read('../../scripts/jobscout-agent.mjs')
    expect(agent).toMatch(/case 'read_text': return \{ error: 'this agent cannot read the screen yet' \}/)
    const look = whatArnieCanDo({ connected: true }).find((r) => r.id === 'look')
    expect(look.blurb).toMatch(/picture/)
    expect(look.blurb).not.toMatch(/reads? (the )?(text|screen)/i)
  })
})

describe('what the machine says beats what the platform suggests', () => {
  it('a Mac that cannot watch the screen is not told teaching is Ready', () => {
    // The wrong answer that costs somebody ten minutes of demonstrating to an
    // empty recording. Guessing from the platform used to produce it.
    const rows = whatArnieCanDo({ connected: true, platform: 'darwin', canRecord: false })
    const teach = rows.find((r) => r.id === 'teach')
    expect(teach.state).toBe(BLOCKED)
    expect(teach.blurb).toMatch(/would record nothing/)
    expect(teach.blurb).toMatch(/System Settings/)
    // And a job you have not been able to show him is not merely untaught.
    expect(rows.find((r) => r.id === 'repeat').state).toBe(BLOCKED)
  })

  it('a Mac that CAN watch the screen is treated like any other computer', () => {
    const teach = whatArnieCanDo({ connected: true, platform: 'darwin', canRecord: true })
      .find((r) => r.id === 'teach')
    expect(teach.state).toBe(READY)
    expect(teach.blurb).toMatch(/Do the job once/)
  })

  it('an agent too old to say is given the benefit of the doubt, not a false alarm', () => {
    // null means "it did not tell us", which is not the same as "it cannot".
    const teach = whatArnieCanDo({ connected: true, platform: 'darwin', canRecord: null })
      .find((r) => r.id === 'teach')
    expect(teach.state).toBe(READY)
  })

  it('and the page passes what the agent reported, not the platform', () => {
    const page = read('../pages/agents/arnie/ArnieComputer.jsx')
    expect(page).toMatch(/canRecord=\{data\.session\?\.capabilities \? data\.session\.capabilities\.record : null\}/)
    // The machine's own words are said on the machine panel, which is where
    // everything about that computer now lives.
    const panel = read('../pages/agents/arnie/MachinePanel.jsx')
    expect(panel).toMatch(/capabilities\?\.record === false/)
    expect(panel).toMatch(/capabilities\?\.notes \|\| \[\]/)
  })
})
