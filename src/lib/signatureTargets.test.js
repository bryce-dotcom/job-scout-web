import { describe, it, expect } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { findSignatureTargets, signatureRects, describeSignability } from './signatureTargets'

// Robert Anderson signed his proposal on 25 September. On 14 October his
// W-9 and General Application were generated for the job — filled with his
// name, his address, even a "Sign Date" of that morning — and unsigned,
// because stamping only ever happened when a template row carried
// `signature_fields` and nothing in the app has ever written that column.
//
// These are the two documents, as pdf-lib reads them.

async function formWith(fields, { pages = 1 } = {}) {
  const pdf = await PDFDocument.create()
  const made = []
  for (let i = 0; i < pages; i++) made.push(pdf.addPage([612, 792]))
  const form = pdf.getForm()
  for (const f of fields) {
    const tf = form.createTextField(f.name)
    tf.addToPage(made[f.page || 0], { x: f.x, y: f.y, width: f.width, height: f.height })
  }
  return PDFDocument.load(await pdf.save())
}

describe('a form that says where it is signed', () => {
  it('finds the signature line, and knows the date box is not one', async () => {
    // The General Application's page 1, to the pixel.
    const pdf = await formWith([
      { name: 'Signatory', x: 38, y: 71, width: 212, height: 15 },
      { name: 'Signature Field 2', x: 264, y: 71, width: 183, height: 15 },
      { name: 'Sign Date', x: 459, y: 71, width: 116, height: 15 },
    ])
    const t = findSignatureTargets(pdf)
    expect(t.signature.map(s => s.name)).toEqual(['Signature Field 2'])
    expect(t.date.map(s => s.name)).toEqual(['Sign Date'])
    expect(t.printedName.map(s => s.name)).toEqual(['Signatory'])
  })

  it('puts nothing in the date box, which is the failure nobody notices', async () => {
    // "Sign Date" matches /sign/ as readily as "Signature" does. Stamping a
    // signature there produces a form that looks signed, is not, and comes
    // back rejected weeks later.
    const pdf = await formWith([{ name: 'Sign Date', x: 459, y: 71, width: 116, height: 15 }])
    expect(findSignatureTargets(pdf).signature).toHaveLength(0)
  })

  it('reports a second signature deeper in the packet, with its real page', async () => {
    // The General Application carries a W-9 inside it: W9_SIG sits on page 5.
    // Miss it and the application goes in short one signature.
    const pdf = await formWith([
      { name: 'Signature Field 2', x: 264, y: 71, width: 183, height: 15, page: 0 },
      { name: 'W9_SIG', x: 123, y: 191, width: 236, height: 23, page: 4 },
    ], { pages: 10 })
    const sig = findSignatureTargets(pdf).signature
    expect(sig).toHaveLength(2)
    expect(sig.find(s => s.name === 'W9_SIG').page).toBe(4)
    expect(sig.find(s => s.name === 'Signature Field 2').page).toBe(0)
  })

  it('reads the spellings these forms actually use', async () => {
    const pdf = await formWith([
      { name: 'Customer Signature', x: 10, y: 10, width: 100, height: 20 },
      { name: 'signed_by', x: 10, y: 40, width: 100, height: 20 },
      { name: 'Initial Here', x: 10, y: 70, width: 100, height: 20 },
      { name: 'Facility Address', x: 10, y: 100, width: 100, height: 20 },
    ])
    const names = findSignatureTargets(pdf).signature.map(s => s.name)
    expect(names).toContain('Customer Signature')
    expect(names).toContain('signed_by')
    expect(names).toContain('Initial Here')
    expect(names).not.toContain('Facility Address')
  })
})

describe('a form that does not', () => {
  it('says so plainly instead of silently doing nothing', async () => {
    // The IRS W-9 signs on a printed rule; there is no field behind it.
    const pdf = await formWith([{ name: 'f1_01', x: 10, y: 700, width: 200, height: 20 }])
    const d = describeSignability(pdf, null)
    expect(d.signable).toBe(false)
    expect(d.reason).toMatch(/place a signature box/)
  })

  it('does not fall over on a PDF with no form at all', async () => {
    const plain = await PDFDocument.create()
    plain.addPage([612, 792]).drawText('scan of a form', { x: 50, y: 700 })
    const pdf = await PDFDocument.load(await plain.save())
    expect(findSignatureTargets(pdf).signature).toEqual([])
    expect(describeSignability(pdf, null).signable).toBe(false)
  })
})

describe('a box someone placed by hand', () => {
  it('wins over anything detected — they looked at the form and said "here"', async () => {
    const pdf = await formWith([{ name: 'Signature Field 2', x: 264, y: 71, width: 183, height: 15 }])
    const placed = [{ page: 2, x: 100, y: 100, width: 150, height: 40 }]
    const r = signatureRects(pdf, placed)
    expect(r.source).toBe('configured')
    expect(r.rects).toEqual(placed)
  })

  it('ignores a half-saved box rather than stamping a zero-sized rectangle', async () => {
    const pdf = await formWith([{ name: 'Signature Field 2', x: 264, y: 71, width: 183, height: 15 }])
    const r = signatureRects(pdf, [{ page: 0, x: 10, y: 10, width: 0, height: 0 }])
    expect(r.source).toBe('detected')
    expect(r.rects.map(x => x.name)).toEqual(['Signature Field 2'])
  })

  it('falls back to detection when the column is empty, which is every template today', async () => {
    const pdf = await formWith([{ name: 'Signature Field 2', x: 264, y: 71, width: 183, height: 15 }])
    for (const empty of [null, undefined, [], 'not-an-array']) {
      expect(signatureRects(pdf, empty).source).toBe('detected')
    }
  })
})

describe('the sig spelling, bounded', () => {
  it('counts W9_SIG and leaves design alone', async () => {
    const pdf = await formWith([
      { name: 'W9_SIG', x: 10, y: 10, width: 100, height: 20 },
      { name: 'design_notes', x: 10, y: 40, width: 100, height: 20 },
      { name: 'assigned_to', x: 10, y: 70, width: 100, height: 20 },
    ])
    expect(findSignatureTargets(pdf).signature.map(s => s.name)).toEqual(['W9_SIG'])
  })
})

// The wiring. Every one of these is a way to have the detection working and
// still ship a blank signature line.
describe('wired to the things that make documents', () => {
  const read = (p) => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../..', p), 'utf8')

  it('the generator stops demanding a column nothing ever writes', () => {
    const gen = read('src/lib/documentGenerator.js')
    expect(gen).toMatch(/signatureRects\(probe, template\.signature_fields\)/)
    expect(gen).toMatch(/if \(rects\.length > 0\)/)
    // the old gate turned every unconfigured template into an unsigned document
    expect(gen).not.toMatch(/if \(sigFields\.length > 0\)/)
  })

  it('an existing document can be signed without re-asking the customer', () => {
    const lib = read('src/lib/signExistingDocument.js')
    expect(lib).toMatch(/export async function applySignatureToAttachment/)
    expect(lib).toMatch(/resolveCustomerSignature/)
    // the unsigned original is kept, not overwritten
    expect(lib).toMatch(/_signed_\$\{Date\.now\(\)\}\.pdf/)
  })

  it('the job page offers it only when there is a signature and a PDF', () => {
    const page = read('src/pages/JobDetail.jsx')
    expect(page).toMatch(/handleApplySignature/)
    expect(page).toMatch(/job\?\.customer_signature_path \|\| job\?\.customer_signature_typed/)
    expect(page).toMatch(/\/\\.pdf\$\/i\.test\(att\.file_name/)
  })

  it('it refuses rather than pretending, when the form has nowhere to sign', () => {
    const lib = read('src/lib/signExistingDocument.js')
    expect(lib).toMatch(/if \(!rects\.length\)/)
    expect(lib).toMatch(/has not signed anything yet/)
  })
})
