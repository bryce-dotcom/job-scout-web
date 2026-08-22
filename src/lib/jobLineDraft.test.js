import { describe, it, expect } from 'vitest'
import { draftToJobLine, draftHasContent } from './jobLineDraft'

const PRODUCTS = [{ id: 7, name: 'SMBE 9W 4FT T8 Type B Tube', unit_price: 42.38 }]
const empty = { item_id: '', description: '', price: '', quantity: 1 }

// Christopher: "I have been hitting the add job button thinking all of the info
// is saved." The draft row was only ever read by the small Add button, so a
// typed line went in the bin on save and the job was created without the work.
describe('a line you typed is a line you meant', () => {
  it('keeps a typed custom line', () => {
    expect(draftToJobLine({ ...empty, description: 'Replace ballast', price: '85', quantity: 2 }))
      .toEqual({ item_id: null, description: 'Replace ballast', price: 85, quantity: 2 })
  })

  it('keeps a catalogue line and takes its name and price', () => {
    expect(draftToJobLine({ ...empty, item_id: 7 }, PRODUCTS))
      .toEqual({ item_id: 7, description: 'SMBE 9W 4FT T8 Type B Tube', price: 42.38, quantity: 1 })
  })

  it('lets a typed price beat the catalogue price', () => {
    expect(draftToJobLine({ ...empty, item_id: 7, price: '30' }, PRODUCTS).price).toBe(30)
  })

  it('treats a blank quantity as one, because that is what the field shows', () => {
    expect(draftToJobLine({ ...empty, description: 'Trip charge', quantity: '' }).quantity).toBe(1)
  })
})

describe('an untouched draft must not become a phantom line', () => {
  it('returns nothing for an empty draft', () => {
    expect(draftToJobLine(empty)).toBeNull()
    expect(draftToJobLine(null)).toBeNull()
    expect(draftToJobLine({})).toBeNull()
  })

  it('ignores whitespace typed into the description', () => {
    expect(draftToJobLine({ ...empty, description: '   ' })).toBeNull()
  })
})

// These are the drafts that would still disappear silently, so the dialog
// blocks and says why rather than saving without them.
describe('a draft that cannot become a line is flagged, not dropped', () => {
  it('rejects zero and negative quantities', () => {
    expect(draftToJobLine({ ...empty, description: 'Ballast', quantity: 0 })).toBeNull()
    expect(draftToJobLine({ ...empty, description: 'Ballast', quantity: -3 })).toBeNull()
  })

  it('rejects a quantity that is not a number', () => {
    expect(draftToJobLine({ ...empty, description: 'Ballast', quantity: 'two' })).toBeNull()
  })

  it('draftHasContent separates "nothing typed" from "typed but unusable"', () => {
    expect(draftHasContent(empty)).toBe(false)
    expect(draftHasContent(null)).toBe(false)
    expect(draftHasContent({ ...empty, description: '  ' })).toBe(false)
    expect(draftHasContent({ ...empty, description: 'Ballast', quantity: 0 })).toBe(true)
    expect(draftHasContent({ ...empty, item_id: 7 })).toBe(true)
  })
})
