// The bid form as the buyer receives it — the PDF a rep uploads to a
// procurement portal or hands to a GC. Draws the schedule that
// lib/bidSchedule arranged, so this total and the portal's total are the
// same number by construction.
//
// Draft rule: a bid with an unverified AI-sourced price is not a bid yet. The
// preview prints the redline and a DRAFT band so nobody mistakes it for the
// real form; the send gate keeps that version from ever leaving.

import { jsPDF } from 'jspdf'
import { buildSchedule, fmtMoney, fmtQty } from './bidSchedule'

const INK = [44, 53, 48]        // #2c3530
const MUTED = [125, 138, 127]   // #7d8a7f
const ACCENT = [90, 99, 73]     // #5a6349
const LINE = [214, 205, 184]    // #d6cdb8
const RED = [185, 28, 28]

export function generateBidPdf({ estimate, lineItems, company, businessUnit, customer, draftWatermark = true }) {
  const s = buildSchedule(estimate, lineItems)
  const doc = new jsPDF({ unit: 'mm', format: 'letter' })
  const pw = doc.internal.pageSize.getWidth()
  const ph = doc.internal.pageSize.getHeight()
  const m = 16
  const cw = pw - m * 2
  let y = m

  const bidder = businessUnit?.name || company?.company_name || 'Bidder'
  const bidderLines = [businessUnit?.address || company?.address, businessUnit?.phone || company?.phone, businessUnit?.email || company?.owner_email].filter(Boolean)
  const buyer = s.intake.buyer || customer?.business_name || customer?.name || ''

  const drawDraft = () => {
    if (!draftWatermark || s.unverified === 0) return
    doc.saveGraphicsState?.()
    doc.setTextColor(...RED)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text(`DRAFT — ${s.unverified} AI-sourced price${s.unverified === 1 ? '' : 's'} not yet verified. Not for submission.`, pw / 2, ph - 8, { align: 'center' })
    doc.restoreGraphicsState?.()
  }

  const newPage = () => { drawDraft(); doc.addPage(); y = m }
  const need = (h) => { if (y + h > ph - 18) newPage() }

  // ── Header: bidder left, BID + numbers right
  doc.setTextColor(...INK)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(14)
  doc.text(bidder, m, y + 5)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...MUTED)
  bidderLines.forEach((l, i) => doc.text(String(l), m, y + 10 + i * 4.2))

  doc.setTextColor(...ACCENT); doc.setFont('helvetica', 'bold'); doc.setFontSize(22)
  doc.text('BID', pw - m, y + 7, { align: 'right' })
  doc.setTextColor(...INK); doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  const metaRight = [
    s.intake.bid_number ? `Bid No. ${s.intake.bid_number}` : null,
    estimate?.quote_id ? `Our ref. ${estimate.quote_id}` : null,
    s.intake.due_at ? `Due ${new Date(s.intake.due_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}` : null,
    `Date ${new Date().toLocaleDateString('en-US')}`,
  ].filter(Boolean)
  metaRight.forEach((l, i) => doc.text(l, pw - m, y + 13 + i * 4.2, { align: 'right' }))
  y += Math.max(10 + bidderLines.length * 4.2, 13 + metaRight.length * 4.2) + 6

  doc.setDrawColor(...LINE); doc.line(m, y, pw - m, y); y += 6

  // ── To / Project
  const block = (label, value) => {
    if (!value) return
    doc.setFontSize(8); doc.setTextColor(...MUTED); doc.setFont('helvetica', 'bold')
    doc.text(label.toUpperCase(), m, y)
    doc.setFontSize(10); doc.setTextColor(...INK); doc.setFont('helvetica', 'normal')
    const lines = doc.splitTextToSize(String(value), cw)
    doc.text(lines, m, y + 4.5)
    y += 4.5 + lines.length * 4.6 + 3
  }
  block('Submitted to', [buyer, s.intake.submit_to].filter(Boolean).join('\n'))
  block('Project', s.intake.project || s.intake.title || estimate?.estimate_name)

  // ── Schedule
  const cols = [
    { key: 'item_no', label: 'Item', w: 14, align: 'left' },
    { key: 'description', label: 'Description', w: cw - 14 - 16 - 14 - 26 - 28, align: 'left' },
    { key: 'qty', label: 'Qty', w: 16, align: 'right' },
    { key: 'unit', label: 'Unit', w: 14, align: 'left' },
    { key: 'unit_price', label: 'Unit Price', w: 26, align: 'right' },
    { key: 'extended', label: 'Extended', w: 28, align: 'right' },
  ]
  const headerRow = () => {
    need(9)
    doc.setFillColor(238, 242, 235); doc.rect(m, y, cw, 7, 'F')
    doc.setFontSize(8); doc.setTextColor(...MUTED); doc.setFont('helvetica', 'bold')
    let x = m + 2
    for (const c of cols) { doc.text(c.label, c.align === 'right' ? x + c.w - 2 : x, y + 4.8, { align: c.align }); x += c.w }
    y += 8
  }

  for (const sec of s.sections) {
    need(14)
    doc.setFontSize(10); doc.setTextColor(...ACCENT); doc.setFont('helvetica', 'bold')
    doc.text(sec.name, m, y + 4); y += 7
    headerRow()
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
    for (const r of sec.rows) {
      const descLines = doc.splitTextToSize(r.description, cols[1].w - 4)
      const h = Math.max(6, descLines.length * 4.2 + 2)
      if (y + h > ph - 18) { newPage(); headerRow(); doc.setFont('helvetica', 'normal'); doc.setFontSize(9) }
      let x = m + 2
      doc.setTextColor(...(r.unverified && draftWatermark ? RED : INK))
      const cells = [r.item_no || '', null, fmtQty(r.qty), r.unit, fmtMoney(r.unit_price), fmtMoney(r.extended)]
      cols.forEach((c, i) => {
        if (i === 1) doc.text(descLines, x, y + 4)
        else doc.text(String(cells[i]), c.align === 'right' ? x + c.w - 2 : x, y + 4, { align: c.align })
        x += c.w
      })
      if (r.unverified && draftWatermark) {
        doc.setFontSize(7); doc.text('UNVERIFIED', m + 2 + cols[0].w + cols[1].w + cols[2].w + cols[3].w, y + 7.5); doc.setFontSize(9)
      }
      y += h
      doc.setDrawColor(...LINE); doc.line(m, y, pw - m, y); y += 1
    }
    need(8)
    doc.setFont('helvetica', 'bold'); doc.setTextColor(...INK)
    doc.text(`${sec.name} total`, pw - m - 30, y + 4.5, { align: 'right' })
    doc.text(fmtMoney(sec.total), pw - m - 2, y + 4.5, { align: 'right' })
    y += 10
  }

  need(12)
  doc.setDrawColor(...ACCENT); doc.setLineWidth(0.6); doc.line(pw - m - 70, y, pw - m, y); doc.setLineWidth(0.2)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...INK)
  doc.text('TOTAL BID', pw - m - 30, y + 7, { align: 'right' })
  doc.text(fmtMoney(s.total), pw - m - 2, y + 7, { align: 'right' })
  y += 14

  // ── Acknowledgements / instructions
  if (s.intake.acknowledgements.length) {
    need(10 + s.intake.acknowledgements.length * 5)
    doc.setFontSize(8); doc.setTextColor(...MUTED); doc.setFont('helvetica', 'bold'); doc.text('ACKNOWLEDGEMENTS', m, y); y += 4.5
    doc.setFontSize(9); doc.setTextColor(...INK); doc.setFont('helvetica', 'normal')
    for (const a of s.intake.acknowledgements) { doc.rect(m, y - 3, 3, 3); doc.text(String(a), m + 5, y); y += 5 }
    y += 3
  }

  // ── Signature block
  need(30)
  doc.setDrawColor(...LINE); doc.line(m, y, pw - m, y); y += 8
  doc.setFontSize(9); doc.setTextColor(...INK)
  doc.text('The undersigned, having examined the bid documents, offers to furnish the items above at the prices stated.', m, y, { maxWidth: cw }); y += 12
  const sig = (label, x, w) => { doc.setDrawColor(...INK); doc.line(x, y, x + w, y); doc.setFontSize(7); doc.setTextColor(...MUTED); doc.text(label.toUpperCase(), x, y + 3.5) }
  sig('Authorized signature', m, 70); sig('Name / Title', m + 78, 60); sig('Date', m + 146, cw - 146)
  y += 6
  drawDraft()

  return doc
}

export function bidPdfBlob(args) {
  return generateBidPdf(args).output('blob')
}
