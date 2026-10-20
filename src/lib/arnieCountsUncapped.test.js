// A count a person reads must be the TRUE count, not the page size.
// Cole's daily refresh said "200 stale quotes" (there were 931) and "50
// approved estimates not yet jobs" (there were 157) because those were the
// limit= on a single read (2026-10-14).
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { readAllRecords } from '../../supabase/functions/_shared/arnieRest.ts'

const src = (f) => readFileSync(new URL(`../../supabase/functions/_shared/${f}`, import.meta.url), 'utf8')

afterEach(() => vi.unstubAllGlobals())

describe('readAllRecords', () => {
  it('pages past the 1000-row server cap until a short page', async () => {
    const ranges = []
    vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
      const range = init.headers.Range
      ranges.push(range)
      const from = Number(range.split('-')[0])
      const n = Math.max(0, Math.min(1000, 2345 - from))
      return { ok: true, status: 206, json: async () => Array.from({ length: n }, (_, i) => ({ id: from + i })) }
    }))
    const rows = await readAllRecords({ url: 'https://x', key: 'k' }, 'quotes?select=id')
    expect(rows).toHaveLength(2345)
    expect(ranges).toEqual(['0-999', '1000-1999', '2000-2999'])
  })

  it('stops on a failed read rather than looping', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })))
    expect(await readAllRecords({ url: 'https://x', key: 'k' }, 'quotes?select=id')).toEqual([])
  })
})

describe('the counts Cole reads are uncapped', () => {
  it('stale quotes in the brief are read in full', () => {
    const line = src('arnieBrief.ts').split('\n').find((l) => l.includes('quotes?select=') && l.includes('approved_date=is.null'))
    expect(line).toMatch(/readAllRecords\(/)
    expect(line).not.toMatch(/limit=/)
  })

  it('approved estimates not yet jobs are read in full', () => {
    const line = src('arnieRefresh.ts').split('\n').find((l) => l.includes('status=eq.Approved&job_id=is.null'))
    expect(line).toMatch(/readAllRecords\(/)
    expect(line).not.toMatch(/limit=/)
  })

  it('an estimate a job points back to counts as converted', () => {
    expect(src('arnieRefresh.ts')).toMatch(/jobs\?select=quote_id/)
  })
})

describe('spec sheets come from JobScout only', () => {
  const chat = readFileSync(new URL('../../supabase/functions/arnie-chat/index.ts', import.meta.url), 'utf8')
  it('query_products hands back the spec sheet JobScout holds, own or a bundle component\'s', () => {
    expect(chat).toMatch(/async function specSheetsFor\(companyId: number, ids: number\[\]\)/)
    expect(chat).toMatch(/p\.spec_sheet = sheets\[String\(p\.id\)\] \|\| null/)
    expect(chat).toMatch(/product_components\?select=parent_product_id,component_product_id/)
  })
  it('the playbook tells her never to send them to a supplier or the internet', () => {
    expect(chat).toMatch(/Spec sheets come from JobScout ONLY/)
    expect(chat).toMatch(/Never point them to the manufacturer, a supplier or the internet/)
  })
})

describe('a reply that calls a tool mid-way reads as two paragraphs', () => {
  const chat = readFileSync(new URL('../../supabase/functions/arnie-chat/index.ts', import.meta.url), 'utf8')
  it('a new round\'s first streamed words start a new paragraph', () => {
    expect(chat).toMatch(/let roundShown = false/)
    expect(chat).toMatch(/send\('text', \{ delta: \(shownAny && !roundShown \? '\\n\\n' : ''\) \+ evt\.delta\.text \}\)/)
  })
})

describe('fixture identification', () => {
  const chat = readFileSync(new URL('../../supabase/functions/arnie-chat/index.ts', import.meta.url), 'utf8')
  it('an existing LED fixture is not swapped for another LED (Cole photo test, 2026-10-19)', () => {
    expect(chat).toMatch(/A fixture that is already LED has nothing to retrofit and no rebate/)
  })
})

describe('what would we put up — the playbook answers, read-only', () => {
  const chat = readFileSync(new URL('../../supabase/functions/arnie-chat/index.ts', import.meta.url), 'utf8')
  it('query_lighting_swap is a tool and runs the same planner the quote card uses', () => {
    expect(chat).toMatch(/name: 'query_lighting_swap'/)
    const body = chat.slice(chat.indexOf("if (name === 'query_lighting_swap')"), chat.indexOf("if (name === 'analyse_fixture_photo')"))
    expect(body).toMatch(/parseTakeoff\(input\.takeoff, pb\)/)
    expect(body).toMatch(/planEstimate\(items, catalog/)
    expect(body).not.toMatch(/method: 'POST'|PATCH|DELETE/)
  })
  it('the playbook sends swap questions to it', () => {
    expect(chat).toMatch(/call query_lighting_swap and name the product it returns/)
  })
})

describe('London, 2026-10-20: "how many jobs in Arizona" and a misspelt screenshot', () => {
  const chat = readFileSync(new URL('../../supabase/functions/arnie-chat/index.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  it('query_jobs can filter by state, address and still-open', () => {
    expect(chat).toMatch(/state: \{ type: 'string', description: 'Only jobs in this state/)
    expect(chat).toMatch(/open_only: \{ type: 'boolean'/)
    expect(chat).toMatch(/String\(s\?\.category \|\| ''\)\.toLowerCase\(\) === 'open'/)
    expect(chat).toContain('job_title.imatch.^${code}\\\\s)')
  })
  it('a misspelt computer ask is still a computer ask', () => {
    const src = chat.match(/const COMPUTER_ASK = (\/.*\/i)\n/)[1]
    const re = new Function(`return ${src}`)()
    for (const t of ['take a screenshto fo whats infront', 'screen shot please', 'what is in front']) expect(re.test(t), t).toBe(true)
    for (const t of ['how many jobs in arizona', 'the screen door job']) expect(re.test(t), t).toBe(false)
  })
  it('after a caught claim of computer work they asked for, the retry must USE the tool, once', () => {
    expect(chat).toMatch(/forceComputer \? \{ tool_choice: \{ type: 'tool', name: 'use_my_computer' \} \}/)
    expect((chat.match(/forceComputer = claim === 'computer' && computerAsk/g) || []).length).toBe(2)
    expect(chat).toMatch(/forceComputer = false \/\/ one forced round, never more/)
  })
})

describe('job counts and dollars come totalled from the tool', () => {
  const chat = readFileSync(new URL('../../supabase/functions/arnie-chat/index.ts', import.meta.url), 'utf8')
  it('a place or open-only question is grouped by status and carries the grand total', () => {
    expect(chat).toMatch(/const filtered = !!\(input\.state \|\| input\.open_only \|\| input\.address_contains\)/)
    expect(chat).toMatch(/out\.total_job_total = Math\.round\(got\.rows\.reduce/)
  })
})

describe('a promise to act on their computer is kept, once', () => {
  const chat = readFileSync(new URL('../../supabase/functions/arnie-chat/index.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  const re = new Function(`return ${chat.match(/const PROMISE_TO_ACT = (\/.*\/i)\n/)[1]}`)()
  it('"Let me do it now:" at the end of a reply is a promise; an ordinary sign-off is not', () => {
    expect(re.test("I didn't actually send anything to your machine yet. Let me do it now:")).toBe(true)
    expect(re.test("I'll grab that screenshot now")).toBe(true)
    expect(re.test('Let me know if you want more.')).toBe(false)
    expect(re.test('Want me to check another state?')).toBe(false)
  })
  it('a promise with no computer tool used forces one more round that must use it', () => {
    expect(chat).toMatch(/if \(computerAsk && !promisedOnce && !used\.has\('use_my_computer'\) && PROMISE_TO_ACT\.test\(text\)\) \{\n\s+promisedOnce = true[\s\S]{0,900}forceComputer = true\n\s+continue/)
  })
})
