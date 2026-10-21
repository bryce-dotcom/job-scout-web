// The weekly Arnie review (Bryce, 2026-10-21). Built from this week's real
// failures: Alayda's blank replies, Cole's invented lead list, and the kind
// of pushback that used to be found only when someone complained to Bryce.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { buildReview, PUSHBACK, isPushback } = require('../../api/cron/arnie-review.js')

const since = '2026-10-14T14:00:00Z'
const msg = (session_id, role, content, created_at, email = 'alayda@hhh.services') => ({ session_id, role, content, created_at, email })

describe('what makes the list', () => {
  const messages = [
    // Alayda: the "yes" that came back blank
    msg('a', 'user', 'I need fixture part numbers in the notes on fast auto job.', '2026-10-21T19:06:47Z'),
    msg('a', 'assistant', 'Want me to add the part numbers?\n\n⟦receipt⟧ Looked up: jobs (1)', '2026-10-21T19:06:55Z'),
    msg('a', 'user', 'yes', '2026-10-21T19:07:06Z'),
    msg('a', 'assistant', '', '2026-10-21T19:07:23Z'),
    // Cole: an invented list, then he says it is wrong
    msg('c', 'user', 'my leads in negotiation with phone numbers', '2026-10-20T15:00:00Z', 'cole@hhh.services'),
    msg('c', 'assistant', 'You have 17:\n1. Paradise Bakery (480) 502-7017\n\n⟦receipt⟧ No lookups this reply', '2026-10-20T15:00:10Z', 'cole@hhh.services'),
    msg('c', 'user', "that's wrong, those aren't my leads", '2026-10-20T15:01:00Z', 'cole@hhh.services'),
    msg('c', 'assistant', 'You have 5 in Negotiation.\n\n⟦receipt⟧ Looked up: leads (5)', '2026-10-20T15:01:09Z', 'cole@hhh.services'),
    // fine: looked up, no complaint
    msg('d', 'user', 'how many open jobs', '2026-10-20T16:00:00Z', 'london@hhh.services'),
    msg('d', 'assistant', '12 open jobs, $80,060.28.\n\n⟦receipt⟧ Looked up: jobs (12)', '2026-10-20T16:00:05Z', 'london@hhh.services'),
    // fine: chat with no figures and no lookups
    msg('e', 'user', 'thanks', '2026-10-20T16:01:00Z', 'london@hhh.services'),
    msg('e', 'assistant', 'Any time.\n\n⟦receipt⟧ No lookups this reply', '2026-10-20T16:01:02Z', 'london@hhh.services'),
  ]
  const events = [{ created_at: '2026-10-20T15:00:09Z', employee_email: 'cole@hhh.services', kind: 'email', shown: true, said: 'email me the list', reply: 'Email sent, boss.' }]
  const r = buildReview({ companyName: 'HHH Services', since, events, messages, failures: [{ error_kind: 'overloaded' }], usage: { cost: 12.5 } })

  it('counts each kind', () => {
    expect(r.counts).toEqual({ caught: 1, unverified: 1, pushback: 1, gaveUp: 1, failed: 1 })
    expect(r.toLook).toBe(5)
    expect(r.people).toBe(3)
    expect(r.subject).toBe('Arnie this week at HHH Services: 5 to look at')
  })
  it('the blank reply names what was asked', () => {
    expect(r.html).toMatch(/Alayda asked <span[^>]*>“yes”<\/span> — <b>he sent back nothing<\/b>/)
  })
  it('the unverified figures are the invented list, not London\'s looked-up count', () => {
    expect(r.html).toMatch(/Figures he never looked up[\s\S]*Paradise Bakery/)
    expect(r.html).not.toMatch(/Figures he never looked up[\s\S]*80,060\.28[\s\S]*Someone said/)
  })
  it('pushback shows the reply it answered and that reply\'s receipt', () => {
    expect(r.html).toMatch(/Cole: <span[^>]*>“that&#39;s wrong|Cole: <span[^>]*>“that's wrong/)
    expect(r.html).toMatch(/receipt: No lookups this reply/)
  })
  it('a caught claim says whether they saw it', () => {
    expect(r.html).toMatch(/said an email went that never did <b>and they saw it before he took it back<\/b>/)
  })
  it('a quiet week says all clear', () => {
    const q = buildReview({ companyName: 'HHH', since, messages: [msg('e', 'user', 'thanks', since), msg('e', 'assistant', 'Any time.\n\n⟦receipt⟧ No lookups this reply', since)] })
    expect(q.toLook).toBe(0)
    expect(q.subject).toMatch(/all clear/)
  })
  it('a person\'s words are escaped, never rendered as HTML', () => {
    const x = buildReview({ companyName: 'HHH', since, messages: [msg('z', 'user', '<img src=x onerror=alert(1)>', since), msg('z', 'assistant', '', since)] })
    expect(x.html).not.toMatch(/<img/)
    expect(x.html).toMatch(/&lt;img/)
  })
})

describe('pushback, as people actually say it', () => {
  it.each(["that's wrong", 'I dont see any card', "you didn't send it", 'that is not right', 'where is the card', 'you made that up', 'still dont see it'])('%s', (s) => {
    expect(PUSHBACK.test(s)).toBe(true)
  })
  it.each(['yes', 'what jobs did I close', 'thanks', 'add the part numbers', 'send it to me'])('not: %s', (s) => {
    expect(PUSHBACK.test(s)).toBe(false)
  })
  it('a condition is not pushback (Cole\'s plan for the day, 2026-10-19)', () => {
    expect(isPushback("Get the Little Wedges general app, if it didn't happen Friday 4 PM rep follow-up")).toBe(false)
    expect(isPushback("that's wrong, if you look again")).toBe(true)
    expect(isPushback("you didn't send it")).toBe(true)
  })
})

describe('wiring', () => {
  it('runs every Monday, with room to read the week', () => {
    const v = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'))
    expect(v.crons).toContainEqual({ path: '/api/cron/arnie-review', schedule: '0 14 * * 1' })
    expect(v.functions['api/cron/arnie-review.js'].maxDuration).toBe(300)
  })
  it('each company\'s owners get their own company only', () => {
    const src = readFileSync(new URL('../../api/cron/arnie-review.js', import.meta.url), 'utf8')
    expect(src).toMatch(/employees\?select=email&company_id=eq\.\$\{companyId\}&active=eq\.true/)
    expect(src).toMatch(/arnie_review_events\?select=[^`]*&company_id=eq\.\$\{companyId\}/)
  })
  it('a test send can only narrow to one of the owners, never add an address', () => {
    const src = readFileSync(new URL('../../api/cron/arnie-review.js', import.meta.url), 'utf8')
    expect(src).toMatch(/const to = q\.only_to \? owned\.filter\(\(e\) => e === String\(q\.only_to\)\.toLowerCase\(\)\) : owned/)
  })
  it('every caught claim is kept, with what was asked and whether it was seen', () => {
    const chat = readFileSync(new URL('../../supabase/functions/arnie-chat/index.ts', import.meta.url), 'utf8')
    expect(chat).toMatch(/rest\/v1\/arnie_review_events/)
    expect((chat.match(/logFabrication\(claim, caller, lastUserText\(messages\), text, (true|false)\)/g) || []).length).toBe(3)
  })
})
