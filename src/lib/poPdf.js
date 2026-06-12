// Purchase Order PDF generator. Visual style mirrors InvoiceDetail's
// invoice PDF so vendor-facing documents and customer-facing documents
// share the same brand identity.

import { jsPDF } from 'jspdf'
import { formatCurrency } from './poUtils'

export function generatePoPdf({ po, lines, vendor, company, job, businessUnit }) {
  const doc = new jsPDF()
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 20
  const rightEdge = pageW - margin
  const contentW = pageW - margin * 2
  let y = 20

  // ── Header ──────────────────────────────────────────────────────────
  const headerName = businessUnit?.name || company?.company_name || company?.name || 'Company'
  doc.setFontSize(20); doc.setFont('helvetica', 'bold')
  doc.text(headerName, margin, y); y += 8

  doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(100)
  const companyAddress = businessUnit?.address || company?.address
  if (companyAddress) {
    const lines = doc.splitTextToSize(companyAddress, contentW * 0.5)
    for (const l of lines) { doc.text(l, margin, y); y += 5 }
  }
  const headerPhone = businessUnit?.phone || company?.phone
  const headerEmail = businessUnit?.email || company?.owner_email || company?.email
  if (headerPhone) { doc.text(headerPhone, margin, y); y += 5 }
  if (headerEmail) { doc.text(headerEmail, margin, y); y += 5 }
  y += 4

  // PO title block (right side)
  doc.setTextColor(90, 99, 73)
  doc.setFontSize(20); doc.setFont('helvetica', 'bold')
  doc.text('PURCHASE ORDER', rightEdge, 20, { align: 'right' })
  doc.setTextColor(80); doc.setFontSize(10); doc.setFont('helvetica', 'normal')
  let iy = 30
  doc.text(`PO #: ${po.po_number}`, rightEdge, iy, { align: 'right' }); iy += 5
  doc.text(`Date: ${formatDate(po.sent_at || po.created_at)}`, rightEdge, iy, { align: 'right' }); iy += 5
  if (po.expected_delivery_date) {
    doc.text(`Expected: ${formatDate(po.expected_delivery_date)}`, rightEdge, iy, { align: 'right' }); iy += 5
  }

  // Divider
  doc.setDrawColor(214, 205, 184)
  doc.line(margin, y, rightEdge, y)
  y += 10

  // ── Vendor + Ship To ───────────────────────────────────────────────
  doc.setTextColor(0); doc.setFontSize(11); doc.setFont('helvetica', 'bold')
  doc.text('Vendor:', margin, y)
  doc.text('Ship To:', margin + contentW * 0.5, y)
  y += 6

  doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
  let vy = y, sy = y
  if (vendor) {
    doc.text(vendor.name || '—', margin, vy); vy += 5
    if (vendor.contact_name) { doc.text(vendor.contact_name, margin, vy); vy += 5 }
    if (vendor.email) { doc.text(vendor.email, margin, vy); vy += 5 }
    if (vendor.phone) { doc.text(vendor.phone, margin, vy); vy += 5 }
    if (vendor.billing_address) {
      const lines = doc.splitTextToSize(vendor.billing_address, contentW * 0.45)
      for (const l of lines) { doc.text(l, margin, vy); vy += 5 }
    }
  }
  // Ship to: customer/project name first, then address, then job reference
  if (job) {
    // Customer name as primary recipient
    if (job.customer_name) {
      doc.setFont('helvetica', 'bold')
      doc.text(job.customer_name, margin + contentW * 0.5, sy); sy += 5
      doc.setFont('helvetica', 'normal')
    }
    // Job title as project name (if different from customer name)
    if (job.job_title && job.job_title !== job.customer_name) {
      doc.text(job.job_title, margin + contentW * 0.5, sy); sy += 5
    }
  }
  const shipTo = job?.job_address || job?.address || companyAddress
  if (shipTo) {
    const shipLines = doc.splitTextToSize(shipTo, contentW * 0.45)
    for (const l of shipLines) { doc.text(l, margin + contentW * 0.5, sy); sy += 5 }
  } else if (!job) {
    doc.text('(no ship-to address set)', margin + contentW * 0.5, sy); sy += 5
  }
  if (job) {
    doc.setFontSize(9); doc.setTextColor(120)
    doc.text(`Ref: ${job.job_id}`, margin + contentW * 0.5, sy); sy += 5
    doc.setFontSize(10); doc.setTextColor(0)
  }
  y = Math.max(vy, sy) + 6

  if (vendor?.default_payment_terms) {
    doc.setFontSize(10); doc.setTextColor(80)
    doc.text(`Terms: ${vendor.default_payment_terms}`, margin, y); y += 6
    doc.setTextColor(0)
  }

  // ── Line items table ───────────────────────────────────────────────
  // Header
  const descColW = contentW * 0.5
  const qtyX = margin + descColW + 4
  const costX = qtyX + 30
  const totalX = rightEdge - 4

  doc.setFillColor(90, 99, 73)
  doc.rect(margin, y - 4, contentW, 8, 'F')
  doc.setTextColor(255); doc.setFontSize(10); doc.setFont('helvetica', 'bold')
  doc.text('Description', margin + 4, y)
  doc.text('Qty', qtyX, y, { align: 'left' })
  doc.text('Unit Cost', costX, y, { align: 'left' })
  doc.text('Total', totalX, y, { align: 'right' })
  y += 8

  doc.setTextColor(0); doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
  for (const line of lines || []) {
    if (y > 250) { doc.addPage(); y = 20 }
    const descLines = doc.splitTextToSize(line.description || 'Item', descColW)
    const rowH = Math.max(6, descLines.length * 5)
    for (let i = 0; i < descLines.length; i++) {
      doc.text(descLines[i], margin + 4, y + (i * 5))
    }
    doc.text(String(line.quantity_ordered || 0), qtyX, y)
    doc.text(formatCurrency(line.unit_cost), costX, y)
    doc.text(formatCurrency(line.line_total), totalX, y, { align: 'right' })
    y += rowH + 2

    // Per-line job allocation — Bryce flagged: vendors pick + label by
    // job, so they need to see which job each portion is for. Renders
    // as muted italic block under the description, indented from the
    // left margin, e.g.:
    //   For:  JOB-2301 Capital Lumber — qty 5
    //         JOB-2302 Evergreen      — qty 8
    if (Array.isArray(line.jobLinks) && line.jobLinks.length > 0) {
      doc.setFontSize(9); doc.setTextColor(110); doc.setFont('helvetica', 'italic')
      const labelX = margin + 8
      doc.text('For:', labelX, y)
      const jobX = labelX + 14
      for (let i = 0; i < line.jobLinks.length; i++) {
        if (y > 270) { doc.addPage(); y = 20 }
        const link = line.jobLinks[i]
        const job = link.jobs || {}
        const label = `${job.job_id || `Job ${link.job_id}`}${job.customer_name ? '  ' + job.customer_name : (job.job_title ? '  ' + job.job_title : '')} — qty ${link.quantity}`
        doc.text(label, jobX, y)
        y += 5
      }
      doc.setFontSize(10); doc.setTextColor(0); doc.setFont('helvetica', 'normal')
      y += 2  // breathing room before next line
    }
  }

  // Bottom border
  doc.setDrawColor(214, 205, 184)
  doc.line(margin, y, rightEdge, y)
  y += 8

  // ── Totals ──────────────────────────────────────────────────────────
  const totalsX = rightEdge - 70
  const drawTotal = (label, amount, opts = {}) => {
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal')
    doc.setFontSize(opts.fontSize || 10)
    if (opts.color) doc.setTextColor(...opts.color); else doc.setTextColor(0)
    doc.text(label, totalsX, y)
    doc.text(amount, rightEdge, y, { align: 'right' })
    y += 6
  }
  drawTotal('Subtotal:', formatCurrency(po.subtotal))
  if (parseFloat(po.tax) > 0) drawTotal('Tax:', formatCurrency(po.tax))
  if (parseFloat(po.shipping) > 0) drawTotal('Shipping:', formatCurrency(po.shipping))
  y += 2
  doc.setDrawColor(90, 99, 73); doc.setLineWidth(0.5)
  doc.line(totalsX, y, rightEdge, y); doc.setLineWidth(0.2)
  y += 7
  drawTotal('TOTAL:', formatCurrency(po.total), { bold: true, fontSize: 13 })
  y += 10

  // ── Notes ──────────────────────────────────────────────────────────
  if (po.notes) {
    if (y > 250) { doc.addPage(); y = 20 }
    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(0)
    doc.text('Notes:', margin, y); y += 5
    doc.setFont('helvetica', 'normal'); doc.setTextColor(80)
    const notesLines = doc.splitTextToSize(po.notes, contentW)
    for (const l of notesLines) {
      if (y > 270) { doc.addPage(); y = 20 }
      doc.text(l, margin, y); y += 5
    }
    y += 4
  }

  // ── Footer ─────────────────────────────────────────────────────────
  doc.setFontSize(9); doc.setTextColor(140)
  doc.text(
    `Generated ${new Date().toLocaleDateString()} · ${headerName} · PO ${po.po_number}`,
    pageW / 2, doc.internal.pageSize.getHeight() - 10,
    { align: 'center' }
  )

  return doc
}

function formatDate(d) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}
