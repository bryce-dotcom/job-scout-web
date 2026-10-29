// Cole's 4pm "reps vs goals" text, 2026-10-28, read "Sorry boss, I got
// tangled up trying to look that up." query_rep_goals worked and Jenny
// answered correctly — twice. The truth check stopped the first answer as an
// "absence" claim (she repeated the tool's own "JobScout does not record
// attendance"), and the second as a "card" claim ("one draft estimate was
// created today" — the scoreboard's whole subject is estimates created). Each
// correction ate one of the five rounds, so the second one, on the last round,
// threw the answer away. Goals really were unsaved (only 10-20 has rows); the
// lookup read the right day.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { claimsAbsence, claimsACard, fabricationIn } from '../../supabase/functions/_shared/arnieTruth.ts'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')

// What query_rep_goals returned that afternoon (its `means`), as arnie-chat hands it back.
const scoreboardResult = JSON.stringify({
  day: '2026-10-28',
  goals_set: false,
  board: [{ rep: 'Christopher Lyman', goal: { estimates_created: null }, actual: { estimates_created: 0, meetings_attended: 0, estimates_won: 1 } }],
  means: {
    estimates_created: 'estimates with that rep as salesperson, created today (any status)',
    meetings_attended: 'that rep\'s sales meetings on the calendar today that have started — JobScout does not record attendance, so a no-show counts unless it is marked cancelled or no-show',
    estimates_won: 'estimates approved or turned into a job today, credited to the estimate\'s salesperson — the same rule as Closed',
  },
})

describe('the 10-28 4pm scoreboard answers pass the truth check', () => {
  it('first answer: repeating the tool\'s "does not record attendance" is not an absence claim', () => {
    const reply = "Meetings come from the calendar, since JobScout doesn't record attendance. Zero means nothing was booked and started today."
    expect(claimsAbsence(reply, scoreboardResult)).toBe(false)
    // With no tool saying so, the same sentence is still caught.
    expect(claimsAbsence(reply)).toBe(true)
  })
  it('a tool\'s gap excuses only that gap, not a different one', () => {
    expect(claimsAbsence("JobScout doesn't track your loan payments.", scoreboardResult)).toBe(true)
    expect(claimsAbsence("I don't have your bank balance.", scoreboardResult)).toBe(true)
  })
  it.each([
    'Estimates created: one draft estimate was created today, "Unit 1" (Energy Scout, $5,094.70, created 4:38 PM UTC).',
    'Leads: 1 lead was created today, and it has no salesperson assigned.',
    'The estimate was created yesterday by Doug.',
  ])('second answer: a count of records is a report, not a card: %s', (s) => {
    expect(claimsACard(s)).toBe(false)
    expect(fabricationIn(s, ['query_rep_goals'], false)).toBeNull()
  })
  it.each([
    '**Yes, Cole — the estimate is created and sitting in JobScout right now.**',
    'Done — the lead has been created.',
    'Your estimate was created and is waiting.',
  ])('a claim to have made it is still caught: %s', (s) => {
    expect(claimsACard(s)).toBe(true)
  })
})

describe('a correction is an extra round, not one of the five', () => {
  const chat = read('supabase/functions/arnie-chat/index.ts')
  it('both reply paths widen the loop by the corrections made', () => {
    expect(chat).toMatch(/for \(let i = 0; i < \(used\.has\('use_my_computer'\) \? 12 : 5\) \+ corrections; i\+\+\)/)
    expect(chat).toMatch(/for \(let round = 0; round < \(used\.has\('use_my_computer'\) \? 12 : 5\) \+ corrections; round\+\+\)/)
  })
  it('and the last-lookup round moves with them', () => {
    expect(chat).toMatch(/const last = i === 4 \+ corrections && !used\.has\('use_my_computer'\)/)
    expect(chat).toMatch(/const lastLookup = \(round: number\) => !used\.has\('use_my_computer'\) && round === 4 \+ corrections/)
    expect(chat).not.toMatch(/i === 4 && !used\.has\('use_my_computer'\)/)
  })
})
