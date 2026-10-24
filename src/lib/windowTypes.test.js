import { describe, it, expect } from 'vitest'
import {
  unitPanes, rowPanes, rowExtras, sizeBandFor, rowSizeBand,
  scaleHeight, courseHeight, storeyFor, accessFor, accessWorkKey, describeRow,
} from './windowTypes'

// Rows as the catalogue seeds them, trimmed to what the arithmetic reads.
const DOUBLE_HUNG = { type_code: 'double_hung', type_name: 'Double-hung', panes_per_unit: 2, lites_per_unit: 2, bill_lites: false, typical_width_in: 32, typical_height_in: 60, size_band: 'over_4', screens_per_unit: 1, has_track: true }
const CASEMENT = { type_code: 'casement', type_name: 'Casement', panes_per_unit: 1, lites_per_unit: 1, bill_lites: false, typical_width_in: 24, typical_height_in: 48, size_band: 'under_4', screens_per_unit: 1, has_track: false }
const PICTURE = { type_code: 'picture', type_name: 'Picture / fixed', panes_per_unit: 1, lites_per_unit: 1, bill_lites: false, typical_width_in: 60, typical_height_in: 48, size_band: 'over_4', screens_per_unit: 0, has_track: false }
const COLONIAL = { type_code: 'divided_lite_6', type_name: 'Divided lite sash, 6 over 6', panes_per_unit: 2, lites_per_unit: 12, bill_lites: true, typical_width_in: 32, typical_height_in: 60, size_band: 'over_4', screens_per_unit: 1, has_track: true }
const GRILLE = { type_code: 'grille_insert', type_name: 'Snap-in grille', panes_per_unit: 2, lites_per_unit: 2, bill_lites: false, typical_width_in: 32, typical_height_in: 60, size_band: 'over_4', screens_per_unit: 1, has_track: true }
const FRENCH = { type_code: 'french_door', type_name: 'French door, 15-lite', panes_per_unit: 1, lites_per_unit: 15, bill_lites: true, typical_width_in: 36, typical_height_in: 80, size_band: 'over_6', screens_per_unit: 0, has_track: false }
const BAY = { type_code: 'bay_3', type_name: 'Bay, 3-section', panes_per_unit: 3, lites_per_unit: 3, bill_lites: false, typical_width_in: 96, typical_height_in: 60, size_band: 'over_6', screens_per_unit: 2, has_track: true }

describe('how many panes is that', () => {
  it('counts a double-hung as two panes, because it is two sashes', () => {
    // The single most common miscount in the trade, and the one that halves
    // a bid: "14 windows" at a house of double-hungs is 28 panes.
    expect(unitPanes(DOUBLE_HUNG).billable).toBe(2)
    expect(rowPanes({ units: 14 }, DOUBLE_HUNG).panes).toBe(28)
  })

  it('counts a casement as one pane however tall it is', () => {
    expect(rowPanes({ units: 14 }, CASEMENT).panes).toBe(14)
  })

  it('counts a bay as its sections', () => {
    expect(rowPanes({ units: 2 }, BAY).panes).toBe(6)
  })

  it('bills the lites on true divided glass and says that is what it did', () => {
    const r = rowPanes({ units: 4 }, COLONIAL)
    expect(r.panes).toBe(48)       // 4 windows, 12 lites each
    expect(r.basis).toBe('lites')
  })

  it('bills a snap-in grille as two flat sashes, not twelve lites', () => {
    // These look identical in a photograph and differ by six times. The
    // catalogue carries the difference so a rep is choosing between two named
    // things rather than guessing a multiplier.
    const r = rowPanes({ units: 4 }, GRILLE)
    expect(r.panes).toBe(8)
    expect(r.basis).toBe('panes')
  })

  it('lets the rep bill the sashes of a divided window after all', () => {
    // Storm sashes are off, or the customer only wants the outside wiped.
    expect(rowPanes({ units: 4, count_lites: false }, COLONIAL).panes).toBe(8)
  })

  it('cannot invent lites a window does not have', () => {
    // Asking a grille insert for its lites gives two, because two is all the
    // glass there is. A rep who decides the bars really are true muntins is
    // saying it is a different TYPE, not setting a flag — and changing the
    // type is the one move that gets the twelve.
    expect(rowPanes({ units: 4, count_lites: true }, GRILLE).panes).toBe(8)
    expect(rowPanes({ units: 4 }, COLONIAL).panes).toBe(48)
  })

  it('treats a missing lite count as a plain unit rather than zero', () => {
    // Defaulting lites to 0 would zero out the bid the moment anything asked
    // for lites on a type nobody had filled in.
    const bare = { panes_per_unit: 2 }
    expect(unitPanes(bare, { countLites: true }).billable).toBe(2)
  })

  it('takes a counted pane count over the catalogue', () => {
    // Somebody stood there and counted. That beats an average.
    const r = rowPanes({ pane_count: 37 }, DOUBLE_HUNG)
    expect(r.panes).toBe(37)
    expect(r.basis).toBe('counted')
  })

  it('survives junk', () => {
    expect(rowPanes(null, null).panes).toBe(0)
    expect(rowPanes({ units: -5 }, DOUBLE_HUNG).panes).toBe(0)
    expect(unitPanes(undefined).billable).toBe(1)
  })
})

describe('what comes with the window', () => {
  it('gets screens and tracks from the catalogue so nobody has to remember', () => {
    const e = rowExtras({ units: 10 }, DOUBLE_HUNG)
    expect(e.screens).toBe(10)
    expect(e.tracks).toBe(10)
  })

  it('gives fixed glass no screen', () => {
    expect(rowExtras({ units: 10 }, PICTURE).screens).toBe(0)
    expect(rowExtras({ units: 10 }, PICTURE).tracks).toBe(0)
  })

  it('lets a counted number win', () => {
    expect(rowExtras({ units: 10, screens: 3 }, DOUBLE_HUNG).screens).toBe(3)
    expect(rowExtras({ units: 10, tracks: 0 }, DOUBLE_HUNG).tracks).toBe(0)
  })
})

describe('which size band, for post-construction', () => {
  it('bands by the larger dimension, which is what wide/high says', () => {
    expect(sizeBandFor({ width_in: 32, height_in: 36 })).toBe('under_4')
    expect(sizeBandFor({ width_in: 32, height_in: 60 })).toBe('over_4')
    expect(sizeBandFor({ width_in: 96, height_in: 60 })).toBe('over_6')
  })

  it('treats exactly four feet as under four feet', () => {
    expect(sizeBandFor({ width_in: 48, height_in: 48 })).toBe('under_4')
    expect(sizeBandFor({ width_in: 49, height_in: 48 })).toBe('over_4')
    expect(sizeBandFor({ width_in: 72, height_in: 20 })).toBe('over_4')
    expect(sizeBandFor({ width_in: 73, height_in: 20 })).toBe('over_6')
  })

  it('prefers a measurement over the catalogue average', () => {
    expect(rowSizeBand({ width_in: 120, height_in: 90 }, CASEMENT)).toBe('over_6')
  })

  it('falls back to the catalogue when nobody measured', () => {
    expect(rowSizeBand({}, CASEMENT)).toBe('under_4')
    expect(rowSizeBand({}, FRENCH)).toBe('over_6')
  })

  it('takes a band the rep set outright', () => {
    expect(rowSizeBand({ size_band: 'over_6' }, CASEMENT)).toBe('over_6')
  })

  it('has no opinion with nothing to go on', () => {
    expect(sizeBandFor(null)).toBe(null)
    expect(rowSizeBand({}, {})).toBe(null)
  })
})

describe('how high is that, from a photograph', () => {
  it('scales a target against something of known size in the frame', () => {
    // An 80in door spans 120px; the sill spans 240px above grade -> 160in.
    expect(scaleHeight({ reference_in: 80, reference_px: 120, target_px: 240 })).toBe(160)
  })

  it('counts courses up a masonry wall, which needs no perspective at all', () => {
    // Nine brick courses at 2.67in is two feet.
    expect(courseHeight({ course_in: 2.67, courses: 9 })).toBe(24)
    expect(courseHeight({ course_in: 8, courses: 3 })).toBe(24)
  })

  it('refuses rather than guesses when the reference is missing', () => {
    expect(scaleHeight({ reference_in: 80, reference_px: 0, target_px: 240 })).toBe(null)
    expect(courseHeight({ courses: 9 })).toBe(null)
    expect(scaleHeight(null)).toBe(null)
  })

  it('turns a height into a storey', () => {
    expect(storeyFor(60)).toBe(1)
    expect(storeyFor(150)).toBe(2)
    expect(storeyFor(260)).toBe(3)
    // Commercial floors are taller, so the same height is a lower storey.
    expect(storeyFor(150, 'commercial')).toBe(2)
    expect(storeyFor(260, 'commercial')).toBe(2)
  })
})

describe('how the glass gets reached', () => {
  it('is ground work on the ground floor', () => {
    expect(accessFor({ floor: 1, face: 'out' })).toBe('ground')
  })

  it('is a ladder on the second storey and a fed pole above it', () => {
    expect(accessFor({ floor: 2, face: 'out' })).toBe('ladder')
    expect(accessFor({ floor: 3, face: 'out' })).toBe('waterfed')
    expect(accessFor({ floor: 4, face: 'out' })).toBe('waterfed')
  })

  it('runs out of pole and asks for a lift', () => {
    expect(accessFor({ floor: 6, face: 'out' })).toBe('lift')
    expect(accessFor({ floor: 14, face: 'out' })).toBe('rope')
  })

  it('judges the inside by reach above the floor, not by storey', () => {
    // A second-floor bedroom window is at chest height from the room; a
    // ground-floor stairwell window can be eighteen feet up inside.
    expect(accessFor({ floor: 2, face: 'in' })).toBe('ground')
    expect(accessFor({ floor: 1, face: 'in', reach_in: 216 })).toBe('ladder')
  })
})

describe('whether reach changes the product', () => {
  it('does not, at a house — and that is the book talking', () => {
    // HHH has no residential height product. A house is $6 outside whether
    // the window is over the porch or over the garage.
    expect(accessWorkKey('ladder', 'out', 'residential')).toBe(null)
    expect(accessWorkKey('waterfed', 'out', 'residential')).toBe(null)
  })

  it('does, at a commercial building, and names the live product', () => {
    expect(accessWorkKey('ladder', 'out', 'commercial')).toBe('ladder_exterior')
    expect(accessWorkKey('ladder', 'in', 'commercial')).toBe('ladder_interior')
    expect(accessWorkKey('waterfed', 'out', 'commercial')).toBe('waterfed')
  })

  it('asks for a lift knowing the book has none, so the gap gets reported', () => {
    expect(accessWorkKey('lift', 'out', 'commercial')).toBe('lift')
    expect(accessWorkKey('rope', 'out', 'commercial')).toBe('lift')
  })

  it('leaves ground-level work on the plain product', () => {
    expect(accessWorkKey('ground', 'out', 'commercial')).toBe(null)
  })
})

describe('everything about a row, in one call', () => {
  it('describes a third-storey commercial run', () => {
    const d = describeRow(
      { units: 20, face: 'out', floor: 3, segment: 'commercial' },
      { type_code: 'curtain_wall', type_name: 'Curtain wall unit', panes_per_unit: 1, lites_per_unit: 1, typical_width_in: 60, typical_height_in: 120, size_band: 'over_6' },
    )
    expect(d.panes).toBe(20)
    expect(d.access).toBe('waterfed')
    expect(d.access_work).toBe('waterfed')
    expect(d.size_band).toBe('over_6')
  })

  it('honours an access the rep set by hand', () => {
    const d = describeRow({ units: 4, face: 'out', floor: 1, segment: 'commercial', access: 'lift' }, PICTURE)
    expect(d.access).toBe('lift')
    expect(d.access_work).toBe('lift')
  })
})
