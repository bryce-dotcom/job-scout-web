// Backfill lawn_properties for Antonino's ALC-imported customers.
//
// The import-zack-customers script created 94 `customers` rows tagged with
// source_system='alc_import' and stored mow_day + frequency in the `notes`
// field. The Zach (Yard Yeti) UI reads from `lawn_properties`, which was
// left empty — so customers in Antonino's main list don't have a matching
// lawn-care record and the per-customer Yard Yeti view shows nothing.
//
// This script reads each alc_import customer, parses the mow_day +
// frequency out of the notes line, and upserts a lawn_properties row
// linked by customer_id. Idempotent on (company_id, customer_id) — re-runs
// won't duplicate.
//
// Usage:
//   node scripts/backfill-zack-lawn-properties.cjs --dry    # show plan
//   node scripts/backfill-zack-lawn-properties.cjs --apply  # actually insert/update

require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')

const COMPANY_ID = 9
const APPLY = process.argv.includes('--apply')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

function parseNotes(notes) {
  // "Imported from ALC docs. Mow day: Monday. Price: $40 weekly."
  if (!notes) return {}
  const dayM = notes.match(/Mow day:\s*([A-Za-z]+)/)
  const priceM = notes.match(/Price:\s*\$([\d.]+)/)
  const freqM = notes.match(/(biweekly|weekly|monthly)/i)
  return {
    mow_day: dayM ? dayM[1] : null,
    price: priceM ? parseFloat(priceM[1]) : null,
    mow_frequency:
      freqM ? (freqM[1].toLowerCase() === 'biweekly' ? 'Bi-Weekly'
            : freqM[1].toLowerCase() === 'weekly'    ? 'Weekly'
            : 'Monthly')
            : null,
  }
}

;(async () => {
  // 1. Pull all alc_import customers
  const { data: customers, error: cErr } = await s
    .from('customers')
    .select('id, name, address, notes')
    .eq('company_id', COMPANY_ID)
    .eq('source_system', 'alc_import')
    .order('id')
  if (cErr) { console.error(cErr); process.exit(1) }
  console.log(`Found ${customers.length} alc_import customers`)

  // 2. Pull existing lawn_properties for this company → dedupe by customer_id
  const { data: existing, error: lErr } = await s
    .from('lawn_properties')
    .select('id, customer_id, property_name')
    .eq('company_id', COMPANY_ID)
  if (lErr) { console.error(lErr); process.exit(1) }
  const haveByCustomer = new Map(existing.map(r => [r.customer_id, r]))
  console.log(`Existing lawn_properties: ${existing.length} (already linked to ${haveByCustomer.size} customers)`)

  // 3. Build the insert/update plan
  const inserts = []
  const updates = []
  for (const c of customers) {
    const parsed = parseNotes(c.notes)
    const row = {
      company_id: COMPANY_ID,
      customer_id: c.id,
      property_name: c.name,
      address: c.address || null,
      mow_day: parsed.mow_day,
      mow_frequency: parsed.mow_frequency,
      // Default seasonal window for Utah lawn care: Apr–Oct
      service_start_month: 4,
      service_end_month: 10,
      mow_height_inches: 3.0,
      active: true,
      notes: c.notes || null,
    }
    const have = haveByCustomer.get(c.id)
    if (have) {
      // Only update if we're filling in missing fields — don't overwrite
      // hand-edited rows like Zack's own "kendall antonino" property.
      updates.push({ id: have.id, customer_id: c.id, fields: row })
    } else {
      inserts.push(row)
    }
  }
  console.log(`\nPlan: ${inserts.length} insert(s), ${updates.length} potential update(s) (skipped — see below)`)
  for (const i of inserts.slice(0, 10)) {
    console.log(`  + cust=#${i.customer_id} "${i.property_name}" ${i.mow_day || '?'} ${i.mow_frequency || '?'} @ ${i.address || '-'}`)
  }
  if (inserts.length > 10) console.log(`  … and ${inserts.length - 10} more inserts`)

  if (!APPLY) {
    console.log('\n[DRY RUN] Pass --apply to insert.')
    return
  }

  if (inserts.length === 0) { console.log('\nNothing to insert.'); return }

  // 4. Insert in chunks
  const CHUNK = 50
  let inserted = 0
  for (let i = 0; i < inserts.length; i += CHUNK) {
    const batch = inserts.slice(i, i + CHUNK)
    const { data, error } = await s.from('lawn_properties').insert(batch).select('id, customer_id')
    if (error) { console.error('Insert failed at chunk', i, error); process.exit(1) }
    inserted += data.length
  }
  console.log(`\n✅ Inserted ${inserted} lawn_properties rows linked to alc_import customers.`)
})().catch(err => { console.error('FAILED:', err); process.exit(1) })
