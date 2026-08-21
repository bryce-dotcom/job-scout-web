// Collapse the SMBE 4FT Type B Tube catalogue into two variant families.
//
// Cole, 23 Jun: "the tubes dont have a option without a lift"
// Cole, 25 Jun: "i need 8ft blulbs and the 4ft t8 to have 1l,2l,3l,4l,6l"
//
// The ROWS he wanted were created on 26 Jun — every lamp count exists, with and
// without a lift, at both wattages. What was never finished is the grouping:
//
//   * T8 was split across FIVE variant groups, one per lamp count, so the
//     picker showed five separate tiles and the lamp count was the one thing
//     you could not choose. Lift is a toggle inside each — which is why "no
//     option without a lift" reads as fixed from the data and not from the
//     shelf.
//   * T5 was never grouped at all: twelve loose rows, no picker.
//
// This makes lamp count an axis, exactly like Wattage and Lift, so each family
// is one tile with three controls. Same shape as the SMBE Highbay backfill
// (40 rows -> 1 tile); see scripts/backfill-smbe-variants.mjs.
//
// Names, prices, ids and vendor SKUs are untouched — only variant_group_id,
// variant_group_label and variant_options — so quote_lines, POs and inventory
// keep pointing at exactly the rows they already point at.
//
//   node scripts/backfill-tube-variants.mjs           # dry run (prints the plan)
//   node scripts/backfill-tube-variants.mjs --write   # apply
//
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { randomUUID } from 'node:crypto'
config()

// Stable, key-order-independent form of an options map, for comparing what is
// stored against what we would write.
const canon = (o) => JSON.stringify(Object.fromEntries(Object.entries(o || {}).sort(([a], [b]) => a.localeCompare(b))))

const WRITE = process.argv.includes('--write')
const COMPANY = 3
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// --- the one-time parse, human-verifiable, never re-run at runtime ----------
// "SMBE 3L 15W 4FT T8 Type B Tube w/ Lift" -> 3L / 15W / lift
// A name with no NL prefix is the single-lamp row, which the catalogue writes
// as "SMBE 9W 4FT T8..." rather than "SMBE 1L 9W...". Stored as "1L" so the
// axis reads 1L,2L,3L,4L,6L instead of blank,2L,3L,4L,6L.
const lamps = (name) => {
  const m = name.match(/\bSMBE\s+(\d+)L\b/i)
  return m ? `${m[1]}L` : '1L'
}
const wattage = (name) => {
  const m = name.match(/\b(\d+)W\b/i)
  return m ? `${m[1]}W` : null
}
const hasLift = (name) => /\bw\/\s*lift\b/i.test(name)

const FAMILIES = [
  { key: 'T8', label: 'SMBE 4FT T8 Type B Tube', match: /4FT\s+T8\s+Type B Tube/i, axes: ['Lamps', 'Wattage', 'Lift'] },
  // T5 is a single wattage (24W). A one-value select axis renders a control
  // with nothing to choose, so Wattage is left out and stays in the name.
  { key: 'T5', label: 'SMBE 4FT T5 Type B Tube', match: /4FT\s+T5\s+Type B Tube/i, axes: ['Lamps', 'Lift'] },
]

;(async () => {
  const { data: rows, error } = await s.from('products_services')
    .select('id,name,unit_price,variant_group_id,variant_group_label,variant_options,active')
    .eq('company_id', COMPANY)
    .ilike('name', 'SMBE%Type B Tube%')
    .order('id')
  if (error) { console.error('QUERY FAILED:', error.message); process.exit(1) }
  console.log(`SMBE Type B Tube rows: ${rows.length}\n`)

  let planned = 0
  for (const fam of FAMILIES) {
    const set = rows.filter((r) => fam.match.test(r.name))
    if (!set.length) { console.log(`${fam.key}: no rows matched — skipping\n`); continue }

    // Reuse an existing group id when the family already has one, so re-running
    // is a no-op rather than a churn of fresh uuids.
    const existing = set.map((r) => r.variant_group_id).filter(Boolean)
    const groupId = existing.length && existing.every((g) => g === existing[0])
      ? existing[0]
      : randomUUID()

    console.log(`${fam.key}  ->  "${fam.label}"   group ${groupId}`)
    const seen = new Map()
    for (const r of set) {
      const opts = { Lamps: lamps(r.name), Lift: hasLift(r.name) }
      if (fam.axes.includes('Wattage')) {
        const w = wattage(r.name)
        if (!w) { console.log(`   !! no wattage parsed from "${r.name}" — SKIPPED`); continue }
        opts.Wattage = w
      }
      // Two rows resolving to the same combination would make the picker
      // ambiguous; resolveVariant returns whichever it finds first.
      const sig = JSON.stringify(opts)
      if (seen.has(sig)) {
        console.log(`   !! COLLISION ${sig}\n      ${seen.get(sig)}\n      ${r.name}  — SKIPPED`)
        continue
      }
      seen.set(sig, r.name)

      // jsonb does not preserve key order — it came back {Lift,Lamps,Wattage}
      // from a {Lamps,Lift,Wattage} write. Comparing raw JSON.stringify made
      // every re-run look like 32 pending changes. Canonicalise both sides.
      const same = r.variant_group_id === groupId &&
        r.variant_group_label === fam.label &&
        canon(r.variant_options) === canon(opts)
      console.log(`   ${same ? 'ok  ' : 'set '} ${String(r.id).padEnd(5)} $${String(r.unit_price).padEnd(8)} ${r.name.slice(0, 44).padEnd(44)} ${sig}`)
      if (same) continue
      planned++
      if (WRITE) {
        const { error: uErr } = await s.from('products_services')
          .update({ variant_group_id: groupId, variant_group_label: fam.label, variant_options: opts })
          .eq('id', r.id)
        if (uErr) console.log(`   UPDATE FAILED ${r.id}: ${uErr.message}`)
      }
    }
    console.log(`   ${set.length} rows -> 1 tile\n`)
  }
  console.log(WRITE ? `applied ${planned} update(s)` : `${planned} row(s) would change — re-run with --write`)
})()
