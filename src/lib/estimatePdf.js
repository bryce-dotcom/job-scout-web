import { jsPDF } from 'jspdf'

const COLORS = {
  primary: [90, 99, 73],      // #5a6349
  text: [44, 53, 48],         // #2c3530
  muted: [125, 138, 127],     // #7d8a7f
  border: [214, 205, 184],    // #d6cdb8
  white: [255, 255, 255],
  headerBg: [247, 245, 239],  // #f7f5ef
  greenAccent: [74, 124, 89]  // #4a7c59
}

const formatCurrency = (amount) => {
  if (!amount) return '$0.00'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

/**
 * Generate an estimate PDF.
 * @param {Object} options
 * @param {Object} options.estimate - The estimate record
 * @param {Array} options.lineItems - Line items array
 * @param {Object} options.company - Company record
 * @param {Object} options.settings - Effective settings (merged defaults + overrides)
 * @param {string} options.layout - 'email' or 'envelope'
 * @returns {Blob} PDF blob
 */
export async function generateEstimatePdf({ estimate, lineItems, company, settings, layout = 'email' }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 20
  const contentWidth = pageWidth - margin * 2

  if (layout === 'envelope') {
    return generateEnvelopeLayout(doc, { estimate, lineItems, company, settings, margin, contentWidth, pageWidth })
  }

  return generateEmailLayout(doc, { estimate, lineItems, company, settings, margin, contentWidth, pageWidth })
}

function generateEmailLayout(doc, { estimate, lineItems, company, settings, margin, contentWidth, pageWidth }) {
  let y = margin

  // Company header
  if (settings.show_logo && company?.logo_url) {
    // We can't easily load images in jsPDF without base64, so show company name prominently instead
    doc.setFontSize(20)
    doc.setTextColor(...COLORS.primary)
    doc.setFont('helvetica', 'bold')
    doc.text(company?.company_name || 'Company', margin, y)
    y += 8
  } else {
    doc.setFontSize(20)
    doc.setTextColor(...COLORS.primary)
    doc.setFont('helvetica', 'bold')
    doc.text(company?.company_name || 'Company', margin, y)
    y += 8
  }

  // Company contact info
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.muted)
  doc.setFont('helvetica', 'normal')
  if (settings.show_company_address && company?.address) {
    doc.text(company.address, margin, y)
    y += 4
  }
  if (settings.show_company_phone && company?.phone) {
    doc.text(company.phone, margin, y)
    y += 4
  }
  if (settings.show_company_email && company?.owner_email) {
    doc.text(company.owner_email, margin, y)
    y += 4
  }

  y += 6

  // Divider line
  doc.setDrawColor(...COLORS.border)
  doc.setLineWidth(0.5)
  doc.line(margin, y, pageWidth - margin, y)
  y += 8

  // ESTIMATE header with number and dates
  doc.setFontSize(22)
  doc.setTextColor(...COLORS.text)
  doc.setFont('helvetica', 'bold')
  doc.text('ESTIMATE', margin, y)

  // Estimate number on right
  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...COLORS.primary)
  const estimateNum = estimate.quote_id || `EST-${estimate.id}`
  doc.text(estimateNum, pageWidth - margin, y, { align: 'right' })
  y += 8

  // Dates row
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.muted)
  const dateStr = estimate.created_at ? new Date(estimate.created_at).toLocaleDateString() : '-'
  doc.text(`Date: ${dateStr}`, margin, y)

  if (estimate.expiration_date) {
    const expStr = new Date(estimate.expiration_date).toLocaleDateString()
    doc.text(`Expires: ${expStr}`, margin + 60, y)
  }

  if (settings.show_service_date && estimate.service_date) {
    const svcStr = new Date(estimate.service_date).toLocaleDateString()
    doc.text(`Service Date: ${svcStr}`, pageWidth - margin, y, { align: 'right' })
  }
  y += 10

  // Customer info block
  const customer = estimate.customer || estimate.lead
  doc.setFontSize(10)
  doc.setTextColor(...COLORS.text)
  doc.setFont('helvetica', 'bold')
  doc.text('Bill To:', margin, y)
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  const custName = customer?.name || customer?.customer_name || '-'
  doc.text(custName, margin, y)
  y += 4.5

  if (settings.show_customer_company && customer?.business_name) {
    doc.setTextColor(...COLORS.muted)
    doc.text(customer.business_name, margin, y)
    y += 4.5
  }
  if (customer?.address) {
    doc.setTextColor(...COLORS.muted)
    doc.text(customer.address, margin, y)
    y += 4.5
  }
  if (customer?.email) {
    doc.setTextColor(...COLORS.muted)
    doc.text(customer.email, margin, y)
    y += 4.5
  }

  // Technician
  if (settings.show_technician && estimate.technician?.name) {
    y += 2
    doc.setTextColor(...COLORS.text)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text(`Technician: `, margin, y)
    doc.setFont('helvetica', 'normal')
    doc.text(estimate.technician.name, margin + 25, y)
    y += 4
  }

  y += 6

  // Estimate name / summary
  if (estimate.estimate_name) {
    doc.setFontSize(12)
    doc.setTextColor(...COLORS.text)
    doc.setFont('helvetica', 'bold')
    doc.text(estimate.estimate_name, margin, y)
    y += 6
  }

  // Estimate message
  const message = estimate.estimate_message || settings.estimate_message
  if (message) {
    doc.setFontSize(9)
    doc.setTextColor(...COLORS.muted)
    doc.setFont('helvetica', 'normal')
    const messageLines = doc.splitTextToSize(message, contentWidth)
    doc.text(messageLines, margin, y)
    y += messageLines.length * 4 + 4
  }

  // Line items table
  y = drawLineItemsTable(doc, lineItems, settings, y, margin, contentWidth, pageWidth)

  y += 6

  // Totals
  const subtotal = lineItems.reduce((sum, l) => sum + (parseFloat(l.line_total) || 0), 0)
  const discount = parseFloat(estimate.discount) || 0
  const incentive = parseFloat(estimate.utility_incentive) || 0
  const total = subtotal - discount
  const outOfPocket = total - incentive

  const totalsX = pageWidth - margin - 70
  const totalsValX = pageWidth - margin

  doc.setFontSize(10)
  doc.setTextColor(...COLORS.text)
  doc.setFont('helvetica', 'normal')

  doc.text('Subtotal:', totalsX, y)
  doc.text(formatCurrency(subtotal), totalsValX, y, { align: 'right' })
  y += 5

  if (discount > 0) {
    doc.text('Discount:', totalsX, y)
    doc.text(`-${formatCurrency(discount)}`, totalsValX, y, { align: 'right' })
    y += 5
  }

  if (incentive > 0) {
    doc.setTextColor(...COLORS.greenAccent)
    doc.text('Utility Incentive:', totalsX, y)
    doc.text(`-${formatCurrency(incentive)}`, totalsValX, y, { align: 'right' })
    y += 5
  }

  // Total line
  doc.setDrawColor(...COLORS.border)
  doc.line(totalsX, y, pageWidth - margin, y)
  y += 5
  doc.setFontSize(13)
  doc.setTextColor(...COLORS.text)
  doc.setFont('helvetica', 'bold')
  doc.text('Total:', totalsX, y)
  doc.text(formatCurrency(total), totalsValX, y, { align: 'right' })
  y += 6

  if (incentive > 0) {
    doc.setFontSize(10)
    doc.setTextColor(...COLORS.greenAccent)
    doc.setFont('helvetica', 'normal')
    doc.text('Out of Pocket:', totalsX, y)
    doc.text(formatCurrency(outOfPocket), totalsValX, y, { align: 'right' })
    y += 6
  }

  // Footer
  y += 10
  if (y > 260) {
    doc.addPage()
    y = margin
  }
  doc.setFontSize(8)
  doc.setTextColor(...COLORS.muted)
  doc.setFont('helvetica', 'normal')
  doc.text('Thank you for your business!', pageWidth / 2, y, { align: 'center' })

  return doc.output('blob')
}

function generateEnvelopeLayout(doc, { estimate, lineItems, company, settings, margin, contentWidth, pageWidth }) {
  // Page 1: Envelope-optimized with address positioning for #9/#10 window envelopes
  let y = 15

  // Return address - top left corner
  doc.setFontSize(9)
  doc.setTextColor(...COLORS.text)
  doc.setFont('helvetica', 'bold')
  doc.text(company?.company_name || 'Company', 15, y)
  y += 4
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  if (company?.address) {
    const addrLines = doc.splitTextToSize(company.address, 70)
    doc.text(addrLines, 15, y)
    y += addrLines.length * 3.5
  }
  if (company?.phone) {
    doc.text(company.phone, 15, y)
    y += 3.5
  }

  // Customer address - positioned for standard window envelope
  // Window area: ~25mm from left, ~55mm from top
  const windowX = 25
  const windowY = 55

  doc.setFontSize(11)
  doc.setTextColor(...COLORS.text)
  doc.setFont('helvetica', 'bold')
  const customer = estimate.customer || estimate.lead
  const custName = customer?.name || customer?.customer_name || '-'
  doc.text(custName, windowX, windowY)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  let addrY = windowY + 5
  if (customer?.business_name) {
    doc.text(customer.business_name, windowX, addrY)
    addrY += 5
  }
  if (customer?.address) {
    const addrLines = doc.splitTextToSize(customer.address, 80)
    doc.text(addrLines, windowX, addrY)
    addrY += addrLines.length * 5
  }

  // Estimate number in top right
  doc.setFontSize(12)
  doc.setTextColor(...COLORS.primary)
  doc.setFont('helvetica', 'bold')
  const estimateNum = estimate.quote_id || `EST-${estimate.id}`
  doc.text(estimateNum, pageWidth - 20, 20, { align: 'right' })
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...COLORS.muted)
  const dateStr = estimate.created_at ? new Date(estimate.created_at).toLocaleDateString() : '-'
  doc.text(dateStr, pageWidth - 20, 25, { align: 'right' })

  // Page 2+: Full estimate content
  doc.addPage()
  const emailBlob = generateEmailLayout(new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' }), {
    estimate, lineItems, company, settings, margin: 20, contentWidth: doc.internal.pageSize.getWidth() - 40, pageWidth: doc.internal.pageSize.getWidth()
  })

  // Since we can't easily merge PDFs in jsPDF, we'll just put all content on page 2 of the same doc
  let contentY = 20
  // Re-draw email layout content on page 2
  contentY = drawEmailContentOnPage(doc, { estimate, lineItems, company, settings, margin: 20, pageWidth, contentWidth: pageWidth - 40, startY: contentY })

  return doc.output('blob')
}

function drawEmailContentOnPage(doc, { estimate, lineItems, company, settings, margin, pageWidth, contentWidth, startY }) {
  let y = startY

  // Company name
  doc.setFontSize(16)
  doc.setTextColor(...COLORS.primary)
  doc.setFont('helvetica', 'bold')
  doc.text(company?.company_name || 'Company', margin, y)
  y += 8

  // ESTIMATE header
  doc.setFontSize(18)
  doc.setTextColor(...COLORS.text)
  doc.text('ESTIMATE', margin, y)

  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...COLORS.primary)
  const estimateNum = estimate.quote_id || `EST-${estimate.id}`
  doc.text(estimateNum, pageWidth - margin, y, { align: 'right' })
  y += 8

  // Estimate name
  if (estimate.estimate_name) {
    doc.setFontSize(12)
    doc.setTextColor(...COLORS.text)
    doc.setFont('helvetica', 'bold')
    doc.text(estimate.estimate_name, margin, y)
    y += 6
  }

  // Message
  const message = estimate.estimate_message || settings.estimate_message
  if (message) {
    doc.setFontSize(9)
    doc.setTextColor(...COLORS.muted)
    doc.setFont('helvetica', 'normal')
    const msgLines = doc.splitTextToSize(message, contentWidth)
    doc.text(msgLines, margin, y)
    y += msgLines.length * 4 + 4
  }

  y += 2

  // Line items
  y = drawLineItemsTable(doc, lineItems, settings, y, margin, contentWidth, pageWidth)

  // Totals
  y += 6
  const subtotal = lineItems.reduce((sum, l) => sum + (parseFloat(l.line_total) || 0), 0)
  const discount = parseFloat(estimate.discount) || 0
  const incentive = parseFloat(estimate.utility_incentive) || 0
  const total = subtotal - discount

  const totalsX = pageWidth - margin - 70
  const totalsValX = pageWidth - margin

  doc.setFontSize(10)
  doc.setTextColor(...COLORS.text)
  doc.setFont('helvetica', 'normal')
  doc.text('Subtotal:', totalsX, y)
  doc.text(formatCurrency(subtotal), totalsValX, y, { align: 'right' })
  y += 5

  if (discount > 0) {
    doc.text('Discount:', totalsX, y)
    doc.text(`-${formatCurrency(discount)}`, totalsValX, y, { align: 'right' })
    y += 5
  }

  doc.setDrawColor(...COLORS.border)
  doc.line(totalsX, y, pageWidth - margin, y)
  y += 5
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text('Total:', totalsX, y)
  doc.text(formatCurrency(total), totalsValX, y, { align: 'right' })

  return y
}

function drawLineItemsTable(doc, lineItems, settings, startY, margin, contentWidth, pageWidth) {
  let y = startY

  // Check if we need a new page
  if (y > 240) {
    doc.addPage()
    y = 20
  }

  // Table header
  const showDesc = settings.show_line_descriptions
  const colWidths = showDesc
    ? { name: 55, desc: 45, qty: 20, price: 25, total: 25 }
    : { name: 80, qty: 25, price: 30, total: 30 }

  doc.setFillColor(...COLORS.headerBg)
  doc.rect(margin, y - 4, contentWidth, 8, 'F')
  doc.setFontSize(8)
  doc.setTextColor(...COLORS.muted)
  doc.setFont('helvetica', 'bold')

  let colX = margin + 2
  doc.text('ITEM', colX, y)
  colX += colWidths.name
  if (showDesc) {
    doc.text('DESCRIPTION', colX, y)
    colX += colWidths.desc
  }
  doc.text('QTY', colX + colWidths.qty - 2, y, { align: 'right' })
  colX += colWidths.qty
  doc.text('PRICE', colX + colWidths.price - 2, y, { align: 'right' })
  colX += colWidths.price
  doc.text('AMOUNT', colX + colWidths.total - 2, y, { align: 'right' })

  y += 6

  // Table rows
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)

  for (const line of lineItems) {
    if (y > 270) {
      doc.addPage()
      y = 20
    }

    colX = margin + 2
    doc.setTextColor(...COLORS.text)
    const itemName = line.item?.name || 'Item'
    const truncatedName = itemName.length > 30 ? itemName.substring(0, 28) + '...' : itemName
    doc.text(truncatedName, colX, y)
    colX += colWidths.name

    if (showDesc) {
      doc.setTextColor(...COLORS.muted)
      const desc = line.description || line.item?.description || ''
      const truncDesc = desc.length > 25 ? desc.substring(0, 23) + '...' : desc
      doc.text(truncDesc, colX, y)
      colX += colWidths.desc
    }

    doc.setTextColor(...COLORS.text)
    doc.text(String(line.quantity || 0), colX + colWidths.qty - 2, y, { align: 'right' })
    colX += colWidths.qty
    doc.text(formatCurrency(line.price), colX + colWidths.price - 2, y, { align: 'right' })
    colX += colWidths.price
    doc.setFont('helvetica', 'bold')
    doc.text(formatCurrency(line.line_total), colX + colWidths.total - 2, y, { align: 'right' })
    doc.setFont('helvetica', 'normal')

    y += 6

    // Light separator
    doc.setDrawColor(...COLORS.border)
    doc.setLineWidth(0.2)
    doc.line(margin, y - 2, pageWidth - margin, y - 2)
  }

  return y
}
