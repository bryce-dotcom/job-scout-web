// The customer-facing "Proposal Specifications" sheet.
//
// One page per product: our branding, the product's own name (SMBE stays —
// it is our line), the photo, and the real specifications. Never the
// manufacturer, the model number or the DLC listing number.
//
// Scrubbing is NOT the caller's job. Every render goes through publicSheet()
// inside this file, so there is no way to call the generator and forget. That
// matters more than it sounds: one un-scrubbed render is the whole risk of
// this feature.

import jsPDF from 'jspdf'
import { publicSheet, publicTitle, buildDenyTerms, findLeaks } from './specScrub'

const M = 15                 // page margin, mm
const INK = [44, 53, 48]     // theme text
const MUTED = [125, 138, 127]
const RULE = [214, 205, 184]
const ACCENT = [90, 99, 73]

/** Fetch an image as a data URL. Returns null rather than throwing — a
 *  missing photo must never stop a proposal going out. */
// What a rep is really attaching, counted off the estimate's own lines.
//
// 47 products in the catalogue have a manufacturer PDF on file but nothing
// extracted from it. Those are silently left out of the generated sheet, so a
// bare "7 products" is a lie on an estimate carrying nine — the count has to
// say which of the two numbers it is. Labour and service lines are skipped
// entirely: they have no specs to show and would otherwise inflate "missing"
// with rows nobody expected a spec for.
export function specCoverage(lineItems = []) {
  const seen = new Set()
  let products = 0, withSpecs = 0, manufacturerPdfs = 0
  for (const li of lineItems) {
    const p = li?.item
    if (!p || seen.has(p.id)) continue
    seen.add(p.id)
    const hasSpecs = p.datasheet_json?.specs?.length > 0
    const hasPdf = !!p.spec_sheet_url
    if (!hasSpecs && !hasPdf) continue
    products++
    if (hasSpecs) withSpecs++
    if (hasPdf) manufacturerPdfs++
  }
  return { products, withSpecs, missing: products - withSpecs, manufacturerPdfs }
}

// Generic fetch -> data URL. Named for its first use; it carries the
// manufacturer's PDF too, which is why it must not touch the bytes.
export async function imageToDataUrl(url) {
  if (!url || typeof url !== 'string') return null
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    return await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

function drawHeader(doc, company, logoDataUrl, pageW) {
  let y = M
  if (logoDataUrl) {
    try { doc.addImage(logoDataUrl, 'AUTO', M, y, 30, 12); } catch { /* bad image, skip */ }
  }
  doc.setFontSize(9)
  doc.setTextColor(...MUTED)
  doc.text(String(company?.company_name || ''), pageW - M, y + 5, { align: 'right' })
  doc.setFontSize(14)
  doc.setTextColor(...INK)
  doc.setFont('helvetica', 'bold')
  doc.text('Project Specifications', pageW - M, y + 12, { align: 'right' })
  y += 18
  doc.setDrawColor(...RULE)
  doc.line(M, y, pageW - M, y)
  return y + 8
}

/**
 * Render one product page. Returns the sheet that was actually published so a
 * caller (or a test) can assert on it.
 */
function drawProduct(doc, product, y, pageW, pageH, makers = []) {
  const sheet = publicSheet(product?.datasheet_json, product, undefined, makers)
  const colW = (pageW - M * 2)

  // Title — the product's own name. SMBE survives scrubbing by design.
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)
  doc.setTextColor(...INK)
  // publicTitle, not the raw name: some products are named after the maker
  // ("MES 8ft Linear Strip"), and a scrubbed spec table under a branded
  // heading achieves nothing.
  const deny = buildDenyTerms(product, product?.datasheet_json?.brand_terms || [], undefined, makers)
  // publicTitle returns '' when the only possible title is the maker's name.
  // Fall back to the product CATEGORY before the generic word, so a page reads
  // "LED Wall Pack" rather than "Product".
  const safeCategory = publicTitle(product?.product_category, deny)
  const title = doc.splitTextToSize(
    publicTitle(product?.name, deny) || safeCategory || 'Product',
    colW - 46,
  )
  doc.text(title, M, y)

  // Photo on the right, if we have one.
  let textTop = y + title.length * 6 + 2
  if (product?.imageDataUrl) {
    try { doc.addImage(product.imageDataUrl, 'AUTO', pageW - M - 40, y - 5, 40, 40) } catch { /* skip */ }
    textTop = Math.max(textTop, y + 8)
  }

  let cursor = textTop + 2
  const rowW = product?.imageDataUrl ? colW - 46 : colW

  if (sheet.construction) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...MUTED)
    const lines = doc.splitTextToSize(sheet.construction, rowW)
    doc.text(lines, M, cursor)
    cursor += lines.length * 4 + 4
  }

  // Specs, two columns of label/value.
  doc.setFontSize(9)
  const labelW = 52
  for (const spec of sheet.specs) {
    if (cursor > pageH - M - 12) {
      doc.addPage()
      cursor = M + 4
    }
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...INK)
    const label = doc.splitTextToSize(String(spec.label), labelW)
    doc.text(label, M, cursor)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MUTED)
    const value = doc.splitTextToSize(String(spec.value), rowW - labelW - 4)
    doc.text(value, M + labelW + 4, cursor)
    cursor += Math.max(label.length, value.length) * 4 + 2
  }

  if (sheet.applications.length) {
    cursor += 3
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...ACCENT)
    doc.text('Typical applications', M, cursor)
    cursor += 4
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MUTED)
    const apps = doc.splitTextToSize(sheet.applications.join('  •  '), rowW)
    doc.text(apps, M, cursor)
    cursor += apps.length * 4
  }

  return { cursor: cursor + 6, sheet }
}

/**
 * Build the combined specifications document for an estimate.
 *
 * products: [{ name, datasheet_json, manufacturer, model_number,
 *              dlc_listing_number, imageDataUrl }]
 *
 * Returns { doc, published, skipped, leaks }. `leaks` MUST be empty — it is
 * checked here rather than trusted, because the cost of being wrong is handing
 * a customer the manufacturer's name.
 */
export function buildSpecSheetPdf({ products = [], company = {}, logoDataUrl = null, knownManufacturers = [] } = {}) {
  // Fall back to the manufacturers present on these products when the caller
  // has no wider list.
  const makers = knownManufacturers.length ? knownManufacturers
    : [...new Set((products || []).map(p => String(p?.manufacturer || '').trim()).filter(m => m.length > 1))]
  const doc = new jsPDF({ unit: 'mm', format: 'letter' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()

  const usable = (products || []).filter(p => {
    const sheet = publicSheet(p?.datasheet_json, p, undefined, makers)
    return sheet.specs.length > 0
  })

  if (usable.length === 0) {
    return { doc: null, published: 0, skipped: (products || []).length, leaks: [] }
  }

  const leaks = []
  let published = 0
  usable.forEach((product, i) => {
    if (i > 0) doc.addPage()
    let y = drawHeader(doc, company, logoDataUrl, pageW)
    const { sheet } = drawProduct(doc, product, y, pageW, pageH, makers)
    const deny = buildDenyTerms(product, product?.datasheet_json?.brand_terms || [], undefined, makers)
    // Check the published sheet AND the product name we printed.
    const found = findLeaks({ ...sheet, name: publicTitle(product?.name, deny) }, deny)
    if (found.length) leaks.push({ product: product?.name, terms: found })
    published += 1
  })

  // Footer on every page.
  const total = doc.internal.getNumberOfPages()
  for (let p = 1; p <= total; p += 1) {
    doc.setPage(p)
    doc.setFontSize(7.5)
    doc.setTextColor(...MUTED)
    doc.text(
      'Specifications are provided for evaluation and are subject to change.',
      M, pageH - 8,
    )
    doc.text(`${p} / ${total}`, pageW - M, pageH - 8, { align: 'right' })
  }

  return { doc, published, skipped: (products || []).length - usable.length, leaks }
}
