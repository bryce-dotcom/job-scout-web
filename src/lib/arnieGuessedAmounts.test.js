// The eval's receipt with every total blacked out, 2026-10-22: the reply said
// it would not work the total out from gallons times price — and carried the
// worked-out figure anyway. In a turn with a photo the figure trace cannot run,
// so the reply itself is read for an amount it said it could not see.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { guessedAmounts, correctionFor } from '../../supabase/functions/_shared/arnieTruth.ts'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')

describe('an amount it said it could not read, given anyway', () => {
  it.each([
    // gallons × price, the failing reply's shape
    "I can't read the total on this receipt — it's blacked out. I can read 22.418 gal at $3.899, so fuel alone would be $87.41, but I won't log a guess. What was the total?",
    // the two lines added together
    "The TOTAL line is blacked out. The fuel line reads $87.41 and the car wash $9.00, so the total is $96.41. Want me to log that?",
    // an estimate
    "I couldn't make out the total — it looks like roughly $96.41. Can you confirm?",
  ])('caught: %s', (s) => {
    expect(guessedAmounts(s).length).toBeGreaterThan(0)
  })

  it.each([
    // read it, no claim it was unreadable: nothing to check
    'Chevron, 09/16/2026, $96.41 on the Visa ending 4471. Logged as Fuel on the Auto Wash job — approve the card.',
    // unreadable, and no amount given — the right answer
    "I can't read the total on this receipt. I can read Chevron #2214 in Murray UT, 09/16/2026, 22.418 gal, Visa ending 4471. What was the total?",
    // unreadable total, a legible line quoted as itself, no arithmetic, no estimate
    "I can't make out the TOTAL, but the car wash line reads $12.00. What was the total?",
  ])('left alone: %s', (s) => {
    expect(guessedAmounts(s)).toEqual([])
  })

  it('the correction tells him to drop the guess and ask, and lets a printed figure stay', () => {
    const c = correctionFor('guess', true, ['$87.41'])
    expect(c).toMatch(/\$87\.41/)
    expect(c).toMatch(/Ask them for the amount/)
    expect(c).toMatch(/IS printed and legible/)
    expect(c).toMatch(/ALREADY READ/)
  })

  it('runs only in a turn with a photo or a document, on both the held and the streamed reply', () => {
    const chat = read('supabase/functions/arnie-chat/index.ts')
    expect(chat).toMatch(/function guessedAmountsOf\(text: string, convo: any\[\]\)/)
    expect(chat).toMatch(/b\?\.type === 'image' \|\| b\?\.type === 'document'\)\)\) return \[\]\r?\n\s*return guessedAmounts\(text\)/)
    expect(chat.match(/if \(!claim && guessed\.length\) claim = 'guess'/g)).toHaveLength(2)
    expect(chat).toMatch(/correctionFor\(claim, true, detail\)/)
  })

  it('the weekly review names it', () => {
    expect(read('api/cron/arnie-review.js')).toMatch(/guess: 'said an amount could not be read, then gave one anyway'/)
  })
})
