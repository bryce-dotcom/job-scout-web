// Permission parity (Bryce, 2026-10-27): what a person can see in JobScout,
// Arnie can look up. Asked whether a $15,000 pole barn was safe, Arnie said
// "I don't have your bank balance" while Books had it — Frankie's books
// lookups had never been given to the head assistant.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { PARITY, parityGaps } from '../../supabase/functions/_shared/arnieParity.ts'
import { claimsAbsence, correctionFor } from '../../supabase/functions/_shared/arnieTruth.ts'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const appMap = read('supabase/functions/_shared/appMap.ts')
const chat = read('supabase/functions/arnie-chat/index.ts')
const frankie = read('supabase/functions/_shared/frankieTools.ts')
const lookups = read('supabase/functions/_shared/arnieLookups.ts')
const routes = [...appMap.matchAll(/route: '([^']+)', label:/g)].map((m) => m[1])
const arnieTools = new Set([...(chat + lookups).matchAll(/name: '(query_[a-z_]+)'/g)].map((m) => m[1]))
const books = new Set([...chat.match(/export const BOOKS_TOOLS = new Set\(\[([\s\S]*?)\]\)/)[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]))
const frankieTools = new Set([...frankie.matchAll(/name: '(query_[a-z_]+)'/g)].map((m) => m[1]))

describe('every page has a line: what Arnie reads there, or why there is nothing, or the gap', () => {
  it.each(routes)('%s', (route) => {
    expect(PARITY[route], `${route} is on the app map but not in arnieParity.ts — say what Arnie reads there, or mark it a gap`).toBeTruthy()
  })
  it('no stale lines for pages that are gone', () => {
    expect(Object.keys(PARITY).filter((r) => !routes.includes(r))).toEqual([])
  })
  it('every lookup named is one Arnie really has', () => {
    const named = Object.values(PARITY).flatMap((p) => p.reads || [])
    expect(named.filter((t) => !arnieTools.has(t) && !books.has(t))).toEqual([])
  })
})

describe('the books are Arnie\'s too, on Frankie\'s clearance', () => {
  it('every books lookup is one of Frankie\'s', () => {
    expect([...books].filter((t) => !frankieTools.has(t))).toEqual([])
  })
  it('not her sales, estimates, invoices, payments, leads, inventory or time clock — Arnie has his own', () => {
    for (const t of ['query_sales', 'query_estimates', 'query_invoices', 'query_payments', 'query_leads', 'query_inventory', 'query_time_clock']) expect(books.has(t)).toBe(false)
  })
  it('offered by Frankie\'s own rule for this person, and run through her executor', () => {
    expect(chat).toMatch(/const booksToolsFor = \(caller: Caller\) => frankieToolsFor\(caller\)\.filter\(\(t: any\) => BOOKS_TOOLS\.has\(t\?\.name\)\)/)
    expect(chat).toMatch(/const all = \[\.\.\.toolsFor\(caller\.role, cards, \{ ownSession: !!bearer \}\), \.\.\.booksToolsFor\(caller\)\]/)
    expect(chat).toMatch(/: BOOKS_TOOLS\.has\(name\)\s*\? execFrankieTool\(name, input, caller, rest\)/)
    // Frankie's executor refuses a role below the line whatever is offered.
    expect(frankie).toMatch(/case 'query_bank_balances': return a\.full \? await bankBalances\(r, co\) : RESTRICTED/)
  })
  it('the rules say money out is the bank feed and payroll, and how to answer "ask Frankie"', () => {
    const p = read('supabase/functions/_shared/arniePrompt.ts')
    expect(p).toMatch(/Money OUT is the bank feed and payroll, not query_expenses/)
    expect(p).toMatch(/Frankie is the company's bookkeeper/)
    expect(p).toMatch(/say exactly: "I can't look that up yet"/)
  })
})

describe('"it isn\'t in JobScout" is caught', () => {
  it.each([
    "I can't give you a safe-to-spend figure, though, because I don't have your bank balance.",
    "That's too thin to be your real cost base. Payroll and most cost of sales aren't in it.",
    'Payroll is not tracked in JobScout.',
    "JobScout doesn't track your loan payments.",
  ])('caught: %s', (s) => { expect(claimsAbsence(s)).toBe(true) })
  it.each([
    'There are no overdue invoices right now.',
    "You don't have any jobs scheduled tomorrow.",
    "I can't look that up yet — open Marketing to see the posts.",
    'Your bank balance across the two accounts is $84,210 as of this morning.',
  ])('left alone: %s', (s) => { expect(claimsAbsence(s)).toBe(false) })
  it('the correction names the lookups to use and the honest words if none can reach it', () => {
    const c = correctionFor('absence', false, ['query_bank_balances', 'query_pnl'])
    expect(c).toMatch(/you have query_bank_balances, query_pnl/)
    expect(c).toMatch(/"I can't look that up yet"/)
  })
  it('both reply paths check it; a gap is kept for Monday', () => {
    expect(chat.match(/if \(!claim && claimsAbsence\(text\)\) claim = 'absence'/g)).toHaveLength(2)
    expect(chat.match(/logGap\(caller, lastUserText\(messages\), text\)/g)).toHaveLength(2)
    const review = read('api/cron/arnie-review.js')
    expect(review).toMatch(/section\('Asked for something he cannot look up yet', gaps/)
    expect(review).toMatch(/absence: 'said something was not in JobScout/)
  })
})

describe('the gaps today', () => {
  it('are listed, so they can be built', () => {
    expect(parityGaps().map((g) => g.route).sort()).toEqual([
      '/bookings', '/company-map', '/document-rules', '/marketing', '/routes',
    ])
  })
})

describe('payroll is what leaves the bank (Bryce, 2026-10-28: "payroll is about 30-40k per pay period")', () => {
  it('the rules say trust the bank over partial payroll runs, and never call it double-counting', () => {
    const p = read('supabase/functions/_shared/arniePrompt.ts')
    expect(p).toMatch(/What payroll really costs is what leaves the bank for it/)
    expect(p).toMatch(/When the runs and the bank disagree, trust the bank, say the runs look partial, and never call the bank's figure double-counting/)
    // Checks clear over days (Bryce, 2026-10-28): one payroll is everything that clears between pay dates, and uncleared checks are not spendable.
    expect(p).toMatch(/A payroll does not leave the bank all at once/)
    expect(p).toMatch(/minus what is still to clear from the LAST payroll/)
  })
})
