import { describe, it, expect } from 'vitest'
import {
  glassAreaOrderQty, glassAreaHasPrice, unpricedGlassAreas,
  glassAreaToIntakeLine, glassAreasToIntakeLines, glassAreasTotal,
} from './glassAreaLine'

// The tenant's own book. These are HHH's real prices, which is the entire
// point: Walter stopped inventing a rate and started selling what is listed.
const RES_INTERIOR = { id: 101, name: 'Residential Interior Windows', unit_price: 3 }
const RES_EXTERIOR = { id: 102, name: 'Residential Exterior Windows', unit_price: 6 }
const POST_CONSTRUCTION = { id: 103, name: 'Post Construction Window Cleaning (More than 6ft wide/high', unit_price: 20 }
const SCREENS = { id: 104, name: 'Screen Cleaning', unit_price: 1 }

const area = (over = {}) => ({
  area_name: 'Great room, south elevation',
  segment: 'residential',
  face: 'out',
  pane_count: 40,
  product_id: RES_EXTERIOR.id,
  product: RES_EXTERIOR,
  ...over,
})

describe('the line is the tenant price times what was counted', () => {
  it('prices 40 panes of residential exterior at the book rate', () => {
    const l = glassAreaToIntakeLine(area())
    expect(l.quantity).toBe(40)
    expect(l.price).toBe(6)
    expect(l.line_total).toBe(240)
  })

  it('charges interior and exterior differently, because they are different products', () => {
    const out = glassAreaToIntakeLine(area({ product: RES_EXTERIOR, product_id: 102 }))
    const inside = glassAreaToIntakeLine(area({ face: 'in', product: RES_INTERIOR, product_id: 101 }))
    expect(out.line_total).toBe(240)
    expect(inside.line_total).toBe(120)
    // Not a faces multiplier on one price — two rows, two products.
    expect(out.item_id).not.toBe(inside.item_id)
  })

  it('names the product, because that is what the customer is buying', () => {
    const l = glassAreaToIntakeLine(area({ product: POST_CONSTRUCTION, product_id: 103 }))
    expect(l.item_name).toBe(POST_CONSTRUCTION.name)
    expect(l.item_id).toBe(103)
  })

  it('carries the product id so the estimate line points at the catalogue', () => {
    expect(glassAreaToIntakeLine(area()).item_id).toBe(102)
    expect(glassAreaToIntakeLine(area({ product_id: null })).item_id).toBe(null)
  })
})

describe('what the area recorded beats what the catalogue says now', () => {
  it('uses the recorded unit price over the product price', () => {
    // The rep discounted on site, or the book moved after the quote went out.
    const l = glassAreaToIntakeLine(area({ unit_price: 5 }))
    expect(l.price).toBe(5)
    expect(l.line_total).toBe(200)
  })

  it('uses the recorded line total over anything it could recompute', () => {
    const l = glassAreaToIntakeLine(area({ unit_price: 5, line_total: 199.5 }))
    expect(l.line_total).toBe(199.5)
  })

  it('falls back to the catalogue only when the area recorded no price', () => {
    expect(glassAreaToIntakeLine(area()).price).toBe(6)
  })
})

describe('quantity is what the product is sold by', () => {
  it('uses the pane count by default', () => {
    expect(glassAreaOrderQty(area())).toBe(40)
  })

  it('uses product_qty when the product is not sold by the pane', () => {
    // Screen Cleaning is $1 a screen, not $1 a pane.
    const l = glassAreaToIntakeLine(area({ product: SCREENS, product_id: 104, screens: 12, product_qty: 12 }))
    expect(l.quantity).toBe(12)
    expect(l.line_total).toBe(12)
  })

  it('treats a zero pane count as zero, not as one', () => {
    expect(glassAreaOrderQty(area({ pane_count: 0 }))).toBe(0)
    expect(glassAreaOrderQty(area({ pane_count: null }))).toBe(0)
  })
})

describe('an area nobody can price says so instead of guessing', () => {
  // The whole reason for the rebuild. HHH has no architectural glass
  // restoration product, so a restoration area has nothing to price against —
  // and the old engine would have answered with a minutes-per-zone rate.
  const nothing = area({ product: null, product_id: null })

  it('knows it has no price', () => {
    expect(glassAreaHasPrice(nothing)).toBe(false)
    expect(glassAreaHasPrice(area())).toBe(true)
  })

  it('still returns a line, at zero, flagged', () => {
    const l = glassAreaToIntakeLine(nothing)
    expect(l.price).toBe(0)
    expect(l.line_total).toBe(0)
    expect(l.unpriced).toBe(true)
  })

  it('does not drop it from the estimate', () => {
    // A $0 line is an argument somebody can have. A missing line is invisible,
    // which is how a mark disappears from a bid without anyone seeing it.
    const lines = glassAreasToIntakeLines([area(), nothing])
    expect(lines).toHaveLength(2)
    expect(lines.filter((l) => l.unpriced)).toHaveLength(1)
  })

  it('reports which areas they are, so a screen can refuse to send', () => {
    const list = unpricedGlassAreas([area(), nothing, area({ unit_price: 4, product: null, product_id: null })])
    expect(list).toHaveLength(1)
    expect(list[0]).toBe(nothing)
  })

  it('counts a recorded price as priced even with no product behind it', () => {
    expect(glassAreaHasPrice(area({ product: null, product_id: null, unit_price: 4 }))).toBe(true)
  })

  it('never invents a rate from pane count alone', () => {
    const l = glassAreaToIntakeLine({ pane_count: 500 })
    expect(l.price).toBe(0)
    expect(l.line_total).toBe(0)
  })
})

describe('the rep’s words and pictures survive', () => {
  it('carries notes and photos', () => {
    const l = glassAreaToIntakeLine(area({ override_notes: '  stucco on the mullions  ', photos: ['a.jpg', null, 'b.jpg'] }))
    expect(l.notes).toBe('stucco on the mullions')
    expect(l.photos).toEqual(['a.jpg', 'b.jpg'])
  })

  it('falls back to the plain notes field', () => {
    expect(glassAreaToIntakeLine(area({ notes: 'north face only' })).notes).toBe('north face only')
  })

  it('reports no notes as null rather than an empty string', () => {
    expect(glassAreaToIntakeLine(area()).notes).toBe(null)
  })
})

describe('a whole takeoff', () => {
  it('totals the areas at their own prices', () => {
    const areas = [
      area({ product: RES_EXTERIOR, product_id: 102, pane_count: 40 }),          // 240
      area({ product: RES_INTERIOR, product_id: 101, pane_count: 40, face: 'in' }), // 120
      area({ product: SCREENS, product_id: 104, product_qty: 12 }),              // 12
    ]
    expect(glassAreasTotal(areas)).toBe(372)
  })

  it('leaves an unpriced area out of the total without hiding it', () => {
    const areas = [area(), area({ product: null, product_id: null })]
    expect(glassAreasTotal(areas)).toBe(240)
    expect(glassAreasToIntakeLines(areas)).toHaveLength(2)
  })

  it('survives nothing at all', () => {
    expect(glassAreasToIntakeLines([])).toEqual([])
    expect(glassAreasToIntakeLines(null)).toEqual([])
    expect(glassAreasTotal(null)).toBe(0)
    expect(unpricedGlassAreas(null)).toEqual([])
  })
})
