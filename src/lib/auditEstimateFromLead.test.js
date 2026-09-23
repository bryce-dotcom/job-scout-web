import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const leadDetail = readFileSync(resolve(here, '../pages/LeadDetail.jsx'), 'utf8').replace(/\r\n/g, '\n')
const handler = leadDetail.slice(
  leadDetail.indexOf('const handleCreateQuoteFromAudit'),
  leadDetail.indexOf('// Open estimate creation modal'),
)

// Noah (58022884): "it has the product lines in the audit but won't transfer
// over to the estimate". The audit had four areas in the table; this handler
// read them out of the Zustand store, which nothing on the lead page fetches,
// so the line loop was skipped and the estimate arrived with a headline total
// and nothing under it. Three times in one hour, on one audit.

describe('creating an estimate from an audit on the lead page', () => {
  it('reads the areas from the database, never from the store', () => {
    expect(handler).toMatch(/from\('audit_areas'\)/)
    expect(handler).toMatch(/\.eq\('audit_id', audit\.id\)/)
    expect(handler).not.toMatch(/useStore\.getState\(\)\.auditAreas/)
  })

  it('refuses to make an estimate out of an audit with no areas', () => {
    expect(handler).toMatch(/areas\.length === 0/)
    expect(handler).toMatch(/nothing to put on an estimate/)
  })

  it('writes through the shared intake contract, not its own two inserts', () => {
    // The contract rolls the header back when the lines do not land, so a
    // quote can never again exist with a total and no work under it.
    expect(handler).toMatch(/createEstimateFromIntake\(supabase, \{/)
    expect(handler).not.toMatch(/createQuoteLine\(/)
    expect(handler).not.toMatch(/await createQuote\(/)
  })

  it('prices the areas with the one shared rule', () => {
    expect(handler).toMatch(/auditAreasToIntakeLines\(areas, \{ quoteAmount \}\)/)
  })

  it('leaves the lead Qualified — nothing has been sent to anyone', () => {
    expect(handler).toMatch(/advanceLeadTo: 'Qualified'/)
  })

  it('navigates to the real estimate id, not a temp one from the offline queue', () => {
    expect(handler).toMatch(/navigate\(`\/estimates\/\$\{quote\.id\}`\)/)
    expect(handler).not.toMatch(/quoteTempId/)
  })
})
