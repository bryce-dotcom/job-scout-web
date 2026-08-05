// Fill datasheet_json from the manufacturer spec sheets.
//
// Report-only by default. --write persists, and --write also requires
// --approve, because what this produces ends up on a customer's proposal.
//
// Pipeline per product: download spec_sheet_url -> pdfjs text -> the
// extract-product-specs edge function (metered through _shared/anthropic.ts)
// -> datasheet_json. The RAW extraction is stored, including brand_terms;
// scrubbing happens at render time via specScrub so the internal view keeps
// the real datasheet.
//
//   node scripts/extract-product-specs.mjs                 # report
//   node scripts/extract-product-specs.mjs --limit 5       # try a few
//   node scripts/extract-product-specs.mjs --write --approve
//   node scripts/extract-product-specs.mjs --ids 1374,1389

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ENV_FILE = path.resolve(HERE, '../../job-scout-web/.env')
const env = Object.fromEntries(
  fs.readFileSync(ENV_FILE, 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const COMPANY_ID = 3

const arg = (name, fallback = null) => {
  const i = process.argv.indexOf(name)
  return i >= 0 ? (process.argv[i + 1] ?? true) : fallback
}
const WRITE = process.argv.includes('--write')
const APPROVE = process.argv.includes('--approve')
const LIMIT = Number(arg('--limit', 0)) || 0
const IDS = String(arg('--ids', '') || '').split(',').map(s => Number(s.trim())).filter(Boolean)

if (WRITE && !APPROVE) {
  console.log('\n  --write needs --approve too. This output reaches customers; refusing.\n')
  process.exit(1)
}

const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')

async function pdfText(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = new Uint8Array(await res.arrayBuffer())
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise
  let out = ''
  for (let i = 1; i <= doc.numPages; i += 1) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    out += content.items.map(x => x.str).join(' ') + '\n'
  }
  return { text: out, pages: doc.numPages }
}

let query = sb.from('products_services')
  .select('id, name, spec_sheet_url, image_url, manufacturer, model_number, dlc_listing_number, datasheet_json')
  .eq('company_id', COMPANY_ID)
  .not('spec_sheet_url', 'is', null)
  .order('id')
if (IDS.length) query = query.in('id', IDS)
const { data: products, error } = await query
if (error) { console.error(error.message); process.exit(1) }

const targets = LIMIT ? products.slice(0, LIMIT) : products
const hasSpecs = p => p?.datasheet_json && Array.isArray(p.datasheet_json.specs) && p.datasheet_json.specs.length > 0

console.log(`\n${products.length} products have a spec sheet; ${products.filter(hasSpecs).length} already extracted.`)
console.log(`Processing ${targets.length}${WRITE ? ' (WRITING)' : ' (report only)'}\n`)

const results = { ok: 0, skipped: 0, scanned: 0, failed: 0, noText: 0 }
const failures = []

for (const p of targets) {
  const label = `${String(p.id).padEnd(6)}${String(p.name || '').slice(0, 40).padEnd(42)}`
  if (hasSpecs(p) && !process.argv.includes('--force')) {
    results.skipped += 1
    console.log(`  ${label}already has ${p.datasheet_json.specs.length} specs — skipped`)
    continue
  }
  try {
    const { text, pages } = await pdfText(p.spec_sheet_url)
    if (text.trim().length < 200) {
      // A scanned, image-only sheet. Flag it for manual entry instead of
      // asking the model to invent specifications.
      results.noText += 1
      failures.push({ id: p.id, name: p.name, why: `image-only scan (${text.trim().length} chars, ${pages}p)` })
      console.log(`  ${label}SCAN — needs manual entry`)
      continue
    }

    const res = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/extract-product-specs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
      body: JSON.stringify({ specText: text, productName: p.name, pdfUrl: p.spec_sheet_url, companyId: COMPANY_ID }),
    })
    const json = await res.json()
    if (!res.ok || json.error) {
      results.failed += 1
      failures.push({ id: p.id, name: p.name, why: json.detail || json.error || `HTTP ${res.status}` })
      console.log(`  ${label}FAILED — ${(json.detail || json.error || res.status).toString().slice(0, 60)}`)
      continue
    }

    const payload = {
      specs: json.specs || [],
      applications: json.applications || [],
      construction: json.construction || '',
      brand_terms: json.brand_terms || [],
      source: { url: p.spec_sheet_url, model: json.source?.model || null, chars: text.length, pages },
    }
    results.ok += 1
    console.log(`  ${label}${String(payload.specs.length).padStart(3)} specs, ${payload.brand_terms.length} brand terms`)

    if (WRITE) {
      const { error: upErr } = await sb.from('products_services')
        .update({ datasheet_json: payload })
        .eq('id', p.id)
        .eq('company_id', COMPANY_ID)
      if (upErr) console.log(`         write failed: ${upErr.message}`)
    }
  } catch (e) {
    results.failed += 1
    failures.push({ id: p.id, name: p.name, why: e.message })
    console.log(`  ${label}ERROR — ${e.message.slice(0, 60)}`)
  }
}

console.log(`\n  extracted ${results.ok} · skipped ${results.skipped} · scans needing manual entry ${results.noText} · failed ${results.failed}`)
if (failures.length) {
  console.log('\n  needs attention:')
  for (const f of failures) console.log(`    ${String(f.id).padEnd(6)}${String(f.name).slice(0, 38).padEnd(40)}${f.why}`)
}
// Never let a bounded run read as full coverage.
if (LIMIT && targets.length < products.length) {
  console.log(`\n  NOTE: --limit ${LIMIT} stopped short — ${products.length - targets.length} products not attempted.`)
}
if (!WRITE) console.log('\n  Report only. Re-run with --write --approve to persist.\n')
