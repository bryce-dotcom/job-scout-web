import { describe, it, expect } from 'vitest'
import { normalizeRect, isUsableBox, boxForStorage, boxesOnPage, placementAdvice, MIN_BOX_POINTS, matchTemplateForFile, normalizeFormName } from './signatureBox'

// The IRS W-9 signs on a printed rule with no AcroForm field behind it, so
// somebody has to say where. Everything that can go wrong here goes wrong
// quietly: a box in the wrong place still produces a document that looks
// signed.

describe('two corners into a rectangle', () => {
  it('reads a drag in any direction as the same box', () => {
    const downRight = normalizeRect([100, 200], [300, 120])
    const upLeft = normalizeRect([300, 120], [100, 200])
    expect(downRight).toEqual(upLeft)
    expect(downRight).toEqual({ x: 100, y: 120, width: 200, height: 80 })
  })

  it('anchors at the lower-left, which is where PDF space starts', () => {
    // Store the top edge as y and the signature lands a box-height too high.
    const r = normalizeRect([60, 140], [280, 116])
    expect(r.y).toBe(116)
    expect(r.y + r.height).toBe(140)
  })

  it('is null on junk rather than a NaN rectangle', () => {
    expect(normalizeRect(null, [1, 2])).toBeNull()
    expect(normalizeRect([1, 2], [NaN, 5])).toBeNull()
    expect(normalizeRect([1], [2, 3])).toBeNull()
  })
})

describe('what counts as a box', () => {
  it('rejects a misclick', () => {
    expect(isUsableBox({ width: 2, height: 40 })).toBe(false)
    expect(isUsableBox({ width: 200, height: 1 })).toBe(false)
    expect(isUsableBox(null)).toBe(false)
  })

  it('accepts a signature-line-sized box', () => {
    // the General Application's own field is 183 x 15 points
    expect(isUsableBox({ width: 183, height: 15 })).toBe(true)
    expect(isUsableBox({ width: MIN_BOX_POINTS, height: MIN_BOX_POINTS })).toBe(true)
  })
})

describe('the row that gets stored', () => {
  it('counts pages from zero, the way the stamper does', () => {
    // The viewer shows "Page 1"; signatureTargets and drawSignatureAt both
    // index from 0. One off here puts every signature on the wrong page.
    const box = boxForStorage({ x: 60, y: 116, width: 220, height: 24 }, 0)
    expect(box.page).toBe(0)
    expect(boxForStorage({ x: 60, y: 116, width: 220, height: 24 }, 4).page).toBe(4)
  })

  it('refuses to store a misclick', () => {
    expect(boxForStorage({ x: 10, y: 10, width: 3, height: 3 }, 0)).toBeNull()
  })

  it('rounds, so the stored row is readable', () => {
    const box = boxForStorage({ x: 60.123456, y: 116.98765, width: 220.5555, height: 24.4444 }, 0)
    expect(box).toMatchObject({ x: 60.12, y: 116.99, width: 220.56, height: 24.44 })
  })

  it('survives a page that arrives as a string', () => {
    expect(boxForStorage({ x: 1, y: 1, width: 20, height: 20 }, '3').page).toBe(3)
    expect(boxForStorage({ x: 1, y: 1, width: 20, height: 20 }, null).page).toBe(0)
  })
})

describe('showing the boxes for the page in view', () => {
  const boxes = [
    { page: 0, x: 1, y: 1, width: 10, height: 10 },
    { page: 4, x: 2, y: 2, width: 10, height: 10 },
    { x: 3, y: 3, width: 10, height: 10 },        // no page = page 0
  ]
  it('picks only this page', () => {
    expect(boxesOnPage(boxes, 0)).toHaveLength(2)
    expect(boxesOnPage(boxes, 4)).toHaveLength(1)
    expect(boxesOnPage(boxes, 9)).toHaveLength(0)
  })
  it('does not fall over on junk', () => {
    expect(boxesOnPage(null, 0)).toEqual([])
    expect(boxesOnPage(undefined, 0)).toEqual([])
  })
})

describe('what to tell the person who opened the form', () => {
  it('says a form that names its own line needs nothing', () => {
    // the General Application: placing a box here would stamp it twice
    const a = placementAdvice({ detectedCount: 2, placedCount: 0 })
    expect(a.tone).toBe('detected')
    expect(a.text).toMatch(/signs itself/)
  })

  it('asks for a box when the form has no field — the W-9', () => {
    const a = placementAdvice({ detectedCount: 0, placedCount: 0 })
    expect(a.tone).toBe('needed')
    expect(a.text).toMatch(/Drag a box/)
  })

  it('says a placed box overrides the form, because it does', () => {
    const a = placementAdvice({ detectedCount: 2, placedCount: 1 })
    expect(a.tone).toBe('placed')
    expect(a.text).toMatch(/instead of/)
  })
})

// A generated document keeps no pointer back to its template, so a box
// placed on the W-9 template does nothing for the W-9 already on the job
// unless the link can be recovered from the name.
describe('finding the template a document came from', () => {
  const w9 = { id: 1, form_name: 'w9', signature_fields: [{ page: 0, x: 125, y: 193, width: 250, height: 20 }] }
  const esga = { id: 4, form_name: 'ES-GA', signature_fields: [] }

  it('matches the W-9 on the job to the w9 template', () => {
    expect(matchTemplateForFile('IRS_Form_W-9.pdf', [w9, esga])).toBe(w9)
    expect(matchTemplateForFile('w9.pdf', [w9])).toBe(w9)
  })

  it('ignores a template carrying no boxes, so the honest refusal survives', () => {
    // ES-GA has none: matching it would replace "this form has no signature
    // field, place one" with silence.
    expect(matchTemplateForFile('ES-GA_General_Application.pdf', [esga])).toBeNull()
  })

  it('prefers the most specific name', () => {
    const w9sp = { id: 2, form_name: 'w9sp', signature_fields: [{ page: 0, x: 1, y: 1, width: 20, height: 20 }] }
    expect(matchTemplateForFile('IRS_Form_W9SP.pdf', [w9, w9sp])).toBe(w9sp)
  })

  it('does not match on nothing', () => {
    expect(matchTemplateForFile('', [w9])).toBeNull()
    expect(matchTemplateForFile('Permit.pdf', [w9])).toBeNull()
    expect(matchTemplateForFile('a.pdf', [{ form_name: 'a', signature_fields: [{ width: 9, height: 9 }] }])).toBeNull()
  })

  it('normalizes the punctuation these names are full of', () => {
    expect(normalizeFormName('IRS_Form_W-9.pdf')).toBe('irsformw9')
    expect(normalizeFormName('  RMP UT Express Tool v071125.2 ')).toBe('rmputexpresstoolv0711252')
  })
})
