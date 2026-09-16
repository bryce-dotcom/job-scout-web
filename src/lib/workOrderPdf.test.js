import { describe, it, expect } from 'vitest'
import { generateWorkOrderPdf, workOrderFilename } from './workOrderPdf'

// The crew's copy of the job. Bryce, 2026-09-16: line notes must be readable
// without clicking into a line, and the work order must carry them — the
// "Generate Work Order" button on the job page did nothing at all.

const textRuns = (doc) => [...doc.output().matchAll(/\(((?:\\\)|[^)])*)\) Tj/g)].map((m) => m[1].replace(/\\\)/g, ')').replace(/\\\(/g, '('))
const allText = (doc) => textRuns(doc).join('\n')

const job = {
  id: 23513, job_id: 'JOB-MTXFWXOV', job_title: 'Intercon Furniture - Phase 1', status: 'Scheduled',
  start_date: '2026-09-18T14:00:00Z', job_address: '1 Main St, Salt Lake City, UT 84101',
  notes: 'Gate code 4471.', assigned_team: 'Cameron McDonough, Aidan Burr',
  customer: { name: 'Jordan Reyes', business_name: 'Intercon Furniture', phone: '(801) 555-0148' },
}
const lines = [
  { quantity: 15, item: { name: 'SMBE 50/60/70/90/110W Highbay - 2ft Lift/Controls' }, description: 'Replace existing 400W MH highbays', notes: 'Use the 20ft lift — the panel is behind the HVAC duct.', price: 987.5, total: 14812.5 },
  { quantity: 7, item: { name: 'SMBE 150/165/180/200/220W Highbay - 2ft' }, notes: null, price: 1200, total: 8400 },
  { quantity: 2.5, unit_of_measure: 'hr', item_name: 'Electrical troubleshooting', notes: '' },
]

describe('the work order', () => {
  const doc = generateWorkOrderPdf({ job, lines, sections: [{ name: 'Warehouse bays 1–6', status: 'Not Started' }], businessUnit: { name: 'Energy Scout', address: '6395 W 10400 N, Highland, UT' }, crew: job.assigned_team })
  const text = allText(doc)

  it('carries every line note, and the job notes', () => {
    expect(text).toContain('Use the 20ft lift')
    expect(text).toContain('behind the HVAC duct.')
    expect(text).toContain('Gate code 4471.')
  })

  it('names the job, the customer, the site, the crew and the schedule', () => {
    expect(text).toContain('JOB-MTXFWXOV')
    expect(text).toContain('Intercon Furniture - Phase 1')
    expect(text).toContain('Intercon Furniture')
    expect(text).toContain('Jordan Reyes')
    expect(text).toContain('1 Main St, Salt Lake City, UT 84101')
    expect(text).toContain('Crew: Cameron McDonough, Aidan')
    expect(text).toContain('Start: Fri, Sep 18, 2026')
  })

  it('lists every line with its quantity and unit, and the sections', () => {
    expect(text).toContain('SMBE 50/60/70/90/110W Highbay - 2ft Lift/Controls')
    expect(text).toContain('SMBE 150/165/180/200/220W Highbay - 2ft')
    expect(text).toContain('Electrical troubleshooting')
    expect(text).toContain('2.5 hr')
    expect(text).toContain('Warehouse bays 1') // the en dash is WinAnsi-encoded in the stream
  })

  it('prints no prices — a work order is instructions, not a bill', () => {
    expect(text).not.toContain('987.5')
    expect(text).not.toContain('14812')
    expect(text).not.toContain('$')
  })

  it('a line with no note has no NOTE box', () => {
    const noteBoxes = textRuns(doc).filter((t) => t === 'NOTE').length
    expect(noteBoxes).toBe(1)
  })

  it('fits a normal job on one page and pages a long one', () => {
    expect(doc.getNumberOfPages()).toBe(1)
    const many = Array.from({ length: 60 }, (_, i) => ({ quantity: 1, item_name: `Fixture ${i + 1}`, notes: i % 3 === 0 ? `Note for fixture ${i + 1}` : null }))
    const long = generateWorkOrderPdf({ job, lines: many })
    expect(long.getNumberOfPages()).toBeGreaterThan(1)
    expect(allText(long)).toContain('Note for fixture 58')
  })

  it('survives a bare job with nothing on it', () => {
    const bare = generateWorkOrderPdf({ job: { id: 5 }, lines: [] })
    expect(allText(bare)).toContain('No line items on this job.')
    expect(workOrderFilename({ id: 5 })).toBe('WorkOrder_job-5.pdf')
    expect(workOrderFilename(job)).toBe('WorkOrder_JOB-MTXFWXOV.pdf')
  })
})
