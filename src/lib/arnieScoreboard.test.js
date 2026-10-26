// The learning loop, part 5 (2026-10-26): Monday's scoreboard — is he learning?
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { FLAG_PREFIX as SHARED_FLAG } from '../../supabase/functions/_shared/arnieLearning.ts'

const require = createRequire(import.meta.url)
const { scoreboardOf, scoreboardHtml, buildReview, FLAG_PREFIX } = require('../../api/cron/arnie-review.js')
const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

const since = '2026-10-19T14:00:00Z'
const turn = (at, said, s = at) => [
  { session_id: s, role: 'user', content: 'how many open jobs', created_at: at, email: 'cole@hhh.services' },
  { session_id: s, role: 'assistant', content: 'You have 12.', created_at: at, email: 'cole@hhh.services' },
  { session_id: s, role: 'user', content: said, created_at: at, email: 'cole@hhh.services' },
]

describe('this week beside last week', () => {
  const rows = scoreboardOf({
    since,
    messages: [...turn('2026-10-20T15:00:00Z', "That's wrong, it's 14.")],
    lastMessages: [...turn('2026-10-13T15:00:00Z', 'wrong job'), ...turn('2026-10-14T15:00:00Z', "That's wrong."), ...turn('2026-10-15T15:00:00Z', "you didn't look")],
    events: [{ created_at: '2026-10-20T15:00:00Z' }],
    lastEvents: [{ created_at: '2026-10-13T15:00:00Z' }, { created_at: '2026-10-14T15:00:00Z' }],
    rules: [{ created_at: '2026-10-20T15:00:00Z', active: true }, { created_at: '2026-10-01T15:00:00Z', active: true }, { created_at: '2026-10-02T15:00:00Z', active: false }],
    tests: [{ last_passed: true, last_run_at: '2026-10-21T10:00:00Z' }, { last_passed: false, last_run_at: '2026-10-21T10:00:00Z' }, { last_passed: true, last_run_at: '2026-10-01T10:00:00Z' }],
    routines: [{ created_at: '2026-10-20T15:00:00Z' }],
    lessons: [{ rule: 'x' }],
  })
  const by = Object.fromEntries(rows.map((r) => [r.what, r]))
  it('counts each, this week and last', () => {
    expect(by['Times someone told him he was wrong']).toMatchObject({ now: 1, before: 3, better: 'down' })
    expect(by['"That\'s wrong" taps under a reply']).toMatchObject({ now: 1, before: 1 })
    expect(by['Claims the fact-check caught']).toMatchObject({ now: 1, before: 2 })
    expect(by['Rules taught']).toMatchObject({ now: 1, before: 0, note: '2 active' })
    expect(by['Lessons waiting for an admin']).toMatchObject({ now: 1, before: null })
    expect(by['Rules he follows in his nightly test']).toMatchObject({ now: 1, note: 'of 2 tested' })
    expect(by['Routines set up']).toMatchObject({ now: 1, before: 0 })
  })
  it('marks which way it moved, green when it is the good way', () => {
    const html = scoreboardHtml(rows)
    expect(html).toMatch(/Is he learning\?/)
    expect(html).toMatch(/Times someone told him he was wrong<\/td><td[^>]*>1 <span style="color:#2f7d4e">▼<\/span>/)
    expect(html).toMatch(/Rules taught <span[^>]*>\(2 active\)<\/span><\/td><td[^>]*>1 <span style="color:#2f7d4e">▲<\/span>/)
  })
  it('sits at the top of the review, before the lessons', () => {
    const r = buildReview({ companyName: 'HHH', since, messages: turn('2026-10-20T15:00:00Z', "That's wrong."), score: rows, lessons: [{ rule: 'A relamp is a Service job.', who: 'cole@hhh.services', said: "That's wrong" }] })
    expect(r.html.indexOf('Is he learning?')).toBeLessThan(r.html.indexOf('Lessons waiting for an admin'))
  })
})

describe('the wiring', () => {
  it('the button\'s words are the same in the app and the review', () => {
    expect(FLAG_PREFIX).toBe(SHARED_FLAG)
  })
  it('two weeks are read and split; the review itself is still this week', () => {
    const cron = read('api/cron/arnie-review.js')
    expect(cron).toMatch(/const before = new Date\(Date\.now\(\) - 14 \* 86400000\)\.toISOString\(\)/)
    expect(cron).toMatch(/const messages = both\.filter\(thisWeek\)/)
    expect(cron).toMatch(/const events = bothEvents\.filter\(thisWeek\)/)
    expect(cron).toMatch(/const score = scoreboardOf\(\{ since, messages, lastMessages, events, lastEvents, rules, tests: allTests, routines, lessons \}\)/)
  })
})
