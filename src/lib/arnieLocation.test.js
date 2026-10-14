// Asking for a GPS fix, and when not to.
//
// Bryce: "Arnie use my location to find the customer/business name and adress
// phone number and any other relevant info about the location im at".
//
// The risk in this feature is not the lookup, it is the permission prompt. A
// prompt that appears for no visible reason gets denied, and a denied
// geolocation permission is genuinely awkward for a non-technical person to
// undo in a browser. So the fix is only taken when the message is about where
// they are standing — and the test that matters most is the one that proves
// ordinary questions do NOT trigger it.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { asksAboutHere } from './arnieLocation'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, '..', p), 'utf8').replace(/\r\n/g, '\n')

describe('when to ask for a position', () => {
  it('asks when they mean where they are standing', () => {
    for (const q of [
      'use my location to find this business',
      'where am I?',
      'who is this building?',
      "what's this place called?",
      'am I at a customer right now',
      'use my location',
      'what is my current location',
      "what's around me?",
    ]) expect(asksAboutHere(q), q).toBe(true)
  })

  it('does NOT ask for ordinary questions', () => {
    // Every one of these raising a location prompt is how the feature gets
    // switched off for good.
    for (const q of [
      'how many overdue invoices?',
      'what did we make last month',
      'book Halifax for Tuesday at 2',
      'clock me in',
      'who is on the Drinkle job',
      'how many highbays do we have',
      'sing me a song',
    ]) expect(asksAboutHere(q), q).toBe(false)
  })

  it('does not confuse a record’s location with the person’s', () => {
    // "the location of the Halifax job" is a question about data. Taking a
    // GPS fix to answer it would be absurd — and would prompt.
    for (const q of [
      'what is the location of the Halifax job',
      'change the location on that appointment',
      'what location is the stock in',
    ]) expect(asksAboutHere(q), q).toBe(false)
  })

  it('ignores empty and rubbish input', () => {
    expect(asksAboutHere('')).toBe(false)
    expect(asksAboutHere(null)).toBe(false)
    expect(asksAboutHere(undefined)).toBe(false)
  })
})

describe('the position itself', () => {
  const src = read('lib/arnieLocation.js')

  it('a refusal or a timeout returns nothing, never a guess', () => {
    // Guessing from the company address would put a rep on the phone to the
    // wrong business, confidently.
    expect(src).toMatch(/done\(null\)/)
    expect(src).not.toMatch(/company_?[Aa]ddress|fallbackCoords|DEFAULT_LAT/)
  })

  it('cannot hang the message if the browser never calls back', () => {
    expect(src).toMatch(/setTimeout\(\(\) => done\(null\), timeout \+ 1500\)/)
  })

  it('carries accuracy, so a phone fix is not stated as a certainty', () => {
    expect(src).toMatch(/accuracy: Number\.isFinite\(c\.accuracy\)/)
  })

  it('only sent when there is something to send', () => {
    const engine = read('pages/agents/arnie/arnieEngine.js')
    // Since 2026-10-14 also when a quote is started on site (Cole's flow) —
    // see wantsLocationNow, which still begins with asksAboutHere.
    expect(engine).toMatch(/wantsLocationNow\(message, history\) \? await getPosition\(\) : null/)
    expect(engine).toMatch(/\.\.\.\(coords \? \{ coords \} : \{\}\)/)
  })
})

describe('the server side', () => {
  const places = readFileSync(resolve(here, '../../supabase/functions/_shared/places.ts'), 'utf8')
  const chat = readFileSync(resolve(here, '../../supabase/functions/arnie-chat/index.ts'), 'utf8')

  it('the model cannot supply a position', () => {
    // A model that can pass coordinates can invent them, and an invented
    // position returns a real business with a real phone number for a place
    // the rep has never been. The only tool argument is the radius.
    // Comments stripped first — the comment above the definition explains
    // exactly this and would otherwise be what the assertion reads.
    const def = chat.slice(chat.indexOf("name: 'where_i_am'"), chat.indexOf("name: 'query_customers'"))
      .replace(/\/\/[^\n]*/g, '')
    expect(def).toMatch(/radius_m/)
    expect(def).not.toMatch(/\blat\b|\blng\b|latitude|longitude/)
  })

  it('rubbish coordinates are refused rather than looked up', () => {
    expect(chat).toMatch(/validCoords\(Number\(rawC\.lat\), Number\(rawC\.lng\)\)/)
  })

  it('a swapped or stale fix does not pass validation', () => {
    expect(places).toMatch(/!\(lat === 0 && lng === 0\)/)
    expect(places).toMatch(/Math\.abs\(lat\) <= 90 && Math\.abs\(lng\) <= 180/)
  })

  it('the customer cross-check stays inside the caller’s company', () => {
    // The position comes from the body; the tenant never does.
    const tool = chat.slice(chat.indexOf("if (name === 'where_i_am')"), chat.indexOf("if (name === 'use_my_computer')"))
    expect(tool).toMatch(/company_id=eq\.\$\{companyId\}/)
    expect(tool).not.toMatch(/body\.compan/i)
  })

  it('matches a business on a distinctive word, not on "the" or "LLC"', () => {
    expect(places).toMatch(/NOISE = new Set\(/)
    expect(places).toMatch(/return null/)
  })
})

describe('the customer cross-check', () => {
  const chat = readFileSync(resolve(here, '../../supabase/functions/arnie-chat/index.ts'), 'utf8')
  const tool = chat.slice(chat.indexOf("if (name === 'where_i_am')"), chat.indexOf("if (name === 'use_my_computer')"))

  it('uses columns that exist', () => {
    // Checked against the live database, not the schema doc. The first cut
    // asked for customers.city and leads.name; neither exists, both queries
    // 400'd, and the 400 was swallowed — so Arnie told me a customer sitting
    // right there was not a customer.
    expect(tool).toMatch(/customers\?select=id,name,business_name,phone,address,status/)
    expect(tool).toMatch(/leads\?select=id,customer_name,business_name,phone,address,status/)
    expect(tool).not.toMatch(/customers\?select=[^&]*\bcity\b/)
    expect(tool).not.toMatch(/leads\?select=id,name\b/)
  })

  it('matches the trading name as well as the contact name', () => {
    // A Google listing is a business; customers.name is often a person.
    expect(tool).toMatch(/orFor\(\['name', 'business_name'\]\)/)
    expect(tool).toMatch(/orFor\(\['customer_name', 'business_name'\]\)/)
  })

  it('a failed lookup is reported, never returned as "no match"', () => {
    // The whole bug in one line: `known = cRes.ok ? await cRes.json() : []`
    // turns a broken query into a confident wrong answer.
    expect(tool).toMatch(/lookup_failed/)
    expect(tool).toMatch(/lookupFailed = /)
    expect(tool).not.toMatch(/known = cRes\.ok \? await cRes\.json\(\) : \[\]/)
  })
})
