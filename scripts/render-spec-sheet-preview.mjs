// Render the customer specification sheet for a real estimate and save it,
// so it can be eyeballed before anyone sends one. Report-only by nature —
// it writes a PDF to disk and nothing else.
//
//   node scripts/render-spec-sheet-preview.mjs 4562 out.pdf

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { jsPDF } from 'jspdf'
import { publicSheet, buildDenyTerms, findLeaks } from '../supabase/functions/_shared/specScrub.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(
  fs.readFileSync(path.resolve(HERE, '../../job-scout-web/.env'), 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const quoteId = Number(process.argv[2] || 4562)
const outPath = process.argv[3] || path.resolve(HERE, '../spec-preview.pdf')

const { data: lines } = await sb.from('quote_lines')
  .select('item_id, item:products_services(id, name, image_url, manufacturer, model_number, dlc_listing_number, datasheet_json)')
  .eq('quote_id', quoteId)
const { data: companyRows } = await sb.from('companies').select('company_name').eq('id', 3)
const company = companyRows?.[0] || {}

const seen = new Set()
const products = []
for (const l of lines || []) {
  const p = l.item
  if (!p || seen.has(p.id)) continue
  seen.add(p.id)
  products.push(p)
}

// Fetch product photos as data URLs (node has no FileReader; do it directly).
for (const p of products) {
  if (!p.image_url) continue
  try {
    const res = await fetch(p.image_url)
    if (!res.ok) continue
    const buf = Buffer.from(await res.arrayBuffer())
    const ext = (p.image_url.split('.').pop() || 'png').toLowerCase()
    p.imageDataUrl = `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${buf.toString('base64')}`
  } catch { /* a missing photo must never stop a proposal */ }
}

// Same drawing logic as src/lib/specSheetPdf.js. Kept in the script only for
// the preview; the app imports the real module.
const M = 15
const doc = new jsPDF({ unit: 'mm', format: 'letter' })
const pageW = doc.internal.pageSize.getWidth()
const pageH = doc.internal.pageSize.getHeight()

const usable = products.filter(p => publicSheet(p.datasheet_json, p).specs.length > 0)
console.log(`quote ${quoteId}: ${products.length} products, ${usable.length} with specs\n`)

const allLeaks = []
usable.forEach((product, i) => {
  if (i > 0) doc.addPage()
  const sheet = publicSheet(product.datasheet_json, product)
  let y = M
  doc.setFontSize(9); doc.setTextColor(125, 138, 127)
  doc.text(String(company.company_name || ''), M, y + 5)
  doc.setFontSize(14); doc.setTextColor(44, 53, 48); doc.setFont('helvetica', 'bold')
  doc.text('Project Specifications', pageW - M, y + 5, { align: 'right' })
  y += 10
  doc.setDrawColor(214, 205, 184); doc.line(M, y, pageW - M, y)
  y += 8

  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(44, 53, 48)
  const title = doc.splitTextToSize(product.name || 'Product', pageW - M * 2 - 46)
  doc.text(title, M, y)
  if (product.imageDataUrl) {
    try { doc.addImage(product.imageDataUrl, 'AUTO', pageW - M - 40, y - 5, 40, 40) } catch { /* skip */ }
  }
  let cursor = y + title.length * 6 + 4
  const rowW = product.imageDataUrl ? pageW - M * 2 - 46 : pageW - M * 2

  if (sheet.construction) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(125, 138, 127)
    const l = doc.splitTextToSize(sheet.construction, rowW)
    doc.text(l, M, cursor); cursor += l.length * 4 + 4
  }
  doc.setFontSize(9)
  for (const spec of sheet.specs) {
    if (cursor > pageH - M - 14) { doc.addPage(); cursor = M + 4 }
    doc.setFont('helvetica', 'bold'); doc.setTextColor(44, 53, 48)
    const lab = doc.splitTextToSize(String(spec.label), 52)
    doc.text(lab, M, cursor)
    doc.setFont('helvetica', 'normal'); doc.setTextColor(125, 138, 127)
    const val = doc.splitTextToSize(String(spec.value), rowW - 56)
    doc.text(val, M + 56, cursor)
    cursor += Math.max(lab.length, val.length) * 4 + 2
  }
  if (sheet.applications.length) {
    cursor += 3
    doc.setFont('helvetica', 'bold'); doc.setTextColor(90, 99, 73)
    doc.text('Typical applications', M, cursor); cursor += 4
    doc.setFont('helvetica', 'normal'); doc.setTextColor(125, 138, 127)
    doc.text(doc.splitTextToSize(sheet.applications.join('  •  '), rowW), M, cursor)
  }

  const deny = buildDenyTerms(product, product.datasheet_json?.brand_terms || [])
  const leaks = findLeaks({ ...sheet, name: product.name }, deny)
  if (leaks.length) allLeaks.push({ product: product.name, leaks })
  console.log(`  ${String(product.id).padEnd(6)}${String(product.name).slice(0, 40).padEnd(42)}${String(sheet.specs.length).padStart(3)} specs  ${leaks.length ? 'LEAK: ' + leaks.join(', ') : 'clean'}`)
})

const total = doc.internal.getNumberOfPages()
for (let p = 1; p <= total; p += 1) {
  doc.setPage(p)
  doc.setFontSize(7.5); doc.setTextColor(125, 138, 127)
  doc.text('Specifications are provided for evaluation and are subject to change.', M, pageH - 8)
  doc.text(`${p} / ${total}`, pageW - M, pageH - 8, { align: 'right' })
}

fs.writeFileSync(outPath, Buffer.from(doc.output('arraybuffer')))
console.log(`\n  ${total} pages -> ${outPath}`)
console.log(`  LEAK TEST: ${allLeaks.length === 0 ? 'CLEAN across every product' : JSON.stringify(allLeaks)}`)
