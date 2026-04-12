import { jsPDF } from 'jspdf'

// ─── Design tokens ──────────────────────────────────────────────
const C = {
  primary:    [90, 99, 73],       // #5a6349  olive
  primaryDk:  [62, 69, 50],       // darker olive for headings
  text:       [44, 53, 48],       // #2c3530
  muted:      [125, 138, 127],    // #7d8a7f
  light:      [180, 185, 175],    // lighter muted
  border:     [214, 205, 184],    // #d6cdb8
  white:      [255, 255, 255],
  cream:      [247, 245, 239],    // #f7f5ef
  creamDark:  [235, 232, 222],    // slightly darker cream for alternating rows
  green:      [74, 124, 89],      // #4a7c59
  accent:     [90, 99, 73],       // same as primary
  accentBg:   [240, 242, 236],    // very light olive tint
}

const fmt = (amount) => {
  if (!amount && amount !== 0) return '$0.00'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

const fmtDate = (d) => {
  if (!d) return ''
  try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }
  catch { return '' }
}

// ─── Logo helper ────────────────────────────────────────────────
async function fetchImageAsBase64(url) {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch { return null }
}

// ─── Public API ─────────────────────────────────────────────────
/**
 * Generate a beautiful estimate PDF.
 * @param {Object} opts
 * @param {Object} opts.estimate
 * @param {Array}  opts.lineItems
 * @param {Object} opts.company
 * @param {Object} opts.settings   – merged defaults + per-estimate overrides
 * @param {string} opts.layout     – 'email' | 'envelope'
 * @param {Object} [opts.businessUnit] – { name, logo_url, address, phone, email }
 * @returns {Promise<Blob>}
 */
export async function generateEstimatePdf({ estimate, lineItems, company, settings, layout = 'email', businessUnit }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' })
  const pw = doc.internal.pageSize.getWidth()   // 215.9
  const ph = doc.internal.pageSize.getHeight()   // 279.4
  const m = 18 // margin
  const cw = pw - m * 2

  // Resolve branding
  const brand = {
    name:    businessUnit?.name    || company?.company_name || 'Company',
    address: businessUnit?.address || company?.address      || '',
    phone:   businessUnit?.phone   || company?.phone        || '',
    email:   businessUnit?.email   || company?.owner_email  || '',
  }

  // Pre-fetch logo
  const logoUrl = businessUnit?.logo_url || (settings.show_logo && company?.logo_url) || null
  let logo = null
  if (logoUrl) logo = await fetchImageAsBase64(logoUrl)

  if (layout === 'envelope') {
    drawEnvelopePage(doc, { estimate, company, brand, logo, settings, m, pw, ph, cw })
    doc.addPage()
  }

  drawEstimate(doc, { estimate, lineItems, company, brand, logo, settings, m, pw, ph, cw })

  return doc.output('blob')
}

// ─── Main estimate layout ───────────────────────────────────────
function drawEstimate(doc, { estimate, lineItems, company, brand, logo, settings, m, pw, ph, cw }) {
  let y = m

  // ── Header band ──
  // Accent bar across top
  doc.setFillColor(...C.primary)
  doc.rect(0, 0, pw, 3, 'F')

  y = 12

  // ── Logo + brand name (left)  |  Contact info (right) ──
  const rightColX = pw - m
  let headerLeftBottom = y

  if (logo && settings.show_logo) {
    try {
      const logoH = 16
      const logoW = 40
      doc.addImage(logo, 'AUTO', m, y, logoW, logoH)
      headerLeftBottom = y + logoH + 2

      // Brand name below logo
      doc.setFontSize(14)
      doc.setTextColor(...C.primaryDk)
      doc.setFont('helvetica', 'bold')
      doc.text(brand.name, m, headerLeftBottom + 4)
      headerLeftBottom += 8
    } catch {
      doc.setFontSize(18)
      doc.setTextColor(...C.primaryDk)
      doc.setFont('helvetica', 'bold')
      doc.text(brand.name, m, y + 6)
      headerLeftBottom = y + 10
    }
  } else {
    doc.setFontSize(18)
    doc.setTextColor(...C.primaryDk)
    doc.setFont('helvetica', 'bold')
    doc.text(brand.name, m, y + 6)
    headerLeftBottom = y + 10
  }

  // Contact info — right-aligned
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...C.muted)
  let ry = y + 2
  if (settings.show_company_address && brand.address) {
    const lines = doc.splitTextToSize(brand.address, 70)
    doc.text(lines, rightColX, ry, { align: 'right' })
    ry += lines.length * 3.5
  }
  if (settings.show_company_phone && brand.phone) {
    doc.text(brand.phone, rightColX, ry, { align: 'right' })
    ry += 3.5
  }
  if (settings.show_company_email && brand.email) {
    doc.text(brand.email, rightColX, ry, { align: 'right' })
    ry += 3.5
  }

  y = Math.max(headerLeftBottom, ry) + 4

  // ── Divider ──
  doc.setDrawColor(...C.border)
  doc.setLineWidth(0.4)
  doc.line(m, y, pw - m, y)
  y += 6

  // ── "ESTIMATE" title + estimate number ──
  doc.setFontSize(24)
  doc.setTextColor(...C.primaryDk)
  doc.setFont('helvetica', 'bold')
  doc.text('ESTIMATE', m, y + 1)

  const estNum = estimate.quote_id || `EST-${estimate.id}`
  doc.setFontSize(12)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...C.primary)
  doc.text(estNum, pw - m, y + 1, { align: 'right' })
  y += 10

  // ── Two-column info block: Bill To (left) | Details (right) ──
  const midX = m + cw * 0.55

  // Left: Bill To
  const customer = estimate.customer || estimate.lead
  doc.setFontSize(8)
  doc.setTextColor(...C.muted)
  doc.setFont('helvetica', 'bold')
  doc.text('BILL TO', m, y)
  y += 4.5

  doc.setFontSize(11)
  doc.setTextColor(...C.text)
  doc.setFont('helvetica', 'bold')
  doc.text(customer?.name || customer?.customer_name || '—', m, y)
  let leftY = y + 5

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...C.muted)
  if (settings.show_customer_company && customer?.business_name) {
    doc.text(customer.business_name, m, leftY)
    leftY += 4
  }
  if (customer?.address) {
    const addrLines = doc.splitTextToSize(customer.address, midX - m - 10)
    doc.text(addrLines, m, leftY)
    leftY += addrLines.length * 4
  }
  if (customer?.phone) {
    doc.text(customer.phone, m, leftY)
    leftY += 4
  }
  if (customer?.email) {
    doc.text(customer.email, m, leftY)
    leftY += 4
  }

  // Right: Details table
  let detY = y - 4.5
  doc.setFontSize(8)
  doc.setTextColor(...C.muted)
  doc.setFont('helvetica', 'bold')
  doc.text('DETAILS', midX, detY)
  detY += 5

  const detailRows = []
  detailRows.push(['Date', fmtDate(estimate.created_at)])
  if (estimate.expiration_date) detailRows.push(['Expires', fmtDate(estimate.expiration_date)])
  if (settings.show_service_date && estimate.service_date) detailRows.push(['Service Date', fmtDate(estimate.service_date)])
  if (settings.show_technician && estimate.technician?.name) detailRows.push(['Technician', estimate.technician.name])
  if (estimate.status) detailRows.push(['Status', estimate.status])

  doc.setFontSize(9)
  for (const [label, value] of detailRows) {
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...C.muted)
    doc.text(label, midX, detY)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...C.text)
    doc.text(value || '—', midX + 35, detY)
    detY += 5
  }

  y = Math.max(leftY, detY) + 4

  // ── Estimate name ──
  if (estimate.estimate_name) {
    doc.setFontSize(13)
    doc.setTextColor(...C.text)
    doc.setFont('helvetica', 'bold')
    doc.text(estimate.estimate_name, m, y)
    y += 6
  }

  // ── Estimate message ──
  const message = estimate.estimate_message || settings.estimate_message
  if (message) {
    doc.setFontSize(9)
    doc.setTextColor(...C.muted)
    doc.setFont('helvetica', 'italic')
    const msgLines = doc.splitTextToSize(message, cw)
    doc.text(msgLines, m, y)
    y += msgLines.length * 4 + 3
    doc.setFont('helvetica', 'normal')
  }

  y += 2

  // ── Line items table ──
  y = drawTable(doc, lineItems, settings, y, m, cw, pw, ph)

  // ── Totals ──
  y = drawTotals(doc, estimate, lineItems, y, m, pw, ph)

  // ── Notes (after totals, before footer) ──
  if (estimate.notes) {
    if (y + 20 > ph - 30) { doc.addPage(); y = m }
    y += 6
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...C.primaryDk)
    doc.text('NOTES', m, y)
    y += 5
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...C.muted)
    const noteLines = doc.splitTextToSize(estimate.notes, cw)
    for (const line of noteLines) {
      if (y + 4 > ph - 30) { doc.addPage(); y = m }
      doc.text(line, m, y)
      y += 4
    }
  }

  // ── Footer ──
  drawFooter(doc, brand, settings, m, pw, ph)

  return y
}

// ─── Line items table ───────────────────────────────────────────
function drawTable(doc, lineItems, settings, startY, m, cw, pw, ph) {
  let y = startY
  const showDesc = settings.show_line_descriptions

  // Column layout
  const cols = showDesc
    ? [
        { label: 'Item',        w: cw * 0.30, align: 'left'  },
        { label: 'Description', w: cw * 0.28, align: 'left'  },
        { label: 'Qty',         w: cw * 0.10, align: 'right' },
        { label: 'Price',       w: cw * 0.15, align: 'right' },
        { label: 'Amount',      w: cw * 0.17, align: 'right' },
      ]
    : [
        { label: 'Item',   w: cw * 0.46, align: 'left'  },
        { label: 'Qty',    w: cw * 0.14, align: 'right' },
        { label: 'Price',  w: cw * 0.20, align: 'right' },
        { label: 'Amount', w: cw * 0.20, align: 'right' },
      ]

  const rowH = 7
  const headerH = 8

  // Ensure space
  if (y + headerH + rowH * 2 > ph - 30) { doc.addPage(); y = m }

  // Header row
  doc.setFillColor(...C.primary)
  doc.roundedRect(m, y, cw, headerH, 1.5, 1.5, 'F')

  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...C.white)

  let hx = m + 3
  for (const col of cols) {
    if (col.align === 'right') {
      doc.text(col.label.toUpperCase(), hx + col.w - 3, y + 5.5, { align: 'right' })
    } else {
      doc.text(col.label.toUpperCase(), hx, y + 5.5)
    }
    hx += col.w
  }
  y += headerH + 1

  // Rows
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)

  lineItems.forEach((line, idx) => {
    const itemName = line.item_name || line.item?.name || 'Item'
    const maxNameW = cols[0].w - 5
    const nameLines = doc.splitTextToSize(itemName, maxNameW)
    let descLines = []
    if (showDesc) {
      const desc = line.description || line.item?.description || ''
      if (desc) descLines = doc.splitTextToSize(desc, cols[1].w - 5)
    }
    const textLineCount = Math.max(nameLines.length, descLines.length, 1)
    const dynamicRowH = Math.max(rowH, 4 + textLineCount * 4)

    if (y + dynamicRowH > ph - 30) {
      doc.addPage()
      y = m
    }

    // Alternating row background
    if (idx % 2 === 0) {
      doc.setFillColor(...C.cream)
      doc.rect(m, y - 1, cw, dynamicRowH, 'F')
    }

    let rx = m + 3

    // Item name (multi-line)
    doc.setTextColor(...C.text)
    doc.setFont('helvetica', 'normal')
    for (let i = 0; i < nameLines.length; i++) {
      doc.text(nameLines[i], rx, y + 4 + i * 4)
    }
    rx += cols[0].w

    // Description (if shown, multi-line)
    if (showDesc) {
      doc.setTextColor(...C.muted)
      for (let i = 0; i < descLines.length; i++) {
        doc.text(descLines[i], rx, y + 4 + i * 4)
      }
      rx += cols[1].w
    }

    // Qty
    const qtyColIdx = showDesc ? 2 : 1
    doc.setTextColor(...C.text)
    doc.text(String(line.quantity || 0), rx + cols[qtyColIdx].w - 3, y + 4, { align: 'right' })
    rx += cols[qtyColIdx].w

    // Price
    const priceColIdx = showDesc ? 3 : 2
    doc.setTextColor(...C.muted)
    doc.text(fmt(line.price), rx + cols[priceColIdx].w - 3, y + 4, { align: 'right' })
    rx += cols[priceColIdx].w

    // Amount
    const amtColIdx = showDesc ? 4 : 3
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...C.text)
    doc.text(fmt(line.line_total), rx + cols[amtColIdx].w - 3, y + 4, { align: 'right' })
    doc.setFont('helvetica', 'normal')

    y += dynamicRowH
  })

  // Bottom border of table
  doc.setDrawColor(...C.border)
  doc.setLineWidth(0.3)
  doc.line(m, y, m + cw, y)

  return y + 2
}

// ─── Totals section ─────────────────────────────────────────────
function drawTotals(doc, estimate, lineItems, startY, m, pw, ph) {
  let y = startY + 4

  if (y > ph - 50) { doc.addPage(); y = m }

  const subtotal = lineItems.reduce((sum, l) => sum + (parseFloat(l.line_total) || 0), 0)
  const discount = parseFloat(estimate.discount) || 0
  const incentive = parseFloat(estimate.utility_incentive) || 0
  const total = subtotal - discount
  const outOfPocket = total - incentive

  const boxW = 80
  const boxX = pw - m - boxW
  const lineH = 6.5

  // Subtotal
  doc.setFontSize(9.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...C.muted)
  doc.text('Subtotal', boxX, y)
  doc.setTextColor(...C.text)
  doc.text(fmt(subtotal), pw - m, y, { align: 'right' })
  y += lineH

  // Discount
  if (discount > 0) {
    doc.setTextColor(...C.muted)
    doc.text('Discount', boxX, y)
    doc.setTextColor(...C.green)
    doc.text(`-${fmt(discount)}`, pw - m, y, { align: 'right' })
    y += lineH
  }

  // Incentive
  if (incentive > 0) {
    doc.setTextColor(...C.muted)
    doc.text('Utility Incentive', boxX, y)
    doc.setTextColor(...C.green)
    doc.text(`-${fmt(incentive)}`, pw - m, y, { align: 'right' })
    y += lineH
  }

  // Divider
  y += 1
  doc.setDrawColor(...C.primary)
  doc.setLineWidth(0.6)
  doc.line(boxX, y, pw - m, y)
  y += 5

  // Total — prominent
  doc.setFillColor(...C.primary)
  doc.roundedRect(boxX - 4, y - 5, boxW + 4, 12, 2, 2, 'F')
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...C.white)
  doc.text('TOTAL', boxX, y + 2)
  doc.text(fmt(total), pw - m, y + 2, { align: 'right' })
  y += 12

  // Out of pocket
  if (incentive > 0) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...C.green)
    doc.text('Your Cost After Incentive', boxX, y)
    doc.setFont('helvetica', 'bold')
    doc.text(fmt(outOfPocket), pw - m, y, { align: 'right' })
    y += 8
  }

  // Deposit paid
  if (parseFloat(estimate.deposit_amount) > 0) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...C.muted)
    doc.text('Deposit Received', boxX, y)
    doc.setTextColor(...C.text)
    doc.text(fmt(estimate.deposit_amount), pw - m, y, { align: 'right' })
    y += 5
    doc.setTextColor(...C.muted)
    doc.text('Balance Due', boxX, y)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...C.text)
    const balance = (incentive > 0 ? outOfPocket : total) - parseFloat(estimate.deposit_amount)
    doc.text(fmt(balance), pw - m, y, { align: 'right' })
    y += 8
  }

  return y
}

// ─── Footer ─────────────────────────────────────────────────────
function drawFooter(doc, brand, settings, m, pw, ph) {
  const footerY = ph - 16

  // Accent bar
  doc.setFillColor(...C.primary)
  doc.rect(0, ph - 3, pw, 3, 'F')

  // Thank you text
  doc.setFontSize(9)
  doc.setTextColor(...C.primary)
  doc.setFont('helvetica', 'bold')
  doc.text('Thank you for your business!', pw / 2, footerY, { align: 'center' })

  // Brand contact line
  const contactParts = [brand.name]
  if (brand.phone) contactParts.push(brand.phone)
  if (brand.email) contactParts.push(brand.email)
  doc.setFontSize(7.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...C.muted)
  doc.text(contactParts.join('  |  '), pw / 2, footerY + 5, { align: 'center' })

  // Footer text from settings
  if (settings.footer_text) {
    doc.setFontSize(7)
    doc.setTextColor(...C.light)
    const ftLines = doc.splitTextToSize(settings.footer_text, pw - m * 2)
    doc.text(ftLines, pw / 2, footerY + 10, { align: 'center' })
  }
}

// ─── Envelope page (cover sheet for mailing) ────────────────────
function drawEnvelopePage(doc, { estimate, company, brand, logo, settings, m, pw, ph, cw }) {
  // Accent bar
  doc.setFillColor(...C.primary)
  doc.rect(0, 0, pw, 3, 'F')

  let y = 15

  // Return address (top left)
  if (logo && settings.show_logo) {
    try {
      doc.addImage(logo, 'AUTO', 15, y, 28, 11)
      y += 14
    } catch { /* fallthrough */ }
  }

  doc.setFontSize(9)
  doc.setTextColor(...C.text)
  doc.setFont('helvetica', 'bold')
  doc.text(brand.name, 15, y)
  y += 4
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  if (brand.address) {
    const addrLines = doc.splitTextToSize(brand.address, 70)
    doc.text(addrLines, 15, y)
    y += addrLines.length * 3.5
  }
  if (brand.phone) { doc.text(brand.phone, 15, y); y += 3.5 }

  // Customer address — window position
  const customer = estimate.customer || estimate.lead
  const custName = customer?.name || customer?.customer_name || '—'
  const windowX = 25
  const windowY = 58

  doc.setFontSize(11)
  doc.setTextColor(...C.text)
  doc.setFont('helvetica', 'bold')
  doc.text(custName, windowX, windowY)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  let wy = windowY + 5
  if (customer?.business_name) { doc.text(customer.business_name, windowX, wy); wy += 5 }
  if (customer?.address) {
    const al = doc.splitTextToSize(customer.address, 80)
    doc.text(al, windowX, wy)
  }

  // Estimate number top-right
  const estNum = estimate.quote_id || `EST-${estimate.id}`
  doc.setFontSize(12)
  doc.setTextColor(...C.primary)
  doc.setFont('helvetica', 'bold')
  doc.text(estNum, pw - 20, 20, { align: 'right' })
  doc.setFontSize(8.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...C.muted)
  doc.text(fmtDate(estimate.created_at), pw - 20, 25, { align: 'right' })

  // Bottom accent
  doc.setFillColor(...C.primary)
  doc.rect(0, ph - 3, pw, 3, 'F')
}
