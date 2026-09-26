import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { fillPdfForm, extractFormFields, fieldKind } from './pdfFormFiller'

async function samplePdf() {
  const doc = await PDFDocument.create()
  const page = doc.addPage([400, 400])
  const form = doc.getForm()
  form.createTextField('Company name').addToPage(page, { x: 20, y: 300, width: 200, height: 24 })
  form.createCheckBox('Office').addToPage(page, { x: 20, y: 250, width: 16, height: 16 })
  const dd = form.createDropdown('State'); dd.addOptions(['CO', 'UT']); dd.addToPage(page, { x: 20, y: 200, width: 80, height: 24 })
  const rg = form.createRadioGroup('Size'); rg.addOptionToPage('Small', page, { x: 20, y: 150 }); rg.addOptionToPage('Large', page, { x: 60, y: 150 })
  return doc.save()
}

describe('pdfFormFiller', () => {
  it('recognises field kinds by instance, not by class name', async () => {
    // The production build minifies pdf-lib's class names; a
    // constructor.name check matched nothing and every generated utility
    // form came back blank (2026-09-25).
    const doc = await PDFDocument.load(await samplePdf())
    const form = doc.getForm()
    expect(fieldKind(form.getField('Company name'))).toBe('Text')
    expect(fieldKind(form.getField('Office'))).toBe('CheckBox')
    expect(fieldKind(form.getField('State'))).toBe('Dropdown')
    expect(fieldKind(form.getField('Size'))).toBe('RadioGroup')
    // What the minifier does to a name must not matter
    Object.defineProperty(form.getField('Company name').constructor, 'name', { value: 't' })
    expect(fieldKind(form.getField('Company name'))).toBe('Text')
  })

  it('fills text, checkbox, dropdown and radio fields and skips empties', async () => {
    const out = await fillPdfForm(await samplePdf(), { 'Company name': 'Robert Hayes', Office: 'true', State: 'CO', Size: 'Large', Missing: 'x', Empty: '' })
    const form = (await PDFDocument.load(out)).getForm()
    expect(form.getTextField('Company name').getText()).toBe('Robert Hayes')
    expect(form.getCheckBox('Office').isChecked()).toBe(true)
    expect(form.getDropdown('State').getSelected()).toEqual(['CO'])
    expect(form.getRadioGroup('Size').getSelected()).toBe('Large')
  })

  it('extracts fields with their kind and current value', async () => {
    const filled = await fillPdfForm(await samplePdf(), { 'Company name': 'ACME', Office: 'yes' })
    const fields = await extractFormFields(filled)
    expect(fields.find(f => f.name === 'Company name')).toEqual({ name: 'Company name', type: 'Text', value: 'ACME' })
    expect(fields.find(f => f.name === 'Office')).toMatchObject({ type: 'CheckBox', value: 'true' })
  })
})
