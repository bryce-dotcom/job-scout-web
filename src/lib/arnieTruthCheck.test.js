// The server's own check on what Arnie claims to have done.
//
// Two prompt rails shipped today for the same fault, and a prompt rail is a
// request. This is the part that is not: the server knows which tools ran, so
// a reply claiming otherwise is caught in code.
//
// The detector has to be narrow. A false positive costs one extra round and a
// clarifying sentence; a miss costs somebody sitting watching a screen for
// nothing. The "must NOT fire" tests below are the important half — they are
// what keeps this from nagging honest answers.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformSync } from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const load = (src) => {
  const m = { exports: {} }
  new Function('module', 'exports', 'require', transformSync(src, { loader: 'ts', format: 'cjs' }).code)(m, m.exports, () => ({}))
  return m.exports
}
const T = load(read('../../supabase/functions/_shared/arnieTruth.ts'))
const chat = read('../../supabase/functions/arnie-chat/index.ts')

describe('claiming work on their computer', () => {
  it('catches what Jenny actually said', () => {
    // Verbatim from the conversation with Alayda.
    expect(T.claimsComputerWork("Boss, I'm sending clicks to Chrome, but you're not seeing anything move on screen")).toBe(true)
    expect(T.claimsComputerWork('Looking at Chrome now...I see you are on the JobScout home page.')).toBe(true)
    expect(T.claimsComputerWork('I am doing it now — can you see me doing it?')).toBe(true)
  })

  it('catches the other ways of saying it', () => {
    for (const s of [
      "I'm clicking the Edit button on your screen now",
      "I've taken a screenshot of Chrome",
      'I just typed the address into the field',
      'Watch your screen.',
      "I'm in your browser now",
    ]) expect(T.claimsComputerWork(s), s).toBe(true)
  })

  it('does NOT fire on offering, explaining or refusing', () => {
    // This is the half that matters. Arnie talks about his computer powers
    // constantly — the permissions list, the "what I will never do" copy, the
    // honest refusals. None of it is a claim.
    for (const s of [
      'I can take a screenshot of Chrome if you want me to.',
      'Want me to screenshot Chrome and guide you through it?',
      'I cannot click Submit — that one comes back to you.',
      'You have not got the agent running, so I cannot reach Chrome.',
      'To do that I would need permission for Chrome first.',
      'I never type a password, and I never click anything that cannot be taken back.',
      'Open Chrome and click the three dots in the top right.',
      'The clicks you make are yours; I only ever look.',
    ]) expect(T.claimsComputerWork(s), s).toBe(false)
  })

  it('does not mistake ordinary work for computer work', () => {
    for (const s of [
      "I've drafted the estimate and sent it to the card.",
      'I just pulled the numbers for last month.',
      "I'm opening the Halifax job now.",
    ]) expect(T.claimsComputerWork(s), s).toBe(false)
  })
})

describe('claiming a card', () => {
  it('catches what he told Alayda', () => {
    expect(T.claimsACard('Look for the approval card — refresh the page, check for a modal, notification, or card anywhere on screen.')).toBe(true)
    expect(T.claimsACard("I've drafted that routine, you should see an approval card.")).toBe(true)
  })

  it('does NOT fire on a plain answer or an offer', () => {
    for (const s of [
      'Want me to draft that as a change you can approve?',
      'Anything I would change comes back as a card for you to approve.',
      'I cannot create a product — the import tool on that page is the way in.',
    ]) expect(T.claimsACard(s), s).toBe(false)
  })
})

describe('the rule that ties it to the tools', () => {
  it('a claim WITH the matching tool call is fine', () => {
    // The honest path must never be interrupted.
    expect(T.fabricationIn("I'm clicking the Edit button", ['use_my_computer'])).toBeNull()
    expect(T.fabricationIn("I've drafted it — you should see an approval card", ['propose_create'], false)).toBeNull()
  })

  it('a claim without it is caught', () => {
    expect(T.fabricationIn("I'm sending clicks to Chrome", [])).toBe('computer')
    expect(T.fabricationIn("I've drafted it, look for the approval card", [], false)).toBe('card')
  })

  it('a card claim is left alone when one really is pending', () => {
    // Referring to a card drafted in an earlier turn is true and common.
    expect(T.fabricationIn("You should see the approval card I've drafted", [], true)).toBeNull()
  })

  it('an unknown card state is left alone, never guessed at', () => {
    // cardPendingFor returns null when it cannot tell; the benefit of the
    // doubt goes to not interrupting.
    expect(T.fabricationIn("I've drafted it, look for the approval card", [], null)).toBeNull()
  })

  it('a different tool does not excuse the claim', () => {
    expect(T.fabricationIn("I'm clicking in Chrome", ['query_jobs'])).toBe('computer')
  })
})

describe('what happens when it fires', () => {
  it('his words are never edited or dropped', () => {
    // Rewriting model output turns one wrong sentence into a mangled
    // paragraph. The reply stands; one more round follows it.
    expect(chat).not.toMatch(/text\.replace\(.*fabricat/i)
    expect(chat).toMatch(/convo\.push\(\{ role: 'user', content: correctionFor\(claim\) \}\)/)
  })

  it('it offers doing the job before confessing to not having done it', () => {
    expect(T.correctionFor('computer')).toMatch(/CALL use_my_computer and actually do it/)
    expect(T.correctionFor('card')).toMatch(/CALL the right propose_ tool and draft it/)
  })

  it('it forbids exactly the excuses that were invented', () => {
    expect(T.correctionFor('computer')).toMatch(/blame the website, a lag, the clicks landing wrong/)
    expect(T.correctionFor('card')).toMatch(/do not suggest a bug report/)
  })

  it('it fires at most once a turn, so it cannot loop', () => {
    expect(chat).toMatch(/let corrected = false/)
    expect((chat.match(/corrected = true/g) || []).length).toBe(2)   // both loops
  })

  it('both turn loops are covered, streaming included', () => {
    // The app streams; a check only on the non-streaming path would protect
    // nobody who actually uses this.
    expect((chat.match(/fabricationIn\(text, used, null\)/g) || []).length).toBe(2)
    expect((chat.match(/used\.add\(tu\.name\)/g) || []).length).toBe(2)
  })

  it('every tool call in the turn counts, not just the last round', () => {
    expect((chat.match(/const used = new Set<string>\(\)/g) || []).length).toBe(2)
  })

  it('it says so in the logs, so we can see whether it is working', () => {
    expect(chat).toMatch(/\[arnie-truth\] caught a \$\{kind\} claim with no tool call/)
  })
})

describe('whether they already read it changes what is owed', () => {
  it('a streamed claim has to be taken back in words', () => {
    // Streaming puts every word on screen as it is written, so by the time
    // the check runs the claim has been read and cannot be unsaid.
    expect(T.correctionFor('computer', true)).toMatch(/ALREADY READ/)
    expect(T.correctionFor('computer', true)).toMatch(/take it back in your first sentence/)
  })

  it('an unstreamed one is simply replaced, with no apology for a message nobody saw', () => {
    expect(T.correctionFor('card', false)).toMatch(/have not seen that message yet/)
    expect(T.correctionFor('card', false)).toMatch(/Do not apologise for it or refer to it/)
  })

  it('the streaming loop says the words were seen, and the other does not', () => {
    expect(chat).toMatch(/correctionFor\(claim, true\) \}\)/)   // streamed
    expect(chat).toMatch(/correctionFor\(claim\) \}\)/)          // replaced wholesale
  })
})
