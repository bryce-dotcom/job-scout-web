import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const quote = read('../../supabase/functions/_shared/arnieQuote.ts')
const create = read('../../supabase/functions/_shared/arnieCreate.ts')
const engine = read('../pages/agents/arnie/arnieEngine.js')

const prepare = quote.slice(quote.indexOf('export async function prepareQuote'), quote.indexOf('export async function applyQuote'))
const apply = quote.slice(quote.indexOf('export async function applyQuote'), quote.indexOf('export async function rollbackQuote'))
const rollback = quote.slice(quote.indexOf('export async function rollbackQuote'))

describe('a quote through Arnie goes through the one intake, not a sixth copy of the write', () => {
  it('apply calls createEstimateFromIntakeRest and never inserts quotes or quote_lines itself', () => {
    expect(apply).toMatch(/createEstimateFromIntakeRest\(/)
    expect(quote).not.toMatch(/rest\/v1\/quotes`, \{\s*method: 'POST'/)
    expect(quote).not.toMatch(/rest\/v1\/quote_lines`, \{\s*method: 'POST'/)
  })

  it('is a Draft, and the lead does not advance — nothing has been sent', () => {
    expect(prepare).toMatch(/status: 'Draft'/)
    expect(apply).toMatch(/advanceLeadTo: null/)
  })

  it('records the source so a bad bid can be traced home', () => {
    expect(prepare).toMatch(/source: 'arnie'/)
  })
})

describe('Arnie never invents a price', () => {
  it('a line that matches nothing needs a price from the person, or it is refused', () => {
    expect(prepare).toMatch(/if \(w\.price === undefined\) return \{ ok: false, error: `Nothing in the price book matches/)
    expect(prepare).toMatch(/kind: 'custom'/)
  })

  it('a matched line takes the book price unless the person said one', () => {
    expect(prepare).toMatch(/const price = w\.price === undefined \? Number\(p\.unit_price\) \|\| 0 : money\(w\.price\)/)
  })

  it('several matching products is a question, never a pick', () => {
    expect(prepare).toMatch(/if \(hits\.length > 1\) \{\s*return \{ needs_choice:/)
  })

  it('the price book is matched the way query_products matches — squashed', () => {
    expect(quote).toMatch(/const squash = \(s: unknown\) => String\(s \?\? ''\)\.toLowerCase\(\)\.replace\(\/\[\^a-z0-9\]\/g, ''\)/)
    expect(prepare).toMatch(/active=eq\.true/)
  })

  it('the prompt says so in as many words', () => {
    expect(engine).toMatch(/\*\*You do not price things\.\*\*/)
    expect(engine).toMatch(/never make one up/)
  })
})

describe('the lines arrive structured, and the card shows every one with its maths', () => {
  it('lines is a raw (JSON) field on the quote target', () => {
    const block = create.slice(create.indexOf('quote: {'), create.indexOf('export const isCreateTarget'))
    expect(block).toMatch(/lines:\s*\{[^}]*required: true[^}]*raw: true/)
    expect(create).toMatch(/def\.raw \? JSON\.stringify\(v\)/)
  })

  it('every line and the total are on the card', () => {
    expect(prepare).toMatch(/label: `Line \$\{i \+ 1\}`/)
    expect(prepare).toMatch(/label: 'Total', value: usd\(total\) \+ ' · Draft — nothing is sent'/)
  })
})

describe('withdrawing a quote', () => {
  it('only while it is still a draft nobody has sent, approved or won', () => {
    expect(rollback).toMatch(/q\.status !== 'Draft' \|\| q\.last_sent_at \|\| q\.job_id \|\| q\.approved_date/)
  })

  it('lines, then header, then the lead back as it was', () => {
    const iLines = rollback.indexOf("rest/v1/quote_lines?quote_id=eq.")
    const iLead = rollback.indexOf("patchRow(r, 'leads', companyId, leadId, before)")
    const iQuote = rollback.indexOf("rest/v1/quotes?id=eq.")
    expect(iLines).toBeGreaterThan(-1); expect(iLead).toBeGreaterThan(iLines); expect(iQuote).toBeGreaterThan(iLead)
  })

  it("puts the setter's fee back to pending when no quote remains on the lead — the trigger only handles relinks", () => {
    expect(rollback).toMatch(/payment_status=eq\.earned/)
    expect(rollback).toMatch(/payment_status: 'pending'/)
    expect(rollback).toMatch(/if \(!others\.length\)/)
  })
})
