// The words on the button that opens the assistant.
//
// It said "Ask Arnie" to everyone, including the people who had chosen Jenny.
// Bryce, 2026-10-13: "the little icon still says ask Arnie even whne i change
// it to Jenny... Also i hate ask Arnie as the phrase... it should be more
// profound than that."
//
// Two faults in one line of copy. The name was hardcoded, so the corner chip
// was the one surface a rename never reached — and it is the most visible
// surface in the app. And "ask" is help-desk framing: you ask a search box a
// question and it hands you an answer back. This assistant does the work.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { handOffLabel, assistantShortName } from './arniePersonaClient'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, '..', p), 'utf8').replace(/\r\n/g, '\n')
// A comment naming the old phrase must not be what satisfies a test.
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

describe('the hand-off label', () => {
  it('names whoever this person chose', () => {
    expect(handOffLabel('Arnie')).toBe('Put Arnie on it')
    expect(handOffLabel('Jenny')).toBe('Put Jenny on it')
  })

  it('is delegation, not a question', () => {
    // The whole point of the rewording. If this ever says "ask" again, the
    // button is back to describing a search box.
    expect(handOffLabel('Arnie')).not.toMatch(/ask/i)
  })

  it('survives a persona that has not loaded yet', () => {
    // The corner chip renders before loadPersona() comes back. A blank label,
    // or the literal "undefined", on the most looked-at control in the app.
    expect(handOffLabel(undefined)).toBe('Put Arnie on it')
    expect(handOffLabel('')).toBe('Put Arnie on it')
  })

  it('uses the SHORT name, because the chip is about 120px wide', () => {
    expect(assistantShortName({ personaRow: { persona: 'jenny' } })).toBe('Jenny')
    expect(assistantShortName({ personaRow: null })).toBe('Arnie')
  })

  it('a rename wins over the persona, as everywhere else', () => {
    expect(assistantShortName({ personaRow: { persona: 'jenny', display_name: 'Sam' } })).toBe('Sam')
    expect(handOffLabel(assistantShortName({ personaRow: { persona: 'jenny', display_name: 'Sam' } })))
      .toBe('Put Sam on it')
  })

  it('a display_name the rules reject falls back rather than rendering junk', () => {
    const long = 'Please set up my whole company for me'
    expect(assistantShortName({ personaRow: { persona: 'jenny', display_name: long } })).toBe('Jenny')
  })
})

describe('every surface that used to hardcode it', () => {
  const surfaces = {
    'components/ArnieFloatingPanel.jsx': 'the corner chip',
    'components/ArnieOnboardingBanner.jsx': 'the first-run banner',
    'pages/agents/arnie/ArnieSetup.jsx': 'the settings page',
  }

  for (const [file, what] of Object.entries(surfaces)) {
    it(`${what} builds its words from the persona`, () => {
      const src = code(file)
      expect(src).toMatch(/assistantShortName\(\{ personaRow: assistant\.personaRow \}\)/)
      // No bare "Arnie" left in anything the user reads.
      expect(src).not.toMatch(/Ask Arnie/)
      expect(src).not.toMatch(/Chat with Arnie/)
    })
  }

  it('nothing in the app still says "Ask Arnie" to a Jenny user', () => {
    const files = [
      'components/ArnieFloatingPanel.jsx', 'components/ArnieOnboardingBanner.jsx',
      'pages/agents/arnie/ArnieSetup.jsx', 'components/walkthroughs/ArnieWalkthrough.jsx',
      'pages/admin/Help.jsx', 'lib/featureKnowledge/arnie.js',
    ]
    for (const f of files) expect(code(f), f).not.toMatch(/Ask Arnie/)
  })

  it('the setup page no longer calls the assistant "he"', () => {
    // It read "Open him from anywhere... he'll bring the change here" to
    // someone whose assistant is Jenny.
    const src = code('pages/agents/arnie/ArnieSetup.jsx')
    expect(src).not.toMatch(/\bhe drafts\b/i)
    expect(src).not.toMatch(/Open him\b/)
  })
})
