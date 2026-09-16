// The work order — the crew's copy of a job.
//
// What is on it is what a crew needs on site and nothing the customer's
// invoice carries: who and where, when, which crew, every line with its
// description and NOTES, the job's notes, and the sections. No prices — a
// work order is instructions, not a bill.
//
// The Job page's "Generate Work Order" button had no handler at all (Bryce,
// 2026-09-16: "the Work Order should show these notes as well" — there was no
// work order to show them on). Line notes are the point: "use the 20ft lift,
// the panel is behind the HVAC duct" is written on the line, and the person
// on the ladder is the one who needs to read it.
//
// Pure: takes rows, returns a jsPDF document. Rendered headless in tests.

import { jsPDF } from 'jspdf'

const fmtDate = (v) => {
  if (!v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return String(v)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}
const fmtTime = (v) => {
  if (!v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return ''
  // A stored midnight is a date, not a time.
  if (d.getHours() === 0 && d.getMinutes() === 0) return ''
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}
const qtyText = (q) => {
  const n = parseFloat(q)
  if (!Number.isFinite(n)) return ''
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100)
}

/**
 * @param {object} p
 * @param {object}   p.job          the jobs row (+ customer join if you have it)
 * @param {object[]} p.lines        job_lines rows (+ item join): item_name/item.name, description, quantity, notes, unit_of_measure
 * @param {object[]} [p.sections]   job sections: name, status, description
 * @param {object}   [p.company]
 * @param {object}   [p.businessUnit]  { name, address, phone }
 * @param {string}   [p.crew]         who is assigned, already resolved to names
 */
export function generateWorkOrderPdf({ job, lines = [], sections = [], company = null, businessUnit = null, crew = '' }) {
  const doc = new jsPDF()
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 15
  const rightEdge = pageW - margin
  const contentW = pageW - margin * 2
  let y = 18

  const ensure = (needed) => {
    if (y + needed > pageH - 18) { doc.addPage(); y = 18 }
  }
  const text = (s, x, opts = {}) => { doc.text(String(s ?? ''), x, y, opts) }
  const para = (s, x, width, lineH = 4.5) => {
    const ls = doc.splitTextToSize(String(s ?? ''), width)
    for (const l of ls) { ensure(lineH + 2); doc.text(l, x, y); y += lineH }
    return ls.length
  }
  const label = (s, x = margin) => { doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(110); text(s, x); doc.setTextColor(0) }

  // ── Header ─────────────────────────────────────────────────────────────
  const orgName = businessUnit?.name || company?.company_name || company?.name || ''
  doc.setFont('helvetica', 'bold'); doc.setFontSize(18); doc.setTextColor(0)
  text('WORK ORDER', margin)
  doc.setFontSize(11); text(orgName, rightEdge, { align: 'right' })
  y += 6
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90)
  const orgLine = [businessUnit?.address, businessUnit?.phone].filter(Boolean).join('  ·  ')
  if (orgLine) text(orgLine, rightEdge, { align: 'right' })
  text(`${job?.job_id || `Job #${job?.id ?? ''}`}${job?.status ? `   ·   ${job.status}` : ''}`, margin)
  y += 6
  doc.setTextColor(0); doc.setFont('helvetica', 'bold'); doc.setFontSize(14)
  para(job?.job_title || job?.customer_name || 'Job', margin, contentW, 6)
  y += 2
  doc.setDrawColor(190); doc.line(margin, y, rightEdge, y); y += 7

  // ── Who / where / when — three columns ──────────────────────────────────
  const colW = contentW / 3
  const col = (i) => margin + colW * i
  const top = y
  const heights = []
  const customer = job?.customer || {}
  const custName = customer.business_name || customer.name || job?.customer_name || ''
  const contact = customer.business_name && customer.name && customer.name !== customer.business_name ? customer.name : ''
  const phone = customer.phone || job?.phone || ''
  const email = customer.email || job?.email || ''
  const site = job?.job_address || job?.address || customer.address || ''

  y = top; label('CUSTOMER'); y += 4.5
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(0)
  for (const s of [custName, contact, phone, email].filter(Boolean)) para(s, col(0), colW - 6)
  heights.push(y)

  y = top; label('SITE', col(1)); y += 4.5
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(0)
  para(site || '—', col(1), colW - 6)
  heights.push(y)

  y = top; label('SCHEDULE', col(2)); y += 4.5
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(0)
  const start = job?.start_date ? [fmtDate(job.start_date), fmtTime(job.start_date)].filter(Boolean).join(' ') : ''
  const end = job?.end_date ? [fmtDate(job.end_date), fmtTime(job.end_date)].filter(Boolean).join(' ') : ''
  para(start ? `Start: ${start}` : 'Start: —', col(2), colW - 4)
  if (end) para(`End: ${end}`, col(2), colW - 4)
  if (job?.allotted_time_hours) para(`Allotted: ${job.allotted_time_hours}h`, col(2), colW - 4)
  if (crew) para(`Crew: ${crew}`, col(2), colW - 4)
  heights.push(y)

  y = Math.max(...heights) + 4
  doc.setDrawColor(220); doc.line(margin, y, rightEdge, y); y += 7

  // ── Scope — every line, with its description and its notes ─────────────
  ensure(20)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(0)
  text('Scope of work', margin); y += 6
  const xQty = margin, xItem = margin + 16, itemW = contentW - 16
  const header = () => {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(110)
    text('QTY', xQty); text('ITEM', xItem); y += 2
    doc.setDrawColor(190); doc.line(margin, y, rightEdge, y); y += 5
    doc.setTextColor(0)
  }
  header()
  if (!lines.length) {
    doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(110)
    text('No line items on this job.', xItem); y += 6; doc.setTextColor(0)
  }
  for (const line of lines) {
    const name = line.item?.name || line.item_name || line.description || 'Custom item'
    const desc = line.description && line.description !== name ? line.description : ''
    const notes = String(line.notes || '').trim()
    const unit = line.unit_of_measure ? ` ${line.unit_of_measure}` : ''
    // A row must not split across pages between its name and its notes.
    const est = 6 + (desc ? doc.splitTextToSize(desc, itemW).length * 4.5 : 0) + (notes ? doc.splitTextToSize(notes, itemW - 18).length * 4.5 + 4 : 0)
    if (y + est > pageH - 18) { doc.addPage(); y = 18; header() }
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(0)
    text(`${qtyText(line.quantity)}${unit}`.trim(), xQty)
    doc.setFont('helvetica', 'bold')
    para(name, xItem, itemW, 5)
    if (desc) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90)
      para(desc, xItem, itemW)
      doc.setTextColor(0)
    }
    if (notes) {
      // The note is the instruction — set apart so it cannot be skimmed past.
      const ls = doc.splitTextToSize(notes, itemW - 18)
      const boxH = ls.length * 4.5 + 3
      doc.setFillColor(255, 247, 214); doc.setDrawColor(230, 200, 90)
      doc.rect(xItem, y - 3.2, itemW, boxH, 'FD')
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(120, 85, 0)
      doc.text('NOTE', xItem + 2, y)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(60, 40, 0)
      for (let i = 0; i < ls.length; i++) doc.text(ls[i], xItem + 14, y + i * 4.5)
      y += boxH + 1
      doc.setTextColor(0)
    }
    y += 3
    doc.setDrawColor(235); doc.line(margin, y - 1, rightEdge, y - 1)
    y += 2
  }

  // ── Job notes ──────────────────────────────────────────────────────────
  if (String(job?.notes || '').trim()) {
    y += 4; ensure(16)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(0)
    text('Job notes', margin); y += 6
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
    para(job.notes, margin, contentW)
  }

  // ── Sections ───────────────────────────────────────────────────────────
  if (sections.length) {
    y += 4; ensure(16)
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(0)
    text('Sections', margin); y += 6
    for (const s of sections) {
      ensure(8)
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(0)
      text(`${s.name || 'Section'}`, margin)
      doc.setFont('helvetica', 'normal'); doc.setTextColor(110)
      text(s.status || '', rightEdge, { align: 'right' }); y += 4.5
      doc.setTextColor(0)
      if (s.description) { doc.setFontSize(9); para(s.description, margin + 4, contentW - 4) }
      y += 1.5
    }
  }

  // ── Sign-off ───────────────────────────────────────────────────────────
  y += 8; ensure(22)
  doc.setDrawColor(150)
  const half = contentW / 2 - 6
  doc.line(margin, y + 8, margin + half, y + 8)
  doc.line(margin + half + 12, y + 8, rightEdge, y + 8)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(110)
  y += 12
  text('Completed by (crew)', margin)
  text('Customer sign-off', margin + half + 12)

  // ── Footer ─────────────────────────────────────────────────────────────
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(140)
    doc.text(`${orgName ? orgName + '  ·  ' : ''}Work order ${job?.job_id || ''}  ·  Generated ${new Date().toLocaleDateString('en-US')}  ·  Page ${p} of ${pages}`, pageW / 2, pageH - 8, { align: 'center' })
  }
  doc.setTextColor(0)
  return doc
}

export function workOrderFilename(job) {
  const base = (job?.job_id || `job-${job?.id ?? ''}`).replace(/[^A-Za-z0-9_-]+/g, '_')
  return `WorkOrder_${base}.pdf`
}
