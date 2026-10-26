// The learning loop, part 4 (2026-10-23): a question asked on two other days
// is answered, then offered once as a routine.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { wordsOf, sameQuestion, findRepeat, repeatNote } from '../../supabase/functions/_shared/arnieRepeats.ts'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const TZ = 'America/Denver'
const NOW = Date.parse('2026-10-23T15:00:00Z') // Fri 9am Denver
const q = (at, content, session = at) => ({ session_id: session, role: 'user', content, created_at: at })
const a = (at, content, session) => ({ session_id: session, role: 'assistant', content, created_at: at })

describe('the same question in other words', () => {
  it.each([
    ['what did we sell this month', 'Jenny what have we sold this month?'],
    ['how many open invoices do we have', 'open invoices — how many?'],
    ['who is out of the office today', 'Who is out of the office today on the sales team'],
  ])('%s ≈ %s', (x, y) => { expect(sameQuestion(x, y)).toBe(true) })
  it.each([
    ['what did we sell this month', 'what is the address for the Mesa job'],
    ['open invoices', 'open jobs in Colorado'],
    ['hi', 'hi'],
  ])('%s ≠ %s', (x, y) => { expect(sameQuestion(x, y)).toBe(false) })
  it('names and filler do not count as meaning', () => {
    expect([...wordsOf('Jenny what did we sell this month please')]).toEqual(['sell', 'month'])
  })
})

describe('asked on two other days', () => {
  const said = 'What have we sold this month?'
  const mon = '2026-10-19T14:10:00Z', wed = '2026-10-21T14:30:00Z', today = '2026-10-23T14:55:00Z'
  it('two earlier mornings on weekdays → offer every weekday around 8am', () => {
    const r = findRepeat(said, [q(mon, 'what did we sell this month'), q(wed, 'Jenny what did we sell this month'), q(today, said)], [], TZ, NOW)
    expect(r).toEqual({ days: ['Mon 10/19', 'Wed 10/21'], hour: 8, weekdaysOnly: true })
    expect(repeatNote(r)).toMatch(/want it every weekday at 8am\?/)
  })
  it('only once before, or only today, is not a pattern', () => {
    expect(findRepeat(said, [q(mon, 'what did we sell this month'), q(today, said)], [], TZ, NOW)).toBe(null)
    expect(findRepeat(said, [q('2026-10-23T13:00:00Z', said), q(today, said)], [], TZ, NOW)).toBe(null)
  })
  it('not when a routine of theirs already asks it', () => {
    expect(findRepeat(said, [q(mon, 'what did we sell this month'), q(wed, 'what did we sell this month')], ['What did we sell this month? One line per rep.'], TZ, NOW)).toBe(null)
  })
  it('not twice in 14 days: her earlier reply that offered a schedule is the record', () => {
    const msgs = [q(mon, 'what did we sell this month', 's1'), q(wed, 'what did we sell this month', 's2'), a('2026-10-21T14:31:00Z', '…$217k. You ask this a lot — want it every weekday at 8am?', 's2')]
    expect(findRepeat(said, msgs, [], TZ, NOW)).toBe(null)
  })
  it('a weekend ask makes it every day', () => {
    const r = findRepeat(said, [q('2026-10-18T15:00:00Z', 'what did we sell this month'), q(wed, 'what did we sell this month')], [], TZ, NOW)
    expect(r.weekdaysOnly).toBe(false)
    expect(repeatNote(r)).toMatch(/every day at/)
  })
})

describe('the note', () => {
  const n = repeatNote({ days: ['Mon 10/19', 'Wed 10/21'], hour: 16, weekdaysOnly: true })
  it('answer first, offer once, only for something that changes over time, as a routine card', () => {
    expect(n).toMatch(/Answer it fully, as usual/)
    expect(n).toMatch(/ONLY if it is something that changes over time/)
    expect(n).toMatch(/propose_create, target routine/)
    expect(n).toMatch(/every_day = "yes" for every day or "no" for weekdays only/)
    expect(n).toMatch(/at 4pm\?/)
    expect(n).toMatch(/Do not offer for a one-off lookup/)
  })
})

describe('the wiring', () => {
  const chat = read('supabase/functions/arnie-chat/index.ts')
  it('only for a person in the app whose app shows cards, and never on a correction', () => {
    expect(chat).toMatch(/if \(agent === 'arnie' && inTheApp && caller\.employeeId != null && caller\.companyId != null && cards\.includes\('create'\)\) \{\n\s*const note = await repeatNoteFor\(caller, lastUserText\(cleaned\)\)/)
    expect(chat).toMatch(/if \(!said \|\| isCorrection\(said\)\) return ''/)
  })
  it('reads only their own sessions and their own routines', () => {
    expect(chat).toMatch(/ai_sessions\?select=session_id&company_id=eq\.\$\{caller\.companyId\}&user_email=ilike\.\$\{encodeURIComponent\(caller\.email\)\}/)
    expect(chat).toMatch(/arnie_routines\?select=prompt&employee_id=eq\.\$\{caller\.employeeId\}/)
  })
  it('both turn paths carry it', () => {
    expect(chat.match(/const askedBefore = turnNote\.get\(caller as unknown as object\) \|\| ''/g)).toHaveLength(2)
    expect(chat.match(/notes\(learnNote, askedBefore, /g)).toHaveLength(2)
  })
})
