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

describe('the assistant answers to the name on the screen', () => {
  const engine = read('pages/agents/arnie/arnieEngine.js')
  const chat = read('pages/agents/arnie/ArnieChat.jsx')
  const promptSrc = readFileSync(resolve(here, '../../supabase/functions/_shared/arniePrompt.ts'), 'utf8').replace(/\r\n/g, '\n')

  it('the persona travels WITH the message, not in a module cache', () => {
    // The cache was filled by exactly one route. From the corner launcher —
    // where people actually use this — Jenny introduced herself as Arnie.
    expect(chat).toMatch(/\{ spoken, personaRow: assistant\.personaRow \}/)
    expect(engine).toMatch(/personaRow: who \} = \{\}/)
    expect(engine).toMatch(/const row = who \|\| personaRow/)
  })

  it('the caller’s persona beats the cache, never the other way round', () => {
    // `personaRow || who` would reinstate the bug for any tab that had once
    // visited the Arnie page.
    expect(engine).not.toMatch(/const row = personaRow \|\| who/)
  })

  it('the first message of a session is not sent as the wrong assistant', () => {
    // personaRow arrives after the first render; without it in the deps the
    // callback closes over null.
    expect(chat).toMatch(/speakAsItArrives, assistant\.personaRow\]\)/)
  })

  it('the shared prompt never names Arnie in a rule meant for either of them', () => {
    // "Arnie is sharp and direct" told Jenny she was Arnie. Four of these
    // were in the body; the only mentions left are comments and the function
    // name itself.
    const body = promptSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '')
    const mentions = (body.match(/Arnie/g) || []).filter((_, i, a) => a)
    // buildArniePrompt + the ARNIE persona constant are code, not prompt text.
    const inProse = body.split('\n').filter((l) => /Arnie/.test(l) && /^- |^## /.test(l.trim()))
    expect(inProse, inProse.join(' | ')).toHaveLength(0)
    expect(mentions.length).toBeLessThan(8)
  })
})
