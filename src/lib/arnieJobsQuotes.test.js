import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isOpenQuote, OPEN_QUOTE_STATUSES } from '../../supabase/functions/_shared/arnieFollowup.ts'

const here = dirname(fileURLToPath(import.meta.url))
// Normalised to LF on read — this repo checks out CRLF on Windows and the
// shape assertions below anchor on newlines.
const chatTs = readFileSync(resolve(here, '../../supabase/functions/arnie-chat/index.ts'), 'utf8').replace(/\r\n/g, '\n')
const branch = (tool, next) => chatTs.slice(chatTs.indexOf(`if (name === '${tool}')`), chatTs.indexOf(`if (name === '${next}')`))
const toolDef = (tool, next) => chatTs.slice(chatTs.indexOf(`name: '${tool}'`), chatTs.indexOf(`name: '${next}'`))

// A jobs-and-quotes conversation against the deployed function on 2026-09-15,
// every figure checked against the rows, found:
//
//   "List our completed jobs"  →  "no completed jobs in the system". Nine.
//   The description said Complete, the column said Completed, `eq`.
//
//   "What do Jordan Lee's jobs total?"  →  $110,985. It was $127,225, and
//   the breakdown did not sum to its own total. Ungrouped aggregate()
//   returned a count and thirty rows and no sum.
//
//   "Which quotes have gone quiet, and who are they for?"  →  the quotes,
//   no names, after four query_customers calls. Quote rows carry
//   customer_id or lead_id and nothing else.
//
//   "Which open quotes have expired?"  →  "None", and the $41,200 one
//   "expires tomorrow (Sep 13)" — on Sep 15. No as_of, no verdict on the
//   row, so the model did the date arithmetic and did not know the date.
//
//   "How much have we had approved, and for whom?"  →  two quotes with
//   invented names and invented amounts that summed to the right total.
//   No tool call. That one is the model's; the harness pins it.

describe('an ungrouped aggregate carries its totals', () => {
  it('sums every sumField before returning the sample', () => {
    const agg = chatTs.slice(chatTs.indexOf('function aggregate('), chatTs.indexOf('function computePeriod('))
    expect(agg).toMatch(/for \(const f of sumFields\) totals\[`total_\$\{f\}`\]/)
    expect(agg).toMatch(/return \{ count: total, \.\.\.totals, sample: data\.slice\(0, 30\)/)
  })

  it('does not sum profit_margin — a percentage', () => {
    expect(branch('query_jobs', 'query_revenue')).not.toContain("'profit_margin'")
  })
})

describe('a job status filter matches the value the column holds', () => {
  it('is case-insensitive and whole-value', () => {
    expect(branch('query_jobs', 'query_revenue')).toContain("params.append('status', `ilike.${String(input.status).replace(/[*,()]/g, '')}`)")
  })

  it('names the statuses in use instead of saying none', () => {
    const b = branch('query_jobs', 'query_revenue')
    expect(b).toMatch(/if \(input\.status && !got\.total\)/)
    expect(b).toContain('Statuses in use here:')
    expect(b).toContain('do not report "no jobs"')
  })

  it('suggests the real value in the description', () => {
    const def = toolDef('query_jobs', 'query_revenue')
    expect(def).toMatch(/status: \{ type: 'string', description: '[^']*Completed/)
    expect(def).not.toMatch(/e\.g\. Complete,/)
  })
})

describe('a quote is open by one rule', () => {
  it('is Sent/Draft/Pending with neither an approved nor a rejected date', () => {
    expect(OPEN_QUOTE_STATUSES).toEqual(['Sent', 'Draft', 'Pending'])
    expect(isOpenQuote({ status: 'Sent' })).toBe(true)
    expect(isOpenQuote({ status: 'Draft', approved_date: null, rejected_date: null })).toBe(true)
    expect(isOpenQuote({ status: 'Approved' })).toBe(false)
    expect(isOpenQuote({ status: 'Sent', approved_date: '2026-09-01' })).toBe(false)
    expect(isOpenQuote({ status: 'Sent', rejected_date: '2026-09-01' })).toBe(false)
    expect(isOpenQuote({})).toBe(false)
  })

  it('is the rule the follow-up rail uses, not a second copy', () => {
    const followup = readFileSync(resolve(here, '../../supabase/functions/_shared/arnieFollowup.ts'), 'utf8')
    expect(followup).toContain('const OPEN = OPEN_QUOTE_STATUSES')
    expect(chatTs).toMatch(/import \{ isOpenQuote, OPEN_QUOTE_STATUSES \} from '\.\.\/_shared\/arnieFollowup\.ts'/)
    expect(branch('query_quotes', 'query_expenses')).toContain('r.open = isOpenQuote(r)')
  })
})

describe('a quote row says for itself what state it is in', () => {
  const b = branch('query_quotes', 'query_expenses')

  it('carries as_of and the verdicts', () => {
    expect(b).toMatch(/const asOf = new Date\(\)\.toISOString\(\)\.slice\(0, 10\)/)
    for (const v of ['r.open =', 'r.days_out =', 'r.stale =', 'r.expired =', 'r.days_to_expiry =']) expect(b).toContain(v)
    expect(b).toContain('as_of: asOf')
  })

  it('accepts open / stale / expired as filters on the verdict', () => {
    expect(b).toMatch(/\['open', 'stale', 'expired'\]\.includes/)
    expect(b).toMatch(/if \(verdict\) got\.rows = got\.rows\.filter\(\(r: any\) => r\[verdict\]\)/)
  })

  it('matches a stored status whole and case-insensitively', () => {
    expect(b).toContain("params.append('status', `ilike.${String(input.status).replace(/[*,()]/g, '')}`)")
  })

  it('names who the quote is for, from the customer or the lead', () => {
    expect(b).toMatch(/sb\('customers'\)/)
    expect(b).toMatch(/sb\('leads'\)/)
    expect(b).toMatch(/r\.customer_name = \(r\.customer_id && nameById\.get\(`c\$\{r\.customer_id\}`\)\) \|\| \(r\.lead_id && nameById\.get\(`l\$\{r\.lead_id\}`\)\)/)
  })

  it('totals open, stale, expired and approved for the model', () => {
    for (const k of ['open_count', 'open_total', 'stale_count', 'stale_total', 'expired_count', 'expired_total', 'approved_count', 'approved_total', 'rejected_count']) expect(b).toContain(k)
  })

  it('stale means the same week the daily brief means', () => {
    expect(chatTs).toMatch(/const STALE_QUOTE_DAYS = 7\b/)
    const brief = readFileSync(resolve(here, '../../supabase/functions/_shared/arnieBrief.ts'), 'utf8')
    expect(brief).toContain('7 * 86400000')
  })

  it('tells the model never to describe a quote it has not fetched', () => {
    expect(toolDef('query_quotes', 'query_expenses')).toContain('never describe a quote from memory')
  })
})
