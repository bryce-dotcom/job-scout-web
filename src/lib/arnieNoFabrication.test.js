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

describe('the computer is the easiest rail to break', () => {
  const chat = readFileSync(resolve(here, '../../supabase/functions/arnie-chat/index.ts'), 'utf8')
  const block = chat.slice(chat.indexOf('async function computerBlock'), chat.indexOf('function toolContent'))

  it('the warning reaches the people who actually HAVE a computer', () => {
    // It used to sit only in the "no computer connected" branch. So the one
    // person with a working agent — connected, Chrome allowed at full tier —
    // was the one person never told that talking is not doing. She was asked
    // to watch her screen while nothing was sent, then given three invented
    // reasons why nothing moved.
    const liveHalf = block.slice(block.indexOf('Connected: '))
    expect(liveHalf).toMatch(/NOTHING happens on that computer unless use_my_computer returns a result/)
    expect(liveHalf).toMatch(/never ask them whether they can see you working/)
  })

  it('invented causes are named so they cannot come back', () => {
    expect(block).toMatch(/not the website blocking automation, not lag, not clicks landing in the wrong place/)
  })

  it('every turn carries what was really done on that machine', () => {
    // A fact he cannot talk around — and, when the answer is "nothing", the
    // exact sentence he needs for "are you doing it?".
    expect(block).toMatch(/arnie_computer_actions\?select=kind,app,decision,created_at/)
    expect(block).toMatch(/You have done NOTHING on that computer in the last 12 hours/)
    expect(block).toMatch(/If you have just told them otherwise, correct it/)
  })

  it('the general rail names the computer too, not only cards', () => {
    expect(section).toMatch(/Their computer is the same rule/)
    expect(section).toMatch(/can you see me doing it/)
  })

  it('and names invented failures, not just invented limits', () => {
    expect(section).toMatch(/do not invent FAILURES/)
    for (const excuse of ['blocking automation', "there's a lag", 'landing in the wrong spot']) {
      expect(section, excuse).toContain(excuse)
    }
    expect(section).toMatch(/If you did not call it, say that/)
  })
})
