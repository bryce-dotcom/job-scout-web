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

  it('filling an existing empty draft goes through fillEstimateFromIntakeRest, the same one writer', () => {
    expect(apply).toMatch(/fillEstimateFromIntakeRest\(target, intake, fillId\)/)
    expect(prepare).toMatch(/already has line items — I only fill an empty draft/)
    expect(prepare).toMatch(/I only fill an empty draft\. Say "new estimate" instead/)
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
  it('a line that matches nothing is handed to Benny, not priced by Arnie', () => {
    // It used to be a dead end here ("give me a price"). Since 2026-09-29 the
    // miss is collected and sourced; what must never happen is Arnie putting a
    // number of its own on the line.
    expect(prepare).toMatch(/misses\.push\(\{ i, w \}\)/)
    expect(prepare).toMatch(/kind: 'custom'/)
    expect(prepare).toMatch(/price: money\(hit\.unit_price\)/)
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

describe('a quote line the price book does not carry — Benny prices it', () => {
  const sourced = prepare.slice(prepare.indexOf('const sourced:'), prepare.indexOf('const total = lines'))

  it('asks the one sourcing module, not a second copy of the search', () => {
    expect(quote).toMatch(/import \{ labourRate, sourcePrices \} from '\.\/bennySource\.ts'/)
    expect(sourced).toMatch(/await sourcePrices\(/)
    // No prompt, no web_search tool block, no model call of its own in here.
    expect(quote).not.toMatch(/web_search_20250305/)
    expect(quote).not.toMatch(/callAnthropic/)
  })

  it('collects every miss and searches once, rather than a search per line', () => {
    expect(sourced).toMatch(/misses\.map\(\(m\) => \(\{ key: String\(m\.i\)/)
    expect((sourced.match(/await sourcePrices\(/g) || []).length).toBe(1)
  })

  it('the sourced line is redlined and carries the page it was read on', () => {
    expect(sourced).toMatch(/price_source: 'ai_sourced'/)
    expect(sourced).toMatch(/source_url: hit\.source_url/)
    expect(sourced).toMatch(/match_kind: 'must_source'/)
  })

  it('the labour is priced by the tenant rate, never by a number the model typed', () => {
    expect(sourced).toMatch(/const rate = await labourRate\(r, companyId\)/)
    expect(sourced).toMatch(/price: rate\.rate/)
    // The hours are Benny's, scaled by the quantity on the line.
    expect(sourced).toMatch(/Math\.round\(hit\.hours \* qty \* 100\) \/ 100/)
  })

  it('the labour line is not itself marked ai_sourced — the rate is the tenants own', () => {
    const labour = sourced.slice(sourced.indexOf('if (hit.hours && rate)'), sourced.indexOf('} else if (hit.hours && !rate)'))
    expect(labour).not.toMatch(/price_source: 'ai_sourced'/)
    expect(labour).toMatch(/match_kind: 'must_source'/)
  })

  it('no labour rate set up says so plainly instead of inventing one', () => {
    expect(sourced).toMatch(/there is no labour rate set up/)
    expect(sourced).toMatch(/Settings → Labor Rates/)
  })

  it('what Benny could not find is named, and the estimate is refused rather than guessed', () => {
    expect(sourced).toMatch(/if \(stuck\.length\) return \{ ok: false, error:/)
    expect(sourced).toMatch(/stuck\.map\(\(x\) => `"\$\{x\}"`\)\.join\(', '\)/)
  })

  it('the card says where the price came from and that it is not verified yet', () => {
    expect(sourced).toMatch(/where the price came from/)
    expect(sourced).toMatch(/redlined until someone opens the page and verifies it/)
  })

  it('a placeholder that never got filled is spliced out, so no empty line reaches the intake', () => {
    expect(prepare).toMatch(/for \(let k = lines\.length - 1; k >= 0; k--\) if \(!lines\[k\]\) \{ lines\.splice\(k, 1\); display\.splice\(k, 1\) \}/)
  })

  it('the prompt tells Arnie this is what happens, so it stops asking for a price', () => {
    expect(engine).toMatch(/Benny/)
    expect(engine).toMatch(/A quote line we do not carry/)
  })
})
