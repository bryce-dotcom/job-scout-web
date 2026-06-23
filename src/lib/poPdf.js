// Purchase Order PDF generator — matches the vendor PO format Energy Scout
// uses in the field: Account left | Job/PO center | Ship To right, with a
// Product Number column (vendor SKU) and bundle components listed adjacently.

import { jsPDF } from 'jspdf'

export function generatePoPdf({ po, lines, vendor, company, job, businessUnit }) {
  const doc = new jsPDF()
  const pageW  = doc.internal.pageSize.getWidth()
  const margin = 20
  const rightEdge = pageW - margin
  const contentW  = pageW - margin * 2
  let y = 20

  // ── Header — 3-column: Account | Job info (center) | Ship To ────────
  const headerName    = businessUnit?.name || company?.company_name || company?.name || 'Company'
  const companyAddress = businessUnit?.address || company?.address
  const headerPhone   = businessUnit?.phone || company?.phone
  const shipToX       = margin + contentW * 0.65
  const centerX       = pageW / 2

  // Left: Account block
  let ly = y
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(0)
  doc.text('Account:', margin, ly); ly += 5
  doc.setFont('helvetica', 'normal')
  doc.text(headerName, margin, ly); ly += 5
  if (companyAddress) {
    const aLines = doc.splitTextToSize(companyAddress, 55)
    for (const l of aLines) { doc.text(l, margin, ly); ly += 5 }
  }
  if (headerPhone) { doc.text(headerPhone, margin, ly); ly += 5 }

  // Right: Ship To block
  let ry = y
  doc.setFont('helvetica', 'bold')
  doc.text('Ship To:', shipToX, ry); ry += 5
  doc.setFont('helvetica', 'normal')
  if (job?.customer_name) { doc.text(job.customer_name, shipToX, ry); ry += 5 }
  if (job?.job_title && job.job_title !== job.customer_name) {
    doc.text(job.job_title, shipToX, ry); ry += 5
  }
  const shipAddr = po.ship_to_address || job?.job_address || companyAddress
  if (shipAddr) {
    const sLines = doc.splitTextToSize(shipAddr, 55)
    for (const l of sLines) { doc.text(l, shipToX, ry); ry += 5 }
  }
  if (headerPhone) { doc.text(headerPhone, shipToX, ry); ry += 5 }

  // Center: Job name (bold), PO#, notes (bold/prominent), Need by
  let cy = y
  const jobLabel = job
    ? (job.customer_name || job.job_title || job.job_id || '')
    : ''
  if (jobLabel) {
    doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(0)
    doc.text(`Job Name: ${jobLabel}`, centerX, cy, { align: 'center' }); cy += 7
  }
  doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(0)
  doc.text(`PO #: ${po.po_number}`, centerX, cy, { align: 'center' }); cy += 5
  if (po.notes) {
    doc.setFont('helvetica', 'bold')
    const nLines = doc.splitTextToSize(po.notes, 65)
    for (const nl of nLines) { doc.text(nl, centerX, cy, { align: 'center' }); cy += 5 }
    doc.setFont('helvetica', 'normal')
  }
  if (po.expected_delivery_date) {
    const needBy = new Date(po.expected_delivery_date)
      .toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })
    doc.text(`Need by: ${needBy}`, centerX, cy, { align: 'center' }); cy += 5
  }

  y = Math.max(ly, ry, cy) + 8

  // Divider
  doc.setDrawColor(214, 205, 184)
  doc.line(margin, y, rightEdge, y)
  y += 10

  // ── "Product:" section heading ────────────────────────────────────────
  doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(0)
  doc.text('Product:', centerX, y, { align: 'center' })
  y += 8

  // ── Line items table ─────────────────────────────────────────────────
  // Columns: Product Number | Quantity | Description | Price Per Item | Total Price
  const skuColW   = 28
  const qtyColW   = 14
  const priceColW = 28
  const totalColW = 30
  const descColW  = contentW - skuColW - qtyColW - priceColW - totalColW

  const skuX   = margin
  const qtyX   = skuX + skuColW
  const descX  = qtyX + qtyColW
  const priceX = descX + descColW

  // Table header row
  doc.setFillColor(90, 99, 73)
  doc.rect(margin, y - 4, contentW, 8, 'F')
  doc.setTextColor(255); doc.setFontSize(9); doc.setFont('helvetica', 'bold')
  doc.text('Product Number', skuX + 2, y)
  doc.text('Quantity',       qtyX + 2, y)
  doc.text('Description',    descX + 2, y)
  doc.text('Price Per Item', priceX + 2, y)
  doc.text('Total Price',    rightEdge - 2, y, { align: 'right' })
  y += 8

  // Data rows
  doc.setTextColor(0); doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
  let totalQty = 0

  for (const line of lines || []) {
    if (y > 255) { doc.addPage(); y = 20 }

    const sku = line.vendor_sku || ''
    const qty = parseFloat(line.quantity_ordered) || 0
    totalQty += qty

    // Strip legacy "(vendor_sku)" pattern embedded in description
    let desc = line.description || line.name || 'Item'
    if (sku) desc = desc.replace(` (${sku})`, '').trim()

    const descLines = doc.splitTextToSize(desc, descColW - 4)
    const rowH = Math.max(7, descLines.length * 5)

    doc.text(sku, skuX + 2, y)
    doc.text(String(qty), qtyX + 2, y)
    for (let i = 0; i < descLines.length; i++) {
      doc.text(descLines[i], descX + 2, y + i * 5)
    }
    doc.text(`$ ${fmtAmt(line.unit_cost)}`,  priceX + 2,    y)
    doc.text(`$ ${fmtAmt(line.line_total)}`,  rightEdge - 2, y, { align: 'right' })
    y += rowH

    // Per-line job allocation — muted italic under description
    if (Array.isArray(line.jobLinks) && line.jobLinks.length > 0) {
      doc.setFontSize(8); doc.setTextColor(110); doc.setFont('helvetica', 'italic')
      for (const link of line.jobLinks) {
        if (y > 270) { doc.addPage(); y = 20 }
        const j = link.jobs || {}
        const jName = j.customer_name || j.job_title || j.job_id || `Job ${link.job_id}`
        doc.text(`  For: ${jName} — qty ${link.quantity}`, descX + 2, y)
        y += 4
      }
      doc.setFontSize(10); doc.setTextColor(0); doc.setFont('helvetica', 'normal')
    }
    y += 2
  }

  // Table bottom border
  doc.setDrawColor(214, 205, 184)
  doc.line(margin, y, rightEdge, y)
  y += 5

  // Total row
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(0)
  doc.text('Total',        skuX + 2,     y)
  doc.text(String(totalQty), qtyX + 2,   y)
  doc.text(`$ ${fmtAmt(po.total)}`, rightEdge - 2, y, { align: 'right' })
  y += 10

  // Tax / shipping if applicable
  if (parseFloat(po.tax) > 0 || parseFloat(po.shipping) > 0) {
    const labX = rightEdge - 60
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
    if (parseFloat(po.tax) > 0) {
      doc.text('Tax:',      labX, y)
      doc.text(`$ ${fmtAmt(po.tax)}`, rightEdge - 2, y, { align: 'right' }); y += 6
    }
    if (parseFloat(po.shipping) > 0) {
      doc.text('Shipping:', labX, y)
      doc.text(`$ ${fmtAmt(po.shipping)}`, rightEdge - 2, y, { align: 'right' }); y += 6
    }
    y += 4
  }

  // Payment terms
  if (vendor?.default_payment_terms) {
    doc.setFontSize(9); doc.setTextColor(100); doc.setFont('helvetica', 'normal')
    doc.text(`Payment Terms: ${vendor.default_payment_terms}`, margin, y); y += 5
  }

  // ── Footer ─────────────────────────────────────────────────────────────
  doc.setFontSize(9); doc.setTextColor(140)
  doc.text(
    `Generated ${new Date().toLocaleDateString()} · ${headerName} · PO ${po.po_number}`,
    pageW / 2, doc.internal.pageSize.getHeight() - 10,
    { align: 'center' }
  )

  return doc
}

// Formats a number as "1,234.00" (no $ — callers add their own)
function fmtAmt(n) {
  if (n == null || isNaN(Number(n))) return '0.00'
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatDate(d) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}
