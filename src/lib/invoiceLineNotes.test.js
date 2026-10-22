// Bryce, 2026-10-22: part numbers go in the JOB line notes, and the invoice
// shows the notes — with a Notes switch beside Descriptions. Fast Auto's
// invoice was regenerated twice in two days (INV-1006 → 1040 → 1043); anything
// typed onto an invoice is lost, so notes are copied from the job every time.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { RECORD_TARGETS } from '../../supabase/functions/_shared/arnieRecords.ts'
import { buildInvoiceSendPayload } from './invoiceSend'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

describe('notes are copied onto every invoice made from a job', () => {
  it('every way of making an invoice reads the job line notes', () => {
    expect(read('src/pages/FieldScout.jsx')).toMatch(/in_utility_scope, notes, item:products_services\(name\)/)
    expect(read('src/pages/Invoices.jsx')).toMatch(/in_utility_scope, notes, item:products_services\(name\)/)
    expect(read('src/pages/PMJobSetter.jsx')).toMatch(/in_utility_scope, notes, item:products_services\(name\)/)
    // JobDetail reads job lines with *, so notes arrive already.
  })
  it('the columns exist', () => {
    const m = read('supabase/migrations/20261022100000_invoice_line_notes.sql')
    expect(m).toMatch(/alter table public\.invoice_lines add column if not exists notes text/)
    expect(m).toMatch(/alter table public\.invoices add column if not exists hide_line_notes boolean not null default false/)
  })
})

describe('the invoice shows them unless the Notes switch is off', () => {
  it('PDF: under the line, counted in the page break, honouring the switch', () => {
    const src = read('src/pages/InvoiceDetail.jsx')
    expect(src).toMatch(/const hideLineNotes = !!invoice\.hide_line_notes/)
    expect(src).toMatch(/const rawNotes = hideLineNotes \? '' : String\(line\.notes \|\| ''\)\.trim\(\)/)
    expect(src).toMatch(/checkPage\(\(primaryLines\.length \+ descLines\.length \+ noteLines\.length\) \* lineHeight \+ 4\)/)
  })
  it('the switch sits beside Descriptions and saves per invoice', () => {
    const src = read('src/pages/InvoiceDetail.jsx')
    expect(src).toMatch(/update\(\{ hide_line_notes: next \}\)\.eq\('id', invoice\.id\)/)
    expect(src).toMatch(/\{invoice\.hide_line_notes \? 'Notes: Off' : 'Notes: On'\}/)
  })
  it('customer portal: the notes column is read, and drawn unless switched off', () => {
    expect(read('supabase/functions/get-portal-document/index.ts')).toMatch(/in_utility_scope, sort_order, notes, item:products_services\(id, name\)/)
    expect(read('src/pages/CustomerPortal.jsx')).toMatch(/const notes = doc\.hide_line_notes \? '' : String\(li\.notes \|\| ''\)\.trim\(\)/)
  })
  it('email: carried when on, left out when off, escaped in the HTML', () => {
    const base = { invoice: { id: 1, company_id: 3, invoice_id: 'INV-1043' }, lines: [{ description: 'Flood', quantity: 4, unit_price: 159.5, line_total: 638, notes: 'Set at 45W\nPart # MES-FL' }] }
    expect(buildInvoiceSendPayload(base).invoice_lines[0].notes).toBe('Set at 45W\nPart # MES-FL')
    expect(buildInvoiceSendPayload({ ...base, invoice: { ...base.invoice, hide_line_notes: true } }).invoice_lines[0]).not.toHaveProperty('notes')
    const html = read('supabase/functions/send-invoice/index.ts')
    expect(html).toMatch(/const notes = String\(l\.notes \|\| ''\)\.trim\(\)\.replace\(\/&\/g, '&amp;'\)\.replace\(\/<\/g, '&lt;'\)/)
  })
})

describe('Arnie: "put the part number on the invoice"', () => {
  it('an invoice already made gets its own note card — appends, admin, refused when locked', () => {
    const t = RECORD_TARGETS.invoice_line_note
    expect([t.table, t.field, t.mode, t.minLevel]).toEqual(['invoice_lines', 'notes', 'append', 3])
    expect(t.guard).toBeTypeOf('function')
  })
  it('the invoice line it finds carries its notes, so adding never overwrites', () => {
    expect(read('supabase/functions/_shared/arnieDescriptions.ts')).toMatch(/const INVOICE_LINE_SELECT = 'id,invoice_id,item_id,description,notes,/)
  })
  it('the one-job lookup lists the job\'s invoices', () => {
    expect(read('supabase/functions/arnie-chat/index.ts')).toMatch(/invoices: \(invsByJob\.get\(j\.id\) \|\| \[\]\)\.map/)
  })
  it('he is told: the job line always, the existing invoice too, never the description', () => {
    const p = read('supabase/functions/_shared/arniePrompt.ts')
    expect(p).toMatch(/the part number ALWAYS goes in the job line's note/)
    expect(p).toMatch(/ALSO add the same words to that invoice's line with \\`invoice_line_note\\`/)
    expect(p).toMatch(/Never put a part number into an invoice line's description/)
  })
})
