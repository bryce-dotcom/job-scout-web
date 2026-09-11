import { describe, it, expect } from 'vitest'
import { findSimilarLeads, describeMatch, editDistance, squash } from './leadDuplicates'

// The real pair. Tracy's lead, then the rep's duplicate ninety minutes later.
const NOW = new Date('2026-09-09T18:22:00Z').getTime()
const tracys = {
  id: 4178, customer_name: 'Annette, Ben, or Rowe', business_name: 'Halifax Flooring',
  phone: '(801) 555-0142', email: 'ben@halifaxflooring.com', status: 'Appointment Set',
  created_at: '2026-09-09T16:55:00Z',
}
const others = [
  { id: 1, customer_name: 'Intermountain Concrete', business_name: null, status: 'New', created_at: '2026-09-01T00:00:00Z' },
  { id: 2, customer_name: 'Halifax Flooring', business_name: null, status: 'Lost', created_at: '2025-03-01T00:00:00Z' },
  { id: 3, customer_name: 'Upark Well Sell', business_name: null, phone: '480-555-0199', status: 'Won', created_at: '2026-08-01T00:00:00Z' },
]
const leads = [tracys, ...others]

describe('the Halifax duplicate is caught', () => {
  it('"Haliflax flooring " with a trailing space finds Halifax Flooring', () => {
    const m = findSimilarLeads({ customer_name: 'Haliflax flooring ' }, leads, { now: NOW })
    expect(m[0]?.lead.id).toBe(4178)
    expect(describeMatch(m[0])).toBe('one or two letters off')
  })

  it('exact name, any case or punctuation', () => {
    for (const name of ['HALIFAX-FLOORING', 'halifax flooring', 'Halifax  Flooring']) {
      const m = findSimilarLeads({ customer_name: name }, leads, { now: NOW })
      expect(m[0]?.lead.id, name).toBe(4178)
      expect(m[0].reasons[0].detail).toBe('same name')
    }
  })

  it('a longer form of the same name — "Halifax Flooring LLC"', () => {
    const m = findSimilarLeads({ business_name: 'Halifax Flooring LLC' }, leads, { now: NOW })
    expect(m[0]?.lead.id).toBe(4178)
  })

  it('the phone number alone is enough, whatever the name says', () => {
    const m = findSimilarLeads({ customer_name: 'Ben', phone: '8015550142' }, leads, { now: NOW })
    expect(m[0]?.lead.id).toBe(4178)
    expect(describeMatch(m[0])).toBe('same phone number')
  })

  it('two signals stack and outrank one', () => {
    const m = findSimilarLeads({ customer_name: 'Haliflax Flooring', phone: '801-555-0142' }, leads, { now: NOW })
    expect(m[0].score).toBe(90)
    expect(describeMatch(m[0])).toBe('one or two letters off · same phone number')
  })
})

describe('what is NOT a duplicate', () => {
  it('a lead that was lost last year does not count — new business is new business', () => {
    const m = findSimilarLeads({ customer_name: 'Halifax Flooring' }, others, { now: NOW })
    expect(m).toEqual([])
  })

  it('a genuinely different company is not flagged', () => {
    expect(findSimilarLeads({ customer_name: 'Halifax Roofing' }, leads, { now: NOW }).map(m => m.lead.id)).not.toContain(4178)
    expect(findSimilarLeads({ customer_name: 'Hal' }, leads, { now: NOW })).toEqual([])
  })

  it('does not match a lead against itself when editing', () => {
    expect(findSimilarLeads({ customer_name: 'Halifax Flooring' }, leads, { now: NOW, excludeId: 4178 })).toEqual([])
  })

  it('short names get one letter of tolerance, not two', () => {
    const short = [{ id: 9, customer_name: 'Acme Co', status: 'New', created_at: '2026-09-01T00:00:00Z' }]
    expect(findSimilarLeads({ customer_name: 'Acme Cx' }, short, { now: NOW })).toHaveLength(1)   // 1 off
    expect(findSimilarLeads({ customer_name: 'Acne Cx' }, short, { now: NOW })).toHaveLength(0)   // 2 off
  })
})

describe('the pieces', () => {
  it('squash', () => {
    expect(squash('Haliflax flooring ')).toBe('haliflaxflooring')
    expect(squash('LED High Bay 150W')).toBe('ledhighbay150w')
  })
  it('editDistance with early exit', () => {
    expect(editDistance('halifaxflooring', 'haliflaxflooring')).toBe(1)
    expect(editDistance('kitten', 'sitting')).toBe(3)
    expect(editDistance('kitten', 'sitting', 1)).toBe(2) // gave up at max+1
  })
})
