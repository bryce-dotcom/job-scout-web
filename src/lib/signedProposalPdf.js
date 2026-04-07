// Generates the final signed proposal PDF that gets archived with the
// estimate and later the job. Uses the jspdf dependency already installed.
//
// Single export: generateSignedProposalPdf(args) -> Promise<Blob>

function formatCurrency(value) {
  const n = parseFloat(value) || 0
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

function stripMarkdown(md) {
  // Minimal markdown → plain text: we keep headings and bullets but drop
  // bold/italic markers so jsPDF can flow it as paragraphs.
  return (md || '')
    .replace(/\*\*/g, '')
    .replace(/(^|\s)_(.+?)_(\s|$)/g, '$1$2$3')
    .replace(/\r/g, '')
}

/**
 * @param {Object} args
 * @param {Object} args.quote
 * @param {Object[]} args.lineItems
 * @param {Object} args.company
 * @param {Object} args.customer
 * @param {string} args.legalTerms - markdown body
 * @param {Object} args.signature - { method: 'drawn'|'typed', imageDataUrl?: string, typedText?: string }
 * @param {Object} args.approver - { name: string, email: string }
 * @param {string} args.approvedAt - ISO string
 * @param {string} args.legalTermsHash - SHA-256 hex
 * @param {string} args.downPaymentLabel
 * @param {number} args.downPaymentAmount
 * @param {Object} [args.businessUnit]
 * @returns {Promise<Blob>}
 */
export async function generateSignedProposalPdf({
  quote,
  lineItems = [],
  company,
  customer,
  legalTerms = '',
  signature = {},
  approver = {},
  approvedAt,
  legalTermsHash = '',
  downPaymentLabel = 'Deposit',
  downPaymentAmount = 0,
  businessUnit,
}) {
  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })

  const PW = doc.internal.pageSize.getWidth()
  const PH = doc.internal.pageSize.getHeight()
  const M = 54 // 0.75"
  const CW = PW - M * 2
  let y = M

  const ACCENT = [90, 99, 73]
  const DARK = [44, 53, 48]
  const MUTED = [125, 138, 127]
  const RULE = [214, 205, 184]

  const senderName = businessUnit?.name || company?.company_name || company?.name || 'Contractor'
  const senderAddr = businessUnit?.address || company?.address || ''
  const senderPhone = businessUnit?.phone || company?.phone || ''
  const senderEmail = businessUnit?.email || company?.email || company?.owner_email || ''

  const customerName = customer?.name || customer?.business_name || quote?.customer_name || 'Client'
  const customerAddr = customer?.address || ''
  const customerEmail = customer?.email || approver?.email || ''

  const ensureSpace = (needed) => {
    if (y + needed > PH - M - 40) {
      doc.addPage()
      y = M
    }
  }

  const drawRule = () => {
    doc.setDrawColor(RULE[0], RULE[1], RULE[2])
    doc.setLineWidth(0.6)
    doc.line(M, y, PW - M, y)
    y += 10
  }

  // ---------- Letterhead ----------
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(ACCENT[0], ACCENT[1], ACCENT[2])
  doc.text(senderName, M, y + 6)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
  let hy = y + 22
  if (senderAddr) { doc.text(senderAddr, M, hy); hy += 11 }
  if (senderPhone) { doc.text(senderPhone, M, hy); hy += 11 }
  if (senderEmail) { doc.text(senderEmail, M, hy); hy += 11 }

  // Right side — proposal meta
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(DARK[0], DARK[1], DARK[2])
  doc.text('PROPOSAL', PW - M, y + 6, { align: 'right' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
  let ry = y + 22
  doc.text(`No. ${quote?.quote_id || `EST-${quote?.id || ''}`}`, PW - M, ry, { align: 'right' }); ry += 11
  doc.text(`Signed: ${approvedAt ? new Date(approvedAt).toLocaleDateString() : new Date().toLocaleDateString()}`, PW - M, ry, { align: 'right' }); ry += 11

  y = Math.max(hy, ry) + 6
  drawRule()

  // ---------- Customer block ----------
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(DARK[0], DARK[1], DARK[2])
  doc.text('PREPARED FOR', M, y)
  y += 14
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(11)
  doc.text(customerName, M, y); y += 13
  doc.setFontSize(9)
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
  if (customerAddr) { doc.text(customerAddr, M, y); y += 11 }
  if (customerEmail) { doc.text(customerEmail, M, y); y += 11 }
  y += 6

  // ---------- Scope of work / line items ----------
  ensureSpace(140)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(ACCENT[0], ACCENT[1], ACCENT[2])
  doc.text('Scope of Work', M, y)
  y += 14

  if (quote?.estimate_name) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(DARK[0], DARK[1], DARK[2])
    doc.text(quote.estimate_name, M, y); y += 12
  }
  if (quote?.summary) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
    for (const line of doc.splitTextToSize(quote.summary, CW)) {
      ensureSpace(12); doc.text(line, M, y); y += 11
    }
    y += 4
  }

  // Line items table
  if (lineItems.length > 0) {
    ensureSpace(26)
    doc.setFillColor(247, 245, 239)
    doc.rect(M, y - 8, CW, 22, 'F')
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(DARK[0], DARK[1], DARK[2])
    doc.text('Description', M + 8, y + 6)
    doc.text('Qty', M + CW - 190, y + 6, { align: 'right' })
    doc.text('Unit Price', M + CW - 100, y + 6, { align: 'right' })
    doc.text('Total', M + CW - 8, y + 6, { align: 'right' })
    y += 22

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    for (const li of lineItems) {
      ensureSpace(18)
      const name = li.item_name || li.description || 'Item'
      const qty = parseFloat(li.quantity) || 1
      const unit = parseFloat(li.unit_price || li.price) || 0
      const total = parseFloat(li.total || li.line_total) || (qty * unit)
      const nameLines = doc.splitTextToSize(name, CW - 220)
      doc.setTextColor(DARK[0], DARK[1], DARK[2])
      doc.text(nameLines[0], M + 8, y + 4)
      if (nameLines.length > 1) {
        doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
        for (let i = 1; i < nameLines.length; i++) {
          ensureSpace(11)
          doc.text(nameLines[i], M + 8, y + 4 + i * 10)
        }
      }
      doc.setTextColor(DARK[0], DARK[1], DARK[2])
      doc.text(String(qty), M + CW - 190, y + 4, { align: 'right' })
      doc.text(formatCurrency(unit), M + CW - 100, y + 4, { align: 'right' })
      doc.text(formatCurrency(total), M + CW - 8, y + 4, { align: 'right' })
      y += 6 + 12 * Math.max(nameLines.length, 1)
      doc.setDrawColor(RULE[0], RULE[1], RULE[2])
      doc.line(M, y - 2, PW - M, y - 2)
      y += 4
    }
  }

  // ---------- Totals ----------
  const subtotal = lineItems.reduce((s, l) => s + (parseFloat(l.total || l.line_total) || 0), 0)
    || parseFloat(quote?.quote_amount) || 0
  const discount = parseFloat(quote?.discount) || 0
  const incentive = parseFloat(quote?.utility_incentive) || 0
  const contractTotal = Math.max(0, subtotal - discount - incentive)

  ensureSpace(80)
  y += 8
  const tx = M + CW - 200
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
  doc.text('Subtotal', tx, y)
  doc.setTextColor(DARK[0], DARK[1], DARK[2])
  doc.text(formatCurrency(subtotal), M + CW - 8, y, { align: 'right' })
  y += 14
  if (discount > 0) {
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
    doc.text('Discount', tx, y)
    doc.setTextColor(DARK[0], DARK[1], DARK[2])
    doc.text(`- ${formatCurrency(discount)}`, M + CW - 8, y, { align: 'right' })
    y += 14
  }
  if (incentive > 0) {
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
    doc.text('Utility Incentive', tx, y)
    doc.setTextColor(DARK[0], DARK[1], DARK[2])
    doc.text(`- ${formatCurrency(incentive)}`, M + CW - 8, y, { align: 'right' })
    y += 14
  }
  doc.setDrawColor(RULE[0], RULE[1], RULE[2])
  doc.line(tx - 4, y - 4, PW - M, y - 4)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(ACCENT[0], ACCENT[1], ACCENT[2])
  doc.text('Contract Total', tx, y + 8)
  doc.text(formatCurrency(contractTotal), M + CW - 8, y + 8, { align: 'right' })
  y += 22

  // Down payment callout
  if (downPaymentAmount > 0) {
    ensureSpace(34)
    doc.setFillColor(247, 245, 239)
    doc.setDrawColor(RULE[0], RULE[1], RULE[2])
    doc.rect(M, y, CW, 26, 'FD')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(DARK[0], DARK[1], DARK[2])
    doc.text(`${downPaymentLabel}: ${formatCurrency(downPaymentAmount)} due upon acceptance`, M + 12, y + 17)
    y += 36
  }

  // ---------- Terms & Conditions ----------
  ensureSpace(60)
  y += 4
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(ACCENT[0], ACCENT[1], ACCENT[2])
  doc.text('Terms & Conditions', M, y)
  y += 14

  const termsText = stripMarkdown(legalTerms)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(DARK[0], DARK[1], DARK[2])
  for (const rawLine of termsText.split('\n')) {
    const line = rawLine.replace(/^#+\s*/, '').trimEnd()
    const isHeading = /^#{1,6}\s/.test(rawLine)
    if (line === '' && !isHeading) { y += 6; continue }
    if (isHeading) {
      ensureSpace(20)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(10)
      doc.setTextColor(DARK[0], DARK[1], DARK[2])
      doc.text(line, M, y); y += 13
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      continue
    }
    const wrapped = doc.splitTextToSize(line, CW)
    for (const w of wrapped) {
      ensureSpace(11)
      doc.text(w, M, y); y += 11
    }
  }

  // ---------- Signature block ----------
  ensureSpace(140)
  y += 16
  drawRule()
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(ACCENT[0], ACCENT[1], ACCENT[2])
  doc.text('Signature', M, y)
  y += 14

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
  doc.text('By signing below the Client acknowledges and agrees to the terms above.', M, y)
  y += 16

  const sigBoxW = CW * 0.55
  const sigBoxH = 70
  doc.setDrawColor(RULE[0], RULE[1], RULE[2])
  doc.rect(M, y, sigBoxW, sigBoxH)
  try {
    if (signature?.method === 'drawn' && signature?.imageDataUrl) {
      doc.addImage(signature.imageDataUrl, 'PNG', M + 6, y + 6, sigBoxW - 12, sigBoxH - 12, undefined, 'FAST')
    } else if (signature?.method === 'typed' && signature?.typedText) {
      doc.setFont('times', 'italic')
      doc.setFontSize(26)
      doc.setTextColor(13, 27, 42)
      doc.text(signature.typedText, M + 14, y + 45)
      doc.setFont('helvetica', 'normal')
    }
  } catch (err) {
    console.warn('[signedProposalPdf] signature render failed', err)
  }

  doc.setFontSize(8)
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
  doc.text('Client Signature', M, y + sigBoxH + 12)

  // Signer details (right column)
  const detailsX = M + sigBoxW + 24
  const detailsW = CW - sigBoxW - 24
  let dy = y + 4
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
  doc.setTextColor(DARK[0], DARK[1], DARK[2])
  doc.text('Printed Name', detailsX, dy); dy += 11
  doc.setFont('helvetica', 'normal'); doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
  doc.text(approver?.name || '-', detailsX, dy); dy += 14

  doc.setFont('helvetica', 'bold'); doc.setTextColor(DARK[0], DARK[1], DARK[2])
  doc.text('Email', detailsX, dy); dy += 11
  doc.setFont('helvetica', 'normal'); doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
  const emailLines = doc.splitTextToSize(approver?.email || '-', detailsW)
  for (const el of emailLines) { doc.text(el, detailsX, dy); dy += 11 }
  dy += 3

  doc.setFont('helvetica', 'bold'); doc.setTextColor(DARK[0], DARK[1], DARK[2])
  doc.text('Date', detailsX, dy); dy += 11
  doc.setFont('helvetica', 'normal'); doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
  doc.text(approvedAt ? new Date(approvedAt).toLocaleString() : new Date().toLocaleString(), detailsX, dy); dy += 11

  y += sigBoxH + 22

  // ---------- Footer with integrity hash ----------
  doc.setFontSize(7)
  doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
  const pageCount = doc.internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    const footerY = PH - 26
    doc.setDrawColor(RULE[0], RULE[1], RULE[2])
    doc.line(M, footerY - 8, PW - M, footerY - 8)
    doc.text(`Terms hash (SHA-256): ${legalTermsHash || '-'}`, M, footerY)
    doc.text(`${senderName}  |  Page ${i} of ${pageCount}`, PW - M, footerY, { align: 'right' })
  }

  return doc.output('blob')
}
