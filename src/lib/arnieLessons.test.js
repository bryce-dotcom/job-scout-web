// The learning loop, part 2 (2026-10-23): the week's corrections, drafted as
// rules waiting for an admin, at the top of Monday's review.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { LESSON_SYSTEM, lessonPrompt, parseVerdicts } from '../../supabase/functions/_shared/arnieLessons.ts'

const require = createRequire(import.meta.url)
const { buildReview, pushbacksOf } = require('../../api/cron/arnie-review.js')
const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')

describe('what counts as a lesson', () => {
  it('the same test as in the chat: company-wide only, never money, one record, a slip or a preference', () => {
    for (const re of [/for EVERYONE/, /One record was wrong/, /looked something up wrong/, /own preference/, /money amounts, prices or anyone's pay/, /Already covered/, /Most corrections are NOT lessons/]) {
      expect(LESSON_SYSTEM).toMatch(re)
    }
  })
  it('the prompt shows the rules and the waiting suggestions, so nothing is drafted twice', () => {
    const p = lessonPrompt([{ i: 0, who: 'cole@x', said: "That's wrong, a relamp is a Service job", before: 'It is a Project.' }], ['Exterior SRP lights are 12/7.'], ['A relamp is a Service job.'])
    expect(p).toMatch(/- Exterior SRP lights are 12\/7\./)
    expect(p).toMatch(/already waiting[\s\S]*- A relamp is a Service job\./)
    expect(p).toMatch(/#0\nThe assistant said: It is a Project\.\nThey replied: That's wrong/)
  })
  it('reads the answer, and anything unreadable or out of range is not a lesson', () => {
    const v = parseVerdicts('Here: [{"i":0,"lesson":true,"rule":"A bulbs-only job is a relamp.","why":"term"},{"i":1,"lesson":true,"rule":"x","why":"too short"},{"i":7,"lesson":true,"rule":"Out of range rule here","why":""},{"i":2,"lesson":false,"rule":null,"why":"one record"}]', 3)
    expect(v.map((x) => [x.i, x.lesson])).toEqual([[0, true], [1, false], [2, false]])
    expect(parseVerdicts('no json at all', 2)).toEqual([])
  })
})

describe('Monday\'s email', () => {
  const messages = [
    { session_id: 's', role: 'user', content: 'What do we call a bulbs-only job?', created_at: '2026-10-20T15:00:00Z', email: 'cole@hhh.services' },
    { session_id: 's', role: 'assistant', content: 'A retrofit.\n⟦receipt⟧ No lookups this reply', created_at: '2026-10-20T15:00:05Z', email: 'cole@hhh.services' },
    { session_id: 's', role: 'user', content: "That's wrong, here a bulbs-only job is a relamp", created_at: '2026-10-20T15:01:00Z', email: 'cole@hhh.services' },
  ]
  it('the corrections it reads are the pushback the review already lists', () => {
    const p = pushbacksOf(messages)
    expect(p).toHaveLength(1)
    expect(p[0]).toMatchObject({ who: 'cole@hhh.services', prevText: 'A retrofit.', prevReceipt: 'No lookups this reply' })
  })
  it('lessons go first, with the way to approve them, and the subject says so', () => {
    const r = buildReview({ companyName: 'HHH', since: '2026-10-19T14:00:00Z', messages, lessons: [{ rule: 'A bulbs-only job is a relamp.', who: 'cole@hhh.services', said: "That's wrong, here a bulbs-only job is a relamp" }] })
    expect(r.counts.lessons).toBe(1)
    expect(r.subject).toMatch(/1 lesson to approve$/)
    expect(r.html.indexOf('Lessons waiting for an admin')).toBeLessThan(r.html.indexOf('Someone said he was wrong'))
    expect(r.html).toMatch(/<b>A bulbs-only job is a relamp\.<\/b>/)
    expect(r.html).toMatch(/from Cole's correction/)
    expect(r.html).toMatch(/href="https:\/\/jobscout\.appsannex\.com\/agents\/arnie\/settings"/)
  })
  it('no lessons, no section and no change to the subject', () => {
    const r = buildReview({ companyName: 'HHH', since: '2026-10-19T14:00:00Z', messages })
    expect(r.html).not.toMatch(/Lessons waiting/)
    expect(r.subject).not.toMatch(/lesson/)
  })
})

describe('the wiring', () => {
  it('the review asks arnie-lessons, and a dry run drafts nothing; a failure never stops the email', () => {
    const cron = read('api/cron/arnie-review.js')
    expect(cron).toMatch(/functions\/v1\/arnie-lessons`, \{ method: 'POST', headers: H, body: JSON\.stringify\(\{ company_id: companyId, corrections, dry \}\)/)
    expect(cron).toMatch(/catch \(e\) \{ console\.warn\('arnie-review: lessons failed'/)
  })
  it('a lesson is a SUGGESTION through the "Jenny, new rule" rail, in the corrector\'s name, never an admin\'s', () => {
    const fn = read('supabase/functions/arnie-lessons/index.ts')
    expect(fn).toMatch(/isCronCaller/)
    expect(fn).toMatch(/proposeCreate\(r, \{ email, companyId, employeeId: idOf\.get\(email\) \?\? null, role: 'user', level: 0 \}/)
    expect(fn).toMatch(/target: 'company_rule'/)
    expect(fn).toMatch(/if \(body\.dry\) \{ lessons\.push\(lesson\); continue \}/)
  })
})
