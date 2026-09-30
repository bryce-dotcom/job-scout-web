// The sourcing rule now has two callers (Benny's bid intake and Arnie's quote
// rail), which is exactly the shape that went wrong five times before in this
// codebase — one rule written twice, and the second copy drifts. These tests
// pin that there is one module and that both callers go through it.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const src = read('../../supabase/functions/_shared/bennySource.ts')
const benny = read('../../supabase/functions/benny-bid-intake/index.ts')
const quote = read('../../supabase/functions/_shared/arnieQuote.ts')

describe('one sourcing module, two callers', () => {
  it('both callers import it and neither runs a web search of its own', () => {
    expect(benny).toMatch(/import \{ sourcePrices \} from '\.\.\/_shared\/bennySource\.ts'/)
    expect(quote).toMatch(/from '\.\/bennySource\.ts'/)
    // The tool block lives in exactly one place now.
    expect((src.match(/web_search_20250305/g) || []).length).toBe(1)
    expect(benny).not.toMatch(/web_search_20250305/)
    expect(quote).not.toMatch(/web_search_20250305/)
  })

  it('each caller names itself, so the metering says which agent spent the money', () => {
    expect(benny).toMatch(/feature: 'benny-bid-intake'/)
    expect(quote).toMatch(/feature: 'arnie-quote-source'/)
    expect(src).toMatch(/callAnthropic\(\{ feature: opts\.feature, companyId: opts\.companyId \}/)
  })

  it('a bid asks for the price, an estimate asks for the price and the time', () => {
    expect(benny).not.toMatch(/withLabour/)
    expect(quote).toMatch(/withLabour: true/)
    expect(src).toMatch(/const labour = opts\.withLabour/)
  })
})

describe('a price with no page it came from is dropped, never filled in', () => {
  it('the URL has to look like a real page and the price has to be positive', () => {
    expect(src).toMatch(/if \(!\/\^https\?:\\\/\\\/\\S\+\\\.\\S\+\/i\.test\(url\) \|\| !\(price > 0\)\) continue/)
  })

  it('the prompt forbids a search-results URL and an invented one', () => {
    expect(src).toMatch(/never invent one, never use a search-results URL/)
    expect(src).toMatch(/leave that item out entirely rather than guessing/)
  })

  it('a failed search is survivable — the caller says it could not source the line', () => {
    expect(src).toMatch(/catch \(e\)/)
    expect(src).toMatch(/return \{ found, searches \}/)
  })

  it('a long search that pauses mid-turn is handed back and finished', () => {
    expect(src).toMatch(/stop_reason !== 'pause_turn'/)
  })
})

describe('labour hours', () => {
  it('are only asked for when the caller wants them, and are bounded', () => {
    expect(src).toMatch(/opts\.withLabour && Number\.isFinite\(hours\) && hours > 0 && hours <= 200/)
  })

  it('are not asked for on a line nobody installs', () => {
    expect(src).toMatch(/Leave it out if the item is not something anybody installs/)
  })
})

describe('the labour RATE is the tenants own, never a model number', () => {
  it('reads labor_rates for that company, default first', () => {
    expect(src).toMatch(/labor_rates\?select=id,name,rate_per_hour,is_default,active&company_id=eq\.\$\{companyId\}/)
    expect(src).toMatch(/active=eq\.true/)
    expect(src).toMatch(/order=is_default\.desc,id/)
  })

  it('no rate, or a zero rate, is null rather than a fallback figure', () => {
    expect(src).toMatch(/return row && rate > 0 \? \{/)
    expect(src).toMatch(/: null/)
    expect(src).not.toMatch(/rate_per_hour \|\| \d/)
  })
})
