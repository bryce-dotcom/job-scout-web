import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { wantsLocationNow } from './arnieLocation'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const quote = read('../../supabase/functions/_shared/arnieQuote.ts')
const chat = read('../../supabase/functions/arnie-chat/index.ts')

describe("Cole's flow: the location goes with the moments that need it", () => {
  it('"Jenny, create a new quote" carries the position', () => {
    expect(wantsLocationNow('Jenny, create a new quote')).toBe(true)
    expect(wantsLocationNow('start a takeoff')).toBe(true)
  })
  it('so does the business name, when she has just asked for it', () => {
    const history = [{ role: 'user', content: 'create a new quote' }, { role: 'assistant', content: "Sure — what's the business name?" }]
    expect(wantsLocationNow('Desert Ridge Dental', history)).toBe(true)
  })
  it('and an ordinary question does not', () => {
    expect(wantsLocationNow('how many overdue invoices do we have')).toBe(false)
    expect(wantsLocationNow('Desert Ridge Dental', [{ role: 'assistant', content: 'You have 3 open jobs.' }])).toBe(false)
  })
})

describe('the quote card builds a takeoff to the playbook', () => {
  it('a takeoff goes to the playbook path, never the free-text lines path', () => {
    expect(quote).toMatch(/if \(f\.takeoff\) return prepareTakeoffQuote\(r, caller, f\)/)
    expect(quote).toMatch(/planEstimate\(items, catalog, \{ rebateGiven:/)
  })
  it('only the playbook section of the catalogue is read', () => {
    expect(quote).toMatch(/&type=eq\.\$\{encodeURIComponent\(playbook\.catalog_type\)\}/)
  })
  it('business unit, incentive and Draft come from the plan; nothing is sent', () => {
    expect(quote).toMatch(/business_unit: plan\.business_unit/)
    expect(quote).toMatch(/utility_incentive: plan\.incentive/)
    expect(quote).toMatch(/status: 'Draft', lines,\n\s*utility_incentive/)
    expect(quote).toMatch(/advanceLeadTo: null/)
  })
  it('a new business becomes a lead on the same card, and goes again on withdraw', () => {
    expect(quote).toMatch(/new_lead: newLead/)
    expect(quote).toMatch(/intake\.lead_id = createdLeadId/)
    // A failed estimate takes the lead it just made back out.
    expect(quote).toMatch(/if \(createdLeadId\) await fetch\(`\$\{r\.url\}\/rest\/v1\/leads\?id=eq\.\$\{createdLeadId\}/)
    expect(quote).toMatch(/const madeLead = Number\(prop\.payload\?\.created\?\.lead_id\)/)
  })
  it('never an invented phone or address for the new lead', () => {
    expect(quote).toMatch(/phone: f\.phone \? String\(f\.phone\)/)
    expect(quote).toMatch(/address: address \|\| null/)
  })
  it('the playbook instructions reach Arnie only where a playbook is set', () => {
    expect(chat).toMatch(/\+ await playbookBlock\(companyId\)/)
    expect(chat).toMatch(/const pb = playbookFor\(row\?\.value\)\n\s*if \(!pb\) return ''/)
  })
})
