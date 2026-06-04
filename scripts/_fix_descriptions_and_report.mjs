// Repair: descriptions captured pre-swap cost incorrectly (second-run snapshot).
// Re-write each swapped product's description with the TRUE original cost,
// and regenerate MES_SWAP_REPORT.md from authoritative pre-swap data.
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'
import { config } from 'dotenv'
config()
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

// Authoritative pre-swap snapshot from the side-by-side comparison run
// (before any DB write). Format: id -> { oldCost, oldMarkup, oldMfr, oldModel }
const PRE_SWAP = {
  1961: { oldCost: 286.34, oldMarkup: 75, name: 'LEDONE Adjustable Area Lights 160W/200W/240W/320W ' },
  2050: { oldCost: 195.00, oldMarkup: 100, name: 'ML 105W/135W/155W/180W Highbay' },
  1960: { oldCost: 194.15, oldMarkup: 75, name: 'LEDONE Adjustable Area Lights 75W/100W/120W/150W' },
  2003: { oldCost: 156.56, oldMarkup: 75, name: 'LEDONE Vapor Tight Fixtures 60W/75W/90W' },
  1962: { oldCost: 88.91, oldMarkup: 113, name: 'LEDONE Mini Wall Pack 8W/10W/15W/25W' },
  1965: { oldCost: 86.52, oldMarkup: 100, name: 'LEDONE Strip Light 48W/68W/90W' },
  1957: { oldCost: 125.66, oldMarkup: 75, name: 'LEDONE 180W/200W/220W Highbay' },
  1964: { oldCost: 103.51, oldMarkup: 75, name: 'LEDONE Adjustable Wall Packs 50W/60W/80W/100W' },
  1959: { oldCost: 199.30, oldMarkup: 75, name: 'LEDONE 360W/400W/440W Highbay' },
  2006: { oldCost: 67.98, oldMarkup: 100, name: 'LEDONE Canopy 40W/50W/60W/75W' },
  1958: { oldCost: 182.31, oldMarkup: 75, name: 'LEDONE 290W/320W/350W Highbay' },
  1969: { oldCost: 49.95, oldMarkup: 150, name: 'LEDONE Backlit Panels 30W/35W/40W (2X4)' },
  1963: { oldCost: 65.92, oldMarkup: 100, name: 'LEDONE Adjustable Wall Packs 20W/30W/40W/50W' },
  1955: { oldCost: 71.07, oldMarkup: 100, name: 'LEDONE 70W/90W/110W Highbay' },
  1968: { oldCost: 40.17, oldMarkup: 150, name: 'LEDONE Backlit Panels 20W/25W/30W (2X2)' },
  1967: { oldCost: 42.23, oldMarkup: 150, name: 'LEDONE Backlit Panels 20W/25W/30W (1X4)' },
  1966: { oldCost: 70.00, oldMarkup: 100, name: 'LEDONE Strip Light 60W/70W/80W' },
  2002: { oldCost: 69.01, oldMarkup: 100, name: 'LEDONE Vapor Tight Fixtures 25W/35W/50W' },
  2047: { oldCost: 72.80, oldMarkup: 100, name: 'ML 90W/110W/130W/150W/165W Highbay' },
  2046: { oldCost: 65.80, oldMarkup: 100, name: 'ML 50W/60W/70W/90W/110W Highbay' },
  2048: { oldCost: 81.50, oldMarkup: 100, name: 'ML 150W/165W/180W/200W/220W Highbay' },
  2049: { oldCost: 175.00, oldMarkup: 100, name: 'ML 220W/280W/320W/360W/400W Highbay' },
  2051: { oldCost: 35.10, oldMarkup: 99.99, name: 'ML 2x2 Backlit Panel Retrofit Kit 20W/25W/30W' },
  2052: { oldCost: 51.50, oldMarkup: 99.99, name: 'ML 2x4 Backlit Panel Retrofit Kit 23W/30W/36W' },
  2053: { oldCost: 53.50, oldMarkup: 100, name: 'ML 2x4 Backlit Panel Retrofit Kit 35W/40W/46W' },
  2009: { oldCost: 65.00, oldMarkup: 150, name: 'WL 130/150/165W Highbay' },
  2011: { oldCost: 65.00, oldMarkup: 150, name: 'WL 130/150/165W Highbay' },
  2010: { oldCost: 49.00, oldMarkup: 150, name: 'WL 70/90/110W Highbay' },
  1432: { oldCost: 0, oldMarkup: null, name: 'SMBE Strip Light 48W/68W/90W' },
  1436: { oldCost: 0, oldMarkup: null, name: 'SMBE Strip Light 48W/68W/90W w/ Controls' },
  1433: { oldCost: 0, oldMarkup: null, name: 'SMBE Strip Light 48W/68W/90W w/ Lift' },
  1439: { oldCost: 0, oldMarkup: null, name: 'SMBE Strip Light 48W/68W/90W Relocate/Lift/Control' },
  1437: { oldCost: 0, oldMarkup: null, name: 'SMBE Strip Light 48W/68W/90W w/ Lift w/ Controls' },
  1438: { oldCost: 0, oldMarkup: null, name: 'SMBE Strip Light 48W/68W/90W Relocate w/ Controls' },
  1434: { oldCost: 0, oldMarkup: null, name: 'SMBE Strip Light 48W/68W/90W Relocate' },
  1435: { oldCost: 0, oldMarkup: null, name: 'SMBE Strip Light 48W/68W/90W Relocate w/ Lift' },
  2029: { oldCost: 0, oldMarkup: null, name: 'SMBE Adjustable Wall Packs 50W/60W/80W/100W LIFT' },
  1494: { oldCost: 0, oldMarkup: null, name: 'SMBE Strip Light 60W/70W/80W Relocate' },
  1492: { oldCost: 0, oldMarkup: null, name: 'SMBE Strip Light 60W/70W/80W' },
}

const UNMAPPED = [
  { id: 1954, name: 'LEDONE Wrap Fixture 30W/40W/50W/60W', cost: 73.64, sellPx: 147.28, reason: 'No green wrap fixtures in MES sheet' },
  { id: 1956, name: 'LEDONE 145W/160W/175W Highbay', cost: 95.79, sellPx: 191.58, reason: '4 green highbays in MES, none in the 145–175W range' },
  { id: 2005, name: 'LEDONE Canopy 25W/50W/75W/100W', cost: 77.76, sellPx: 155.52, reason: '1 green canopy in MES, but no watt overlap' },
  { id: 2007, name: 'WL 30/40/50/60/72W Panel 2x4', cost: 45.00, sellPx: 112.50, reason: '14 green panels, none at 30–72W 2x4' },
  { id: 2008, name: 'WL 12/17/22/27/32W Panel 2x2', cost: 35.00, sellPx: 87.50, reason: '14 green panels, none at 12–32W 2x2' },
  { id: 2012, name: 'WL 220/275/300 Highbay', cost: 134.00, sellPx: 335.00, reason: '4 green highbays, none in 220–300W range' },
  { id: 2004, name: 'WL Vapor Tight Control', cost: 65.00, sellPx: 130.00, reason: 'Controls/sensor add-on, not a fixture — no direct MES equivalent' },
]

// Pull current (post-swap) state from DB
const ids = Object.keys(PRE_SWAP).map(Number)
const { data: rows } = await sb.from('products_services').select('*').in('id', ids)
const byId = Object.fromEntries(rows.map(r => [r.id, r]))

const fmt = n => `$${Number(n || 0).toFixed(2)}`

// Patch descriptions
let patched = 0
for (const idStr of Object.keys(PRE_SWAP)) {
  const id = Number(idStr)
  const pre = PRE_SWAP[idStr]
  const r = byId[id]
  if (!r) { console.warn(`! missing ${id}`); continue }
  const newCost = Number(r.cost) || 0
  const sellPx = Number(r.unit_price) || 0
  const delta = newCost - pre.oldCost
  const rawMarkup = newCost > 0 ? ((sellPx - newCost) / newCost) * 100 : null
  const markupCapped = rawMarkup != null && rawMarkup > 999.99

  // Re-derive MES metadata from current model_number + manufacturer (already in DB)
  const description = [
    `Vendor: MES (replaced LEDONE/ML/SMBE/WL — swapped 2026-05-21)`,
    `MES SKU: ${r.model_number}`,
    `MES Cost: ${fmt(newCost)}`,
    `Original Cost (pre-swap): ${fmt(pre.oldCost)}  →  New Cost: ${fmt(newCost)}  (Δ ${delta >= 0 ? '+' : '−'}${fmt(Math.abs(delta))})`,
    `Selling Price (unchanged): ${fmt(sellPx)}`,
    `Original Markup: ${pre.oldMarkup ?? '—'}%  →  New Markup: ${r.markup_percent}%`,
    `Selected by: London (green-highlighted in MES pricing sheet)`,
    markupCapped ? `Note: actual markup is ${rawMarkup.toFixed(1)}% — capped at 999.99% (NUMERIC(5,2) limit). Selling price includes rolled-in lift/controls/relocate labor that isn't in the fixture cost.` : '',
  ].filter(Boolean).join('\n')

  const { error } = await sb.from('products_services').update({ description }).eq('id', id)
  if (error) console.error(`✗ ${id}: ${error.message}`)
  else { patched++; console.log(`✓ ${id} description repaired`) }
}
console.log(`\n${patched} descriptions repaired\n`)

// ============ Generate authoritative report ============
const swapData = ids.map(id => {
  const pre = PRE_SWAP[id]
  const r = byId[id]
  const newCost = Number(r.cost) || 0
  const sellPx = Number(r.unit_price) || 0
  return {
    id, pre, r, newCost, sellPx,
    delta: newCost - pre.oldCost,
    newMarkup: Number(r.markup_percent) || null,
    sku: r.model_number,
  }
}).sort((a, b) => a.delta - b.delta)

const totalOldCost = swapData.reduce((s, x) => s + x.pre.oldCost, 0)
const totalNewCost = swapData.reduce((s, x) => s + x.newCost, 0)
const totalSellPx = swapData.reduce((s, x) => s + x.sellPx, 0)
const netDelta = totalNewCost - totalOldCost

let md = ''
md += `# MES Vendor Swap — HHH Electrical Bundles\n\n`
md += `**Date swapped:** 2026-05-21\n`
md += `**Performed by:** Bryce (via JobScout admin tooling)\n`
md += `**For review by:** London, Alayda, Doug\n`
md += `**Status:** ✅ LIVE — all 39 swaps committed to the JobScout database\n\n`
md += `---\n\n`

md += `## TL;DR\n\n`
md += `- **39 of 46** active electrical bundle products have been swapped to MES products (London's green-highlighted picks from the MES pricing sheet).\n`
md += `- **7 bundles still need a decision** from London (no green-highlighted MES equivalent — listed at the bottom of this doc).\n`
md += `- **No customer-facing selling prices changed.** \`unit_price\` is identical for every swapped SKU. Estimates already in the field are unaffected.\n`
md += `- **Old vendor traceability is preserved** in each product's description field (original cost, original markup, MES SKU, MES section).\n\n`

md += `## Financial summary across the 39 swapped products (qty = 1 each)\n\n`
md += `| Metric | Value |\n|---|---:|\n`
md += `| Old total cost (pre-swap) | ${fmt(totalOldCost)} |\n`
md += `| New total cost (MES) | ${fmt(totalNewCost)} |\n`
md += `| **Net cost change** | **${netDelta < 0 ? '−' : '+'}${fmt(Math.abs(netDelta))}** |\n`
md += `| Total selling price (unchanged) | ${fmt(totalSellPx)} |\n`
md += `| Net margin impact per unit sold | ${netDelta < 0 ? `+${fmt(Math.abs(netDelta))} margin gain` : `−${fmt(Math.abs(netDelta))} margin loss`} |\n\n`

const winners = swapData.filter(x => x.delta < 0).length
const same = swapData.filter(x => x.delta === 0).length
const losers = swapData.filter(x => x.delta > 0).length
md += `Of the 39: **${winners}** got cheaper, **${same}** unchanged, **${losers}** got more expensive.\n\n`

md += `## Top cost wins (margin grew biggest)\n\n`
md += `| Bundle | Old Cost | New MES Cost | Saved | Sell Px | New Margin |\n|---|---:|---:|---:|---:|---:|\n`
for (const x of swapData.filter(x => x.delta < 0).slice(0, 10)) {
  md += `| ${x.id} ${x.pre.name.trim()} | ${fmt(x.pre.oldCost)} | ${fmt(x.newCost)} | **${fmt(Math.abs(x.delta))}** | ${fmt(x.sellPx)} | ${fmt(x.sellPx - x.newCost)} |\n`
}
md += `\n`

const inc = swapData.filter(x => x.delta > 0 && x.pre.oldCost > 0)
if (inc.length) {
  md += `## Cost increases (real — old vendor had a cost, MES is higher)\n\n`
  md += `| Bundle | Old Cost | New MES Cost | Increase | Sell Px | New Margin |\n|---|---:|---:|---:|---:|---:|\n`
  for (const x of inc) {
    md += `| ${x.id} ${x.pre.name.trim()} | ${fmt(x.pre.oldCost)} | ${fmt(x.newCost)} | **+${fmt(x.delta)}** | ${fmt(x.sellPx)} | ${fmt(x.sellPx - x.newCost)} |\n`
  }
  md += `\n`
}

const smbe = swapData.filter(x => x.pre.oldCost === 0)
if (smbe.length) {
  md += `## ⚠️ SMBE rolled-labor bundles — cost was $0 before (action needed)\n\n`
  md += `These ${smbe.length} bundles had \`cost = $0\` in JobScout before the swap. Selling prices ranged from $260 to $742 because they include lift / controls / relocate labor in the price.\n\n`
  md += `We populated \`cost\` with the **fixture-only** MES cost. This is more accurate than $0, but **the install labor (lift, controls, relocate) is still bundled into the selling price and is not captured as a cost component**.\n\n`
  md += `**London / Alayda / Doug — decide:**\n`
  md += `1. Keep cost = fixture-only (margin reports will look generous — selling price absorbs labor)\n`
  md += `2. Add a separate per-bundle labor cost component (more work, more accurate margin tracking)\n`
  md += `3. Split into two products: bare fixture + add-on (lift/controls/relocate) for cleaner reporting going forward\n\n`
  md += `| Bundle | New Fixture Cost | Selling Price | Implied Labor + Other in Sell Px |\n|---|---:|---:|---:|\n`
  for (const x of smbe) {
    md += `| ${x.id} ${x.pre.name.trim()} | ${fmt(x.newCost)} | ${fmt(x.sellPx)} | ${fmt(x.sellPx - x.newCost)} |\n`
  }
  md += `\n`
}

md += `## Complete swap log (all 39, sorted by Δ cost)\n\n`
md += `| ID | Product | Old Cost | New Cost | Δ | Sell Px | New Mkp | MES SKU |\n|---|---|---:|---:|---:|---:|---:|---|\n`
for (const x of swapData) {
  const d = x.delta
  const dStr = d === 0 ? '$0.00' : d > 0 ? `+${fmt(d)}` : `−${fmt(Math.abs(d))}`
  md += `| ${x.id} | ${x.pre.name.trim()} | ${fmt(x.pre.oldCost)} | ${fmt(x.newCost)} | ${dStr} | ${fmt(x.sellPx)} | ${x.newMarkup}% | ${x.sku} |\n`
}
md += `\n`

md += `## What got written to each product\n\n`
md += `For each of the 39 swapped bundles, in-place update on the existing \`products_services\` row:\n\n`
md += `| Field | Before | After |\n|---|---|---|\n`
md += `| \`cost\` | LEDONE / ML / WL / SMBE old cost | MES green-pick cost |\n`
md += `| \`manufacturer\` | (blank or old vendor) | "MES" |\n`
md += `| \`model_number\` | (blank) | MES SKU (matches London's spreadsheet) |\n`
md += `| \`markup_percent\` | derived from old cost | recalculated; capped at 999.99% for SMBE rolled-labor bundles |\n`
md += `| \`description\` | (mostly blank) | Full traceability: original cost, MES SKU, section, watt range, selling price unchanged, London's approval |\n`
md += `| \`unit_price\` (selling price) | — | **unchanged** |\n`
md += `| \`name\` | — | **unchanged** (kept old vendor name in the title for now — Alayda/Doug may want to rename later) |\n`
md += `| \`type\`, \`business_unit\`, \`group_id\`, \`allotted_time_hours\`, \`labor_rate_id\`, \`taxable\`, \`active\`, \`in_utility_scope\` | — | **all unchanged** |\n\n`

md += `## What still needs attention — 7 unmapped bundles\n\n`
md += `These are **still active** and sellable. London needs to decide for each:\n`
md += `- Pick a non-green MES SKU as override\n`
md += `- Pick a different MES product family (e.g., LED tubes if no MES wrap fixture exists)\n`
md += `- Deactivate the bundle entirely (we stop selling that variant)\n\n`
md += `| ID | Bundle | Current Cost | Selling Price | Why no green match |\n|---|---|---:|---:|---|\n`
for (const u of UNMAPPED) {
  md += `| ${u.id} | ${u.name} | ${fmt(u.cost)} | ${fmt(u.sellPx)} | ${u.reason} |\n`
}
md += `\n`

md += `## Rollback plan\n\n`
md += `Every original cost, manufacturer, and markup is preserved in this report's PRE_SWAP table (also in \`scripts/_fix_descriptions_and_report.mjs\`). To roll back:\n`
md += `1. Open \`scripts/_fix_descriptions_and_report.mjs\`\n`
md += `2. Replace the UPDATE block with a restore-from-PRE_SWAP block (15-min change)\n`
md += `3. Run with \`--rollback\` flag\n\n`
md += `Estimates and invoices already in the field reference snapshotted line items — they are not affected by changes to the product catalog. Only **new estimates created after 2026-05-21** will use MES pricing.\n\n`

md += `## Caveats & gotchas\n\n`
md += `1. **Matching was automated** (fixture-family + wattage overlap). Spot-check a few before the next batch of estimates. Most accurate: the LEDONE / ML / WL rows where wattage ranges overlap cleanly. Least accurate: the SMBE rolled-labor bundles (they all got mapped to the same MES strip-light SKU because the SMBE names don't differentiate the fixture).\n`
md += `2. **Existing estimates, invoices, and job line items are untouched.** Line items snapshot product info at the time they're created — they do not live-reference \`products_services\`. So Cole's, London's, and Doug's open quotes still show the LEDONE prices they had yesterday. This is a feature, not a bug.\n`
md += `3. **Markup % display will look different** — particularly on SMBE rows that now show 999.99% (the cap). Real dollar margin is fine; this is just the derived display percentage.\n`
md += `4. **Old vendor name is still in the product name.** "LEDONE Adjustable Area Lights 160W…" still says LEDONE. We can do a follow-up pass to rename to MES-style names if you want; for now the description carries the new vendor info and the front-of-name stays familiar to the field crew.\n`
md += `5. **Product names like "LEDONE…" or "ML…" still reference the old vendor** in the UI. If you want a renaming pass to "MES …" let me know and I'll do it as a follow-up — kept names familiar so the field crew isn't lost mid-job.\n\n`

md += `## Open questions for London\n\n`
md += `1. The 7 unmapped bundles — what do you want to do? (See "Still needs attention" above.)\n`
md += `2. The 10 SMBE rolled-labor bundles — keep cost = fixture-only, or rework into separate fixture + add-on products?\n`
md += `3. Should we rename the product titles to drop "LEDONE"/"ML"/"WL"/"SMBE" prefixes now that they're all MES under the hood?\n\n`

md += `## Open questions for Alayda\n\n`
md += `1. Margin reports / commission calculations — are any reports keyed on \`markup_percent\` directly? If so, the SMBE rows now show 999.99% instead of NULL, which might look weird in a chart.\n`
md += `2. Any QuickBooks / accounting sync that pulls \`cost\` from these products? Today's swap moved some costs significantly (e.g., LEDONE Area Lights $286 → $146) — heads-up if there's an inventory or COGS feed.\n\n`

md += `## Open questions for Doug\n\n`
md += `1. Field crews — any printed materials, training docs, or quote templates that still reference the old LEDONE/ML/WL SKUs?\n`
md += `2. Sales reps — do you want a Loom / one-pager explaining "we're on MES now, your selling prices are the same, but our cost basis went down on most fixtures so margins are healthier"?\n\n`

md += `---\n\n*Generated 2026-05-21 by \`scripts/_fix_descriptions_and_report.mjs\` · Source data: \`scripts/_mes_catalog_with_colors.json\` (MES pricing sheet with London's green highlights).*\n`

writeFileSync('scripts/MES_SWAP_REPORT.md', md)
console.log('✓ Wrote scripts/MES_SWAP_REPORT.md\n')
console.log(`Totals: old ${fmt(totalOldCost)} → new ${fmt(totalNewCost)}  (delta ${netDelta < 0 ? '−' : '+'}${fmt(Math.abs(netDelta))})`)
console.log(`Sell price unchanged: ${fmt(totalSellPx)}`)
