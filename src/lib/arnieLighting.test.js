// Arnie handing lighting work to Lenard.
//
// A rep's own bot did "identify the fixture, pick the LED, price it to the
// incentive" — all of which JobScout already had, behind Lenard's own page. If
// Arnie is where people work, the specialist is something he CALLS. These tests
// hold the two rules that make that safe: he asks Lenard rather than
// reimplementing it, and lighting is priced off the shelf the company chose.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformSync } from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const src = read('../../supabase/functions/_shared/arnieLighting.ts')
const chat = read('../../supabase/functions/arnie-chat/index.ts')
const products = read('../../supabase/functions/lenard-products/index.ts')

const mod = (() => {
  const m = { exports: {} }
  new Function('module', 'exports', 'require', transformSync(src, { loader: 'ts', format: 'cjs' }).code)(m, m.exports, () => ({ readRecordList: async () => [] }))
  return m.exports
})()

describe('Arnie asks the specialist; he does not become it', () => {
  it('the photo goes to lenard-analyze rather than to a second fixture prompt', () => {
    expect(src).toMatch(/functions\/v1\/lenard-analyze/)
    expect(src).not.toMatch(/callAnthropic|claude-|max_tokens/)
  })

  it('it carries the caller, so Lenard learns from THIS company’s corrections', () => {
    expect(src).toMatch(/as_employee_id: caller\.employeeId/)
  })

  it('says what it is and is not — identification, not a quote', () => {
    // The module says it in the answer it returns; the tool description says
    // it to the model (asserted further down).
    expect(src).toMatch(/not a quote/)
    expect(src).toMatch(/Quantities are what is visible in THIS photo/)
  })

  it('tells the user when the photo was not lighting at all', () => {
    expect(src).toMatch(/not_lighting/)
  })

  it('refuses plainly when there is no photo', () => {
    expect(src).toMatch(/There is no photo on this message for me to look at/)
  })
})

describe('lighting is priced off the shelf the company chose', () => {
  it('reads the same setting Lenard reads', () => {
    expect(src).toMatch(/key=eq\.lenard_product_sections/)
    expect(products).toMatch(/const SETTING_KEY = 'lenard_product_sections'/)
  })

  it('filters on type, with the quoting a bracketed section name needs', () => {
    // "Electrical Services (Bundles)" — a bare in.() would break on the comma
    // and the brackets, and silently return the wrong shelf.
    expect(src).toContain('&type=in.(')
    expect(src).toContain("s.replace(/\"/g")
    expect(src).toContain('One rule for')
  })

  it('and says so when a company has not chosen one yet', () => {
    expect(src).toMatch(/No lighting sections are configured for Lenard yet/)
    expect(src).toMatch(/Set them on the Lenard page/)
  })

  it('active products only — a deactivated one cannot be honoured', () => {
    expect(src).toMatch(/active=eq\.true/)
  })
})

describe('the photo comes off the conversation, not the tool call', () => {
  it('execTool is handed the messages rather than reaching for a global', () => {
    // A request-scoped global in a shared isolate works until two people text
    // at once.
    expect(chat).toMatch(/async function execTool\(name: string, input: any, caller: Caller, messages: any\[\] = \[\]\)/)
    expect(chat).toMatch(/exec: \(name: string, input: any\) => execTool\(name, input, caller, messages\)/)
    expect(chat).toMatch(/function agentSetup\(agent: Agent, caller: Caller, cards: string\[\], messages: any\[\] = \[\]\)/)
  })

  it('both turn runners pass their conversation in', () => {
    expect(chat.split('agentSetup(agent, caller, cards, messages)').length - 1).toBe(2)
  })

  it('the newest image wins, because "what is this" means the one just sent', () => {
    const fn = chat.slice(chat.indexOf('function lastImageOf'), chat.indexOf('async function execTool'))
    expect(fn).toMatch(/for \(let i = messages\.length - 1; i >= 0; i--\)/)
    expect(fn).toMatch(/for \(let j = content\.length - 1; j >= 0; j--\)/)
    expect(fn).toMatch(/block\?\.type === 'image' && src\?\.type === 'base64'/)
  })
})

describe('the tools Arnie is told about', () => {
  it('both are declared', () => {
    expect(chat).toMatch(/name: 'query_lighting_products'/)
    expect(chat).toMatch(/name: 'analyse_fixture_photo'/)
  })

  it('the photo tool says it takes no arguments, since the picture is on the turn', () => {
    const decl = chat.slice(chat.indexOf("name: 'analyse_fixture_photo'"), chat.indexOf("name: 'query_eos'"))
    expect(decl).toMatch(/no arguments/)
    expect(decl).toMatch(/It identifies; it does not price or quote\./)
  })

  it('the catalogue tool says products come from the configured section only', () => {
    const decl = chat.slice(chat.indexOf("name: 'query_lighting_products'"), chat.indexOf("name: 'analyse_fixture_photo'"))
    expect(decl).toMatch(/never from a name search/)
  })
})
