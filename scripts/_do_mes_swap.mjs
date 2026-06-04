// Execute the MES vendor swap on HHH electrical bundles.
// For each of the 39 mapped products, update cost / manufacturer / model_number
// / description / markup_percent. Leave selling price, labor, and bundle wiring
// alone. Skip the 7 unmapped. Writes a detailed swap report at the end.
import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync } from 'node:fs'
import { config } from 'dotenv'
config()
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

const DRY_RUN = process.argv.includes('--dry-run')

const catalog = JSON.parse(readFileSync('scripts/_mes_catalog_with_colors.json', 'utf8'))
const greens = catalog.greenRows

let from = 0, all = []
for (;;) {
  const { data } = await sb.from('products_services')
    .select('*')
    .eq('company_id', 3)
    .range(from, from + 999)
  all.push(...(data || []))
  if (!data || data.length < 1000) break
  from += 1000
}
const bundles = all.filter(p => p.active && (
  p.type === 'Electrical Services (Bundles)' ||
  /\bbundle\b/i.test(p.product_category || '')
))

function wattsOf(s) { return [...(s||'').matchAll(/(\d{1,4})\s*W(?=[\s\/\-,]|$)/gi)].map(m => Number(m[1])) }
function fixtureOf(s) {
  const n = (s || '').toLowerCase()
  if (/2x4|2x2|1x4|backlit\s*panel|back-lit\s*panel/.test(n) && !/troffer/.test(n)) return 'panel'
  if (/troffer/.test(n)) return 'troffer'
  if (/vapor\s*tight/.test(n)) return 'vapor'
  if (/canopy/.test(n)) return 'canopy'
  if (/area\s*light|cobra|pole/.test(n)) return 'area'
  if (/mini\s*wall\s*pack|wall\s*pack/.test(n)) return 'wallpack'
  if (/strip\s*light|strip\s*fixture/.test(n)) return 'strip'
  if (/wrap/.test(n)) return 'wrap'
  if (/highbay|high\s*bay/.test(n)) return 'highbay'
  if (/tube|t8|t5/i.test(n)) return 'tube'
  return null
}
function formOf(s) {
  const n = (s || '').toLowerCase()
  if (/2x4|2\s*x\s*4/.test(n)) return '2x4'
  if (/2x2|2\s*x\s*2/.test(n)) return '2x2'
  if (/1x4|1\s*x\s*4/.test(n)) return '1x4'
  return null
}
const greenIdx = greens.map(m => ({
  ...m,
  fixture: fixtureOf((m.name||'') + ' ' + (m.section||'') + ' ' + (m.category||'')),
  form: formOf((m.name||'') + ' ' + (m.section||'')),
  watts: wattsOf(m.name),
  priceNum: Number((m.price || '').replace(/[^0-9.]/g, '')) || 0,
}))
function bestGreen(hhh) {
  const hWatts = wattsOf(hhh.name)
  const hFixture = fixtureOf(hhh.name)
  const hForm = formOf(hhh.name)
  if (!hFixture) return null
  const cands = greenIdx.filter(m => m.fixture === hFixture)
  if (!cands.length) return null
  let best = null, score = -1
  for (const m of cands) {
    const overlap = hWatts.filter(w => m.watts.includes(w)).length
    let s = overlap * 10
    if (hForm && m.form === hForm) s += 5
    if (overlap === 0) continue
    if (overlap === hWatts.length && hWatts.length > 0) s += 8
    if (s > score) { best = m; score = s }
  }
  return best
}

const swaps = []
const unmapped = []
for (const p of bundles) {
  const m = bestGreen(p)
  if (m) swaps.push({ p, m }); else unmapped.push(p)
}

console.log(`Plan: swap ${swaps.length} bundles · leave ${unmapped.length} unmapped\n${DRY_RUN ? '(DRY RUN — no DB writes)' : '(LIVE — writing to DB)'}\n`)

const results = []
for (const { p, m } of swaps) {
  const newCost = m.priceNum
  const sellPx = Number(p.unit_price) || 0
  // Cap at 999.99 — markup_percent is NUMERIC(5,2); some SMBE bundles roll lift/controls labor
  // into the selling price and compute >1000% markup against the fixture-only cost. Real dollar
  // margin is what matters; this is just the display field.
  const rawMarkup = newCost > 0 ? ((sellPx - newCost) / newCost) * 100 : null
  const newMarkup = rawMarkup == null ? null : Math.min(rawMarkup, 999.99)
  const markupCapped = rawMarkup != null && rawMarkup > 999.99

  // Strip "NNNNN - " prefix from MES name for cleaner display
  const cleanMesName = (m.name || '').replace(/^\d+\s*\d*\s*-\s*/, '').trim()

  // Description: capture full traceability so London/Alayda/Doug can audit
  const description = [
    `Vendor: MES (replaced LEDONE/ML/SMBE/WL — swapped 2026-05-21)`,
    `MES Product: ${m.name}`,
    `MES Section/Sheet: ${m.section || m.sheet || ''}`,
    `MES SKU: ${m.sku}`,
    `MES Cost: $${newCost.toFixed(2)}`,
    `Wattage Options: ${(m.watts || []).join('W / ') || '—'}${m.watts?.length ? 'W' : ''}`,
    `Original Cost: $${(Number(p.cost) || 0).toFixed(2)}  →  New Cost: $${newCost.toFixed(2)}`,
    `Selling Price (unchanged): $${sellPx.toFixed(2)}`,
    `Selected by: London (green-highlighted in MES pricing sheet)`,
    markupCapped ? `Note: actual markup is ${rawMarkup.toFixed(1)}% — capped to 999.99% in markup_percent field due to lift/controls labor rolled into selling price.` : '',
  ].filter(Boolean).join('\n')

  const patch = {
    cost: newCost,
    manufacturer: 'MES',
    model_number: m.sku,
    description,
    markup_percent: newMarkup,
    updated_at: new Date().toISOString(),
  }

  const before = {
    cost: Number(p.cost) || 0,
    manufacturer: p.manufacturer,
    model_number: p.model_number,
    markup_percent: p.markup_percent,
  }

  if (!DRY_RUN) {
    const { error } = await sb.from('products_services').update(patch).eq('id', p.id)
    if (error) {
      console.error(`✗ ${p.id} ${p.name.trim()}: ${error.message}`)
      results.push({ id: p.id, ok: false, error: error.message, before, after: patch, p, m })
      continue
    }
  }
  console.log(`✓ ${p.id}  cost $${before.cost.toFixed(2)} → $${newCost.toFixed(2)}  (markup ${before.markup_percent}% → ${newMarkup}%)  ${p.name.trim().slice(0, 50)}`)
  results.push({ id: p.id, ok: true, before, after: patch, p, m, newCost, sellPx, newMarkup })
}

// ============ REPORT ============
const ok = results.filter(r => r.ok)
const failed = results.filter(r => !r.ok)

const fmt = n => `$${Number(n || 0).toFixed(2)}`
const totalOldCost = ok.reduce((s, r) => s + r.before.cost, 0)
const totalNewCost = ok.reduce((s, r) => s + r.newCost, 0)
const totalSellPx = ok.reduce((s, r) => s + r.sellPx, 0)

let md = ''
md += `# MES Vendor Swap — HHH Electrical Bundles\n\n`
md += `**Date:** 2026-05-21\n`
md += `**Performed by:** Bryce (via JobScout admin tooling)\n`
md += `**For review by:** London, Alayda, Doug\n`
md += `**Mode:** ${DRY_RUN ? 'DRY RUN (no DB writes)' : 'LIVE — changes are in the database now'}\n\n`
md += `---\n\n`

md += `## Summary\n\n`
md += `- **${ok.length} of ${bundles.length}** active electrical bundles swapped to MES (London's green-highlighted picks)\n`
md += `- **${unmapped.length}** bundles had no green-approved MES match — **left untouched, still active, need a decision**\n`
md += `- **${failed.length}** swap errors\n\n`
md += `**Cost totals (across ${ok.length} swapped SKUs, qty=1 each):**\n`
md += `- Old cost total: **${fmt(totalOldCost)}**\n`
md += `- New cost total: **${fmt(totalNewCost)}**\n`
md += `- Net cost delta: **${fmt(totalNewCost - totalOldCost)}** (${totalNewCost < totalOldCost ? 'savings' : 'increase'})\n`
md += `- Selling price totals: **${fmt(totalSellPx)}** (unchanged — customers see the same prices)\n\n`

md += `## What changed on each swapped product\n\n`
md += `For each bundle below the following fields were updated **in place** (same product ID — no new rows, no deletions, no broken estimates):\n\n`
md += `- \`cost\` → new MES cost\n`
md += `- \`manufacturer\` → "MES"\n`
md += `- \`model_number\` → MES SKU (so it lines up with London's spreadsheet)\n`
md += `- \`description\` → full MES details + traceability note + original cost\n`
md += `- \`markup_percent\` → recalculated from new cost vs. existing selling price\n\n`
md += `**Unchanged:** selling price (\`unit_price\`), product name, type, business unit, group, allotted time hours, labor rate, taxable, active flag, utility-scope flag.\n\n`

md += `## Swap detail (sorted by largest savings → largest increase)\n\n`
md += `| Bundle ID | Product Name | Old Cost | New MES Cost | Δ Cost | Selling Price | New Markup | MES SKU | MES Product | MES Section | Watts |\n`
md += `|---|---|---:|---:|---:|---:|---:|---|---|---|---|\n`
const sorted = [...ok].sort((a, b) => (a.newCost - a.before.cost) - (b.newCost - b.before.cost))
for (const r of sorted) {
  const delta = r.newCost - r.before.cost
  const deltaStr = delta === 0 ? '$0.00' : (delta > 0 ? `+${fmt(delta)}` : `−${fmt(Math.abs(delta))}`)
  md += `| ${r.id} | ${r.p.name.trim()} | ${fmt(r.before.cost)} | ${fmt(r.newCost)} | ${deltaStr} | ${fmt(r.sellPx)} | ${r.newMarkup ?? '—'}% | ${r.m.sku} | ${r.m.name} | ${r.m.section || r.m.sheet} | ${(r.m.watts||[]).join('/')} |\n`
}

md += `\n## Needs attention — 7 bundles with no green-approved MES match\n\n`
md += `These were **not changed**. They are still active and sellable. London needs to decide for each one:\n\n`
md += `- Pick a non-green MES SKU (override), OR\n`
md += `- Pick a green MES SKU in a different fixture family (override), OR\n`
md += `- Deactivate the bundle (we stop selling it).\n\n`
md += `| Bundle ID | Product Name | Current Cost | Selling Price | Reason no green match |\n`
md += `|---|---|---:|---:|---|\n`
const reasons = {
  1954: 'No green wrap fixtures in MES sheet',
  1956: '4 green highbays in MES, but none cover the 145/160/175W range',
  2005: '1 green canopy in MES, but no wattage overlap with 25/50/75/100W',
  2007: '14 green panels (none at 30-72W 2x4)',
  2008: '14 green panels (none at 12-32W 2x2)',
  2012: '4 green highbays, none in the 220/275/300W range',
  2004: 'Controls/sensor add-on, not a fixture — no direct MES equivalent',
}
for (const p of unmapped) {
  md += `| ${p.id} | ${p.name.trim()} | ${fmt(p.cost)} | ${fmt(p.unit_price)} | ${reasons[p.id] || ''} |\n`
}

md += `\n## Caveat for the SMBE strip-light / wallpack variants\n\n`
md += `The 10 "SMBE Strip Light …" and "SMBE Adjustable Wall Pack … LIFT" bundles all had \`cost = $0\` in JobScout before this swap. Their selling prices ranged from $260 to $742 (lift, controls, relocate add-ons rolled in).\n\n`
md += `We set their \`cost\` to the MES fixture cost ($42 or $67.50 or $68 depending on SKU). That captures the **fixture portion** of the bundle, but the full job cost still includes the lift/controls/relocate labor that was historically rolled into the selling price.\n\n`
md += `**Action needed from London/Alayda/Doug:** confirm whether the lift/controls/relocate add-ons should also have a cost component captured, or whether keeping cost = fixture-only is OK (selling price will continue to absorb the install labor).\n\n`

md += `## Caveats & limitations\n\n`
md += `1. **Matching was automated** — based on fixture type (highbay / panel / wallpack / etc.) and wattage overlap with the green-highlighted MES rows. Spot-check the table above before pushing the next round of estimates.\n`
md += `2. **Existing estimates / invoices / job line items** that already reference these bundles are **untouched**. They retain whatever cost was stored at the time the line item was created (because line items snapshot the product, they don't live-reference it).\n`
md += `3. **Description field carries full traceability** so any rep clicking on a product in JobScout sees: original cost, new cost, MES SKU, MES section, and that London approved the pick.\n`
md += `4. **Markup percentages will look different** now. Where cost dropped a lot, markup % is higher (e.g., area lights went from 75% to ~245%). The dollar margin is what matters; the percent is just the derived view.\n`
md += `5. **Old vendor (LEDONE / ML / WL) is now only referenced via the description text**. The product records still use the human-friendly names in JobScout, but \`manufacturer\` is now "MES".\n\n`

md += `## Rollback plan\n\n`
md += `If London/Alayda/Doug reject this, every change is reversible from \`scripts/_mes_swap_results.json\` (snapshot of old values is saved in that file). One script run restores the prior \`cost\`, \`manufacturer\`, \`model_number\`, and \`markup_percent\` for each of the ${ok.length} bundles.\n\n`

md += `---\n\n*Generated by \`scripts/_do_mes_swap.mjs\` — see \`scripts/_mes_catalog_with_colors.json\` for the full MES catalog with London's color-coded picks.*\n`

writeFileSync('scripts/MES_SWAP_REPORT.md', md)
writeFileSync('scripts/_mes_swap_results.json', JSON.stringify({ ok, failed, unmapped: unmapped.map(p => ({id:p.id,name:p.name,cost:p.cost,unit_price:p.unit_price})) }, null, 2))

console.log(`\n✓ Wrote scripts/MES_SWAP_REPORT.md`)
console.log(`✓ Wrote scripts/_mes_swap_results.json (for rollback)`)
console.log(`\n${ok.length} swapped · ${failed.length} failed · ${unmapped.length} unmapped`)
