import { describe, it, expect } from 'vitest'
import {
  estimateLink, descriptionChanged, descriptionValue, propagateWarning, savePlan,
} from './lineDescription'

const line = (over = {}) => ({ id: 7, description: 'Office · 96W T8 → 40W LED', ...over })

describe('is there an estimate to write back to', () => {
  it('no, when the line never came from one', () => {
    // The ordinary case: only 98 of HHH's 7,172 jobs carry a quote_id.
    expect(estimateLink(line(), null)).toBe(null)
    expect(estimateLink(line({ quote_line_id: null }), { id: 5 })).toBe(null)
  })

  it('yes, when the link and the estimate line agree', () => {
    expect(estimateLink(line({ quote_line_id: 5 }), { id: 5, quote_id: 42 }))
      .toEqual({ quoteLineId: 5, quoteId: 42 })
  })

  it('no, when the estimate line is gone or is a different one', () => {
    // Re-costing an estimate deletes and rebuilds its lines, so a link can
    // outlive its target. Writing to whatever is there now is how you edit a
    // stranger's line.
    expect(estimateLink(line({ quote_line_id: 5 }), null)).toBe(null)
    expect(estimateLink(line({ quote_line_id: 5 }), { id: 9 })).toBe(null)
  })
})

describe('what counts as an edit', () => {
  it('ignores whitespace-only differences', () => {
    expect(descriptionChanged('Office', '  Office  ')).toBe(false)
    expect(descriptionChanged(null, '   ')).toBe(false)
  })

  it('sees a real change', () => {
    expect(descriptionChanged('Office', 'Warehouse')).toBe(true)
    expect(descriptionChanged(null, 'Office')).toBe(true)
  })

  it('stores blank as null, not an empty string', () => {
    expect(descriptionValue('   ')).toBe(null)
    expect(descriptionValue('')).toBe(null)
    expect(descriptionValue('  Office  ')).toBe('Office')
  })
})

describe('the warning uses the company word', () => {
  it('says estimate by default', () => {
    expect(propagateWarning().title).toMatch(/estimate/)
  })

  it('says bid or proposal when that is what they call it', () => {
    // lib/documentVocabulary is the rule for the customer-facing word.
    const w = propagateWarning({ documentWord: 'bid', reference: 'Q-1042' })
    expect(w.title).toBe('Change this on bid Q-1042 too?')
    expect(w.body).toMatch(/bid Q-1042/)
    expect(w.body).not.toMatch(/estimate/)
  })

  it('offers both choices plainly', () => {
    const w = propagateWarning()
    expect(w.confirm).toBe('Change both')
    expect(w.decline).toBe('Only on this job')
  })
})

describe('what a save actually writes', () => {
  const link = { quoteLineId: 5, quoteId: 42 }

  it('writes nothing when nothing changed', () => {
    expect(savePlan({ line: line(), text: 'Office · 96W T8 → 40W LED', link, alsoEstimate: true }))
      .toEqual({ writes: [], reason: 'unchanged' })
  })

  it('writes the job line alone when there is no estimate behind it', () => {
    const p = savePlan({ line: line(), text: 'Warehouse', link: null, alsoEstimate: true })
    expect(p.reason).toBe('no-link')
    expect(p.writes).toEqual([{ table: 'job_lines', id: 7, description: 'Warehouse' }])
  })

  it('writes the job line alone when they decline', () => {
    const p = savePlan({ line: line(), text: 'Warehouse', link, alsoEstimate: false })
    expect(p.reason).toBe('job-only')
    expect(p.writes).toHaveLength(1)
    expect(p.writes[0].table).toBe('job_lines')
  })

  it('writes both only when they agreed', () => {
    const p = savePlan({ line: line(), text: 'Warehouse', link, alsoEstimate: true })
    expect(p.reason).toBe('both')
    expect(p.writes).toEqual([
      { table: 'job_lines', id: 7, description: 'Warehouse' },
      { table: 'quote_lines', id: 5, description: 'Warehouse' },
    ])
  })

  it('never writes the estimate without writing the job', () => {
    // The job is what the crew works from; it must never be the one left behind.
    for (const also of [true, false]) {
      const p = savePlan({ line: line(), text: 'Warehouse', link, alsoEstimate: also })
      expect(p.writes[0].table).toBe('job_lines')
    }
  })
})
