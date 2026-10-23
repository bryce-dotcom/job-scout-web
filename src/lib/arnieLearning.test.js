// The learning loop, part 1 (2026-10-23): a correction in the chat is fixed
// from a lookup and, when it is a company-wide lesson, offered as a rule.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { PUSHBACK, isCorrection, correctionNote, FLAG_PREFIX } from '../../supabase/functions/_shared/arnieLearning.ts'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const require = createRequire(import.meta.url)

describe('what counts as a correction', () => {
  it('is exactly what the weekly review counts as pushback', () => {
    const review = read('api/cron/arnie-review.js')
    const m = review.match(/const PUSHBACK = (\/.*\/i)\n/)
    expect(m[1]).toBe(String(PUSHBACK))
    const { isPushback } = require('../../api/cron/arnie-review.js')
    for (const s of ["That's wrong, it was the Lehi job", 'if it didn\'t happen Friday, move it', 'wrong customer', 'thanks!']) {
      expect(isCorrection(s)).toBe(isPushback(s))
    }
  })

  it.each([
    "That's wrong: we never quote parking lots by the pole",
    'wrong job — Desert RV is the St George one',
    "you didn't look at the right invoice",
    `${FLAG_PREFIX}.`,
    `${FLAG_PREFIX}: AutoSavvy is a Rocky Mountain Power customer`,
  ])('caught: %s', (s) => { expect(isCorrection(s)).toBe(true) })

  it.each([
    'what did we sell this month',
    "if it didn't happen Friday, push it to Monday",
    'perfect, thanks',
  ])('not a correction: %s', (s) => { expect(isCorrection(s)).toBe(false) })
})

describe('the note on the turn after', () => {
  it('fix it from a lookup first, then offer a rule only for a company-wide lesson', () => {
    const n = correctionNote(true)
    expect(n).toMatch(/check it with a lookup now/)
    expect(n).toMatch(/Want me to make that a rule for everyone\?/)
    expect(n).toMatch(/propose_create, target company_rule/)
    expect(n).toMatch(/money amounts, prices or anyone's pay/)
    expect(n).toMatch(/this person's own preference/)
  })
  it('where no card can be drawn (a text, an email), it points to the app instead', () => {
    const n = correctionNote(false)
    expect(n).not.toMatch(/propose_create/)
    expect(n).toMatch(/Jenny, new rule/)
  })
})

describe('the wiring', () => {
  const chat = read('supabase/functions/arnie-chat/index.ts')
  it('both the held and the streamed reply carry the note, on the newest message', () => {
    expect(chat.match(/const learnNote = agent === 'arnie' && isCorrection\(lastUserText\(messages\)\) \? correctionNote\(cards\.includes\('create'\)\) : ''/g)).toHaveLength(2)
    expect(chat.match(/withNote\(convo, notes\(learnNote, /g)).toHaveLength(2)
  })
  it('the chat has a "That\'s wrong" under each finished reply, sent as a correction', () => {
    const ui = read('src/pages/agents/arnie/ArnieChat.jsx')
    expect(ui).toMatch(/data-flag-wrong/)
    expect(ui).toMatch(/handleSend\(`\$\{FLAG_PREFIX\}\$\{about\}/)
    expect(ui).toMatch(/!\(loading && msg\.id === messages\[messages\.length - 1\]\?\.id\)/)
  })
})
