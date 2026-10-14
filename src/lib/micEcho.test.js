// The microphone hearing the assistant and sending it back as you.
//
// From Bryce's own transcript, 2026-10-14: he said "check my email", she
// answered, and his next three "messages" were her previous answers word for
// word, read back by his speakers. She then replied to herself twice before
// working out what was happening. Every round of that is real money.

import { describe, it, expect } from 'vitest'
import { looksLikeEcho } from './micEcho'

const HER = "I can see Gmail in the left sidebar — shows you've got 9,426 messages in the inbox. But the screen I'm looking at is JobScout, not Gmail itself. Let me click over to the Gmail tab to actually see your mail."

describe('hearing her own answer back', () => {
  it('catches the real thing, as speech-to-text wrote it down', () => {
    // Verbatim from the transcript — note the mangling: "9,426" heard as
    // "$9,126", "watch access" as "launch access". An echo is rarely a clean
    // copy, which is why a long run counts as well as containment.
    const heard = 'I can see Gmail in the left sidebar so if you have got $9,126 messages in the inbox but the screen I am looking at is job Scout not Gmail itself let me click over to the Gmail tab to actually see your mail'
    expect(looksLikeEcho(heard, HER)).toBe(true)
  })

  it('catches it said back whole', () => {
    expect(looksLikeEcho(HER, HER)).toBe(true)
  })

  it('catches the tail, when the start was missed', () => {
    expect(looksLikeEcho('let me click over to the Gmail tab to actually see your mail', HER)).toBe(true)
  })
})

describe('what it must never swallow', () => {
  it('a real question that happens to share words', () => {
    expect(looksLikeEcho('can you check my email again', HER)).toBe(false)
    expect(looksLikeEcho('how many messages are in the inbox', HER)).toBe(false)
  })

  it('the short things people actually steer with', () => {
    // These may appear verbatim in what she just said, and none of them may
    // ever be dropped — refusing to send what somebody really said is worse
    // than the echo it prevents.
    for (const s of ['yes', 'stop', 'go ahead', 'the second one', 'Gmail', 'see your mail']) {
      expect(looksLikeEcho(s, HER), s).toBe(false)
    }
  })

  it('nothing spoken yet means nothing to echo', () => {
    expect(looksLikeEcho('check my email', '')).toBe(false)
    expect(looksLikeEcho('', HER)).toBe(false)
  })

  it('a long question of their own is not an echo', () => {
    expect(looksLikeEcho(
      'right can you go into the invoices page and tell me which ones are overdue by more than thirty days',
      HER,
    )).toBe(false)
  })
})
