// Purchase Order PDF generator.
//
// Matches the field-requested format (HHH mockup): a three-column header —
// Account (the business unit) / Job Name + PO# + note + need-by / Ship To —
// then a line table with the Order Code (product.vendor_sku) as its own
// "Product Number" column. Ship To defaults to the business unit (warehouse);
// an explicit po.ship_to_address ships to the job site instead.
//
// Every value is a live DB record (purchase_orders, purchase_order_lines,
// products_services.vendor_sku, the business_units setting, jobs, vendors) —
// nothing here is hard-coded.

import { jsPDF } from 'jspdf'
import { formatCurrency } from './poUtils'

export function generatePoPdf({ po, lines, vendor, company, job, businessUnit }) {
  const doc = new jsPDF()
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 15
  const rightEdge = pageW - margin
  const contentW = pageW - margin * 2
  const cx = pageW / 2

  const buName = businessUnit?.name || company?.company_name || company?.name || 'Company'
  const buAddr = businessUnit?.address || company?.address || ''
  const buPhone = businessUnit?.phone || company?.phone || ''
  const jobName = job?.job_title || job?.customer_name || ''

  // ── Three-column header: Account / Job / Ship To ───────────────────
  const top = 22

  // Account (left) = the business unit
  doc.setTextColor(0); doc.setFontSize(10); doc.setFont('helvetica', 'bold')
  doc.text('Account:', margin, top)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  let ly = top + 5
  doc.text(buName, margin, ly); ly += 4
  for (const l of doc.splitTextToSize(buAddr, contentW * 0.30)) { doc.text(l, margin, ly); ly += 4 }
  if (buPhone) { doc.text(buPhone, margin, ly); ly += 4 }

  // Center: Job Name / PO # / note / need-by. Wrapped + sized to fit BETWEEN
  // the Account and Ship To columns so a long job name can't overrun them.
  doc.setFontSize(11); doc.setFont('helvetica', 'bold'); doc.setTextColor(0)
  let cy = top
  for (const l of doc.splitTextToSize(`Job Name: ${jobName}`, contentW * 0.34)) { doc.text(l, cx, cy, { align: 'center' }); cy += 5 }
  doc.setFontSize(10)
  doc.text(`PO #: ${po.po_number}`, cx, cy, { align: 'center' }); cy += 6
  if (po.notes) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
    for (const l of doc.splitTextToSize(po.notes, contentW * 0.40)) { doc.text(l, cx, cy, { align: 'center' }); cy += 5 }
  }
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  if (po.expected_delivery_date) { doc.text(`Need by: ${formatDate(po.expected_delivery_date)}`, cx, cy, { align: 'center' }); cy += 5 }

  // Ship To (right) — defaults to the business unit; job site when overridden
  const sx = margin + contentW * 0.70
  doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(0)
  doc.text('Ship To:', sx, top)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
  let ry = top + 5
  if (po.ship_to_address) {
    if (job?.customer_name) { doc.setFont('helvetica', 'bold'); doc.text(job.customer_name, sx, ry); ry += 4; doc.setFont('helvetica', 'normal') }
    for (const l of doc.splitTextToSize(po.ship_to_address, contentW * 0.28)) { doc.text(l, sx, ry); ry += 4 }
  } else {
    doc.text(buName, sx, ry); ry += 4
    for (const l of doc.splitTextToSize(buAddr, contentW * 0.28)) { doc.text(l, sx, ry); ry += 4 }
    if (buPhone) { doc.text(buPhone, sx, ry); ry += 4 }
  }

  // Vendor — small line so the recipient is on the document (the mockup
  // omits it, but a PO with no vendor is risky; kept muted under the header).
  let y = Math.max(ly, cy, ry) + 5
  if (vendor?.name) {
    doc.setFontSize(9); doc.setTextColor(110)
    doc.text(`Vendor: ${vendor.name}${vendor.default_payment_terms ? `  ·  Terms: ${vendor.default_payment_terms}` : ''}`, margin, y)
    doc.setTextColor(0); y += 5
  }
  y += 3

  // ── "Product:" section + line table ────────────────────────────────
  doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor(0)
  doc.text('Product:', cx, y, { align: 'center' }); y += 8

  const xNum = margin
  const xQty = margin + contentW * 0.17
  const xDesc = margin + contentW * 0.27
  const xPrice = margin + contentW * 0.84   // right-aligned
  const xTotal = rightEdge                   // right-aligned
  const descW = contentW * 0.46

  const headerRow = (yy) => {
    doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(0)
    doc.text('Product Number', xNum, yy)
    doc.text('Quantity', xQty, yy)
    doc.text('Description', xDesc, yy)
    doc.text('Price Per Item', xPrice, yy, { align: 'right' })
    doc.text('Total Price', xTotal, yy, { align: 'right' })
    doc.setDrawColor(180); doc.line(margin, yy + 2, rightEdge, yy + 2)
  }
  headerRow(y); y += 7

  doc.setFont('helvetica', 'normal'); doc.setTextColor(0); doc.setFontSize(9)
  let qtySum = 0
  for (const line of lines || []) {
    if (y > pageH - 35) { doc.addPage(); y = 20; headerRow(y); y += 7; doc.setFont('helvetica', 'normal'); doc.setFontSize(9) }
    // Order code = product.vendor_sku (attached by the caller). Strip a
    // trailing "(sku)" from the description so it isn't shown twice.
    const code = line.vendor_sku || ''
    let desc = line.description || 'Item'
    if (code && desc.includes(`(${code})`)) desc = desc.replace(`(${code})`, '').replace(/\s{2,}/g, ' ').trim()
    const descLines = doc.splitTextToSize(desc, descW)
    doc.text(String(code), xNum, y)
    doc.text(String(line.quantity_ordered || 0), xQty, y)
    for (let i = 0; i < descLines.length; i++) doc.text(descLines[i], xDesc, y + i * 4)
    doc.text(formatCurrency(line.unit_cost), xPrice, y, { align: 'right' })
    doc.text(formatCurrency(line.line_total), xTotal, y, { align: 'right' })
    qtySum += parseFloat(line.quantity_ordered) || 0
    y += Math.max(5, descLines.length * 4) + 3
  }

  doc.setDrawColor(120); doc.line(margin, y, rightEdge, y); y += 6

  // ── Total row ──────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(0)
  doc.text('Total', xNum, y)
  doc.text(String(qtySum), xQty, y)
  doc.text(formatCurrency(po.total), xTotal, y, { align: 'right' })
  y += 7
  if (parseFloat(po.tax) > 0 || parseFloat(po.shipping) > 0) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(110)
    const bits = [`Subtotal ${formatCurrency(po.subtotal)}`]
    if (parseFloat(po.tax) > 0) bits.push(`Tax ${formatCurrency(po.tax)}`)
    if (parseFloat(po.shipping) > 0) bits.push(`Shipping ${formatCurrency(po.shipping)}`)
    doc.text(bits.join('    '), xTotal, y, { align: 'right' }); y += 5
  }

  // ── Footer ─────────────────────────────────────────────────────────
  doc.setFontSize(9); doc.setTextColor(140)
  doc.text(
    `${buName} · PO ${po.po_number} · Generated ${new Date().toLocaleDateString()}`,
    cx, pageH - 10, { align: 'center' }
  )

  return doc
}

function formatDate(d) {
  if (!d) return '-'
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}
