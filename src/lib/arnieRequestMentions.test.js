import { describe, it, expect } from 'vitest'
import { mentionedInRequest } from '../../supabase/functions/_shared/requestMentions.ts'

// The case that produced this guard, from a live probe against production:
// lead_sources held exactly one entry, "Alayda Wendel". An admin wrote that
// they had stopped taking work from Angi and wanted it gone as a lead source.
// The model had one candidate and a removal to perform, so it proposed
// deleting Alayda Wendel. The diff was valid, the summary read plausibly, and
// approving it would have destroyed the company's only lead source.
describe('refusing a destructive change nobody asked for', () => {
  it('rejects the item the model substituted for one that was never there', () => {
    expect(mentionedInRequest(
      'Alayda Wendel',
      'we stopped taking work from Angi — get rid of that as a place leads come from',
    )).toBe(false)
  })

  it('rejects the only-item-in-the-list reflex generally', () => {
    // A list of one is where this fails hardest: there is always something to
    // pick, so the model always has an answer.
    expect(mentionedInRequest('Referral', 'drop the yelp source')).toBe(false)
    expect(mentionedInRequest('Commercial', 'remove the residential unit')).toBe(false)
  })
})

describe('still allowing the ways people actually talk', () => {
  it('accepts an exact name', () => {
    expect(mentionedInRequest('Trade Show', 'add a lead source called Trade Show')).toBe(true)
  })

  it('accepts a partial or abbreviated reference', () => {
    // Blocking these would make the guard worse than the bug — admins do not
    // retype a long catalogue name to delete it.
    expect(mentionedInRequest('ROI / Payback Analysis Document', 'remove the ROI doc')).toBe(true)
    expect(mentionedInRequest('Facility Lighting Audit', 'get rid of the lighting audit upsell')).toBe(true)
  })

  it('ignores case, punctuation and word order', () => {
    expect(mentionedInRequest('Trade Show', 'kill off TRADE-SHOW please')).toBe(true)
    expect(mentionedInRequest('Angi', "we're done with angi's leads")).toBe(true)
  })

  it('does not match on filler words alone', () => {
    // "the" and "from" appearing in both strings is not evidence of anything.
    expect(mentionedInRequest('The New Co', 'remove that source from the list')).toBe(false)
  })

  it('falls back to the whole string when nothing distinctive remains', () => {
    // A two-letter name has no token long enough to test, so it has to match
    // outright rather than be waved through on no evidence.
    expect(mentionedInRequest('AZ', 'remove the AZ business unit')).toBe(true)
    expect(mentionedInRequest('AZ', 'remove the Utah business unit')).toBe(false)
  })

  it('treats empty input as no evidence', () => {
    expect(mentionedInRequest('', 'remove something')).toBe(false)
    expect(mentionedInRequest('Trade Show', '')).toBe(false)
  })
})
