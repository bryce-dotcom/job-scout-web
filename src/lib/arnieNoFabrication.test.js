// "You should see an approval card" — when there was no card.
//
// Alayda asked for a routine that would email her at 8:45. Arnie talked as
// though he had drafted it, told her to look for the approval card, and when
// she could not find one told her the feature was broken, to add it to the
// bug report, and to try a manual workaround.
//
// He had never called the tool. Checked in the database: she has no proposal
// rows at all, ever — while a routine proposal raised the same day by someone
// else sits there pending, because the feature works. He invented the draft,
// then blamed the app for its absence, and manufactured a bug report against
// something that was not broken.
//
// In the same conversation he also invented a limit — that Chrome "blocks"
// the agent from reaching browser settings — which is not true of a tool that
// can see the screen and click it.
//
// These two together are worse than a wrong number. A wrong number gets
// argued with; a confident "I've drafted it, the app must be broken" gets
// believed, and costs the team a bug hunt.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const prompt = readFileSync(resolve(here, '../../supabase/functions/_shared/arniePrompt.ts'), 'utf8').replace(/\r\n/g, '\n')
const section = prompt.slice(prompt.indexOf('## CRITICAL: Never claim you did something you did not do'))
  .split('\n## ')[0]

describe('the no-fabrication rail', () => {
  it('exists at all', () => {
    expect(prompt).toContain('## CRITICAL: Never claim you did something you did not do')
  })

  it('ties a card to an actual tool call in the same turn', () => {
    expect(section).toMatch(/A card exists only if a tool call returned one in THIS turn/)
    expect(section).toMatch(/propose_create/)
  })

  it('names the exact words he used, so they cannot come back', () => {
    for (const phrase of ['you should see an approval card', 'look for the card', "I've drafted it"]) {
      expect(section.toLowerCase(), phrase).toContain(phrase.toLowerCase())
    }
  })

  it('forbids calling it a bug, filing a bug report, or offering a workaround', () => {
    expect(section).toMatch(/never tell someone a feature is broken/i)
    expect(section).toMatch(/file a bug report/i)
    expect(section).toMatch(/manual workaround/i)
  })

  it('tells him what to do instead, not only what not to do', () => {
    // A rule that only forbids leaves him stuck mid-conversation.
    expect(section).toMatch(/I did not actually draft that — let me do it now/)
    expect(section).toMatch(/CALL THE TOOL in that turn/)
  })

  it('covers invented limits as well as invented actions', () => {
    expect(section).toMatch(/Do not invent limits/i)
    expect(section).toMatch(/the browser blocks that/i)
  })

  it('covers anything that leaves the building', () => {
    // Writing an email out is not sending one.
    expect(section).toMatch(/It is sent when a tool says it was sent/)
  })

  it('sits with the other CRITICAL rules, not buried at the bottom', () => {
    const dataRules = prompt.indexOf('## CRITICAL: Data Accuracy Rules')
    const thisRule = prompt.indexOf('## CRITICAL: Never claim you did something')
    const tools = prompt.indexOf('## Tools You Can Call')
    expect(dataRules).toBeGreaterThan(-1)
    expect(thisRule).toBeGreaterThan(dataRules)
    expect(thisRule).toBeLessThan(tools)
  })
})
