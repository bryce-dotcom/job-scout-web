// Seed the upsell catalogue from Cole's list (sales manager, texted 2026-08).
// Report-only unless --write.
//
// Two of his items appear on BOTH the "need" and "don't need" lists, so they
// are seeded ACTIVE and flagged rather than silently decided — dropping an
// upsell nobody meant to drop is worse than one extra line to review.
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url'
import { normalizeUpsells, buildTiers } from '../src/lib/upsells.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(fs.readFileSync(path.resolve(HERE,'../../job-scout-web/.env'),'utf8').split('\n')
  .filter(l=>l.includes('=')&&!l.trim().startsWith('#')).map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim()]}))
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const WRITE = process.argv.includes('--write')

const CATALOGUE = [
  // Cole: "add on we need at 0" — things already done, named so the customer
  // sees the value rather than assuming it is free because it is invisible.
  { name: 'Energy Saving Projection Report', tier: 'better', price: 0, price_type: 'flat', description: 'Projected annual savings for your building, in writing.' },
  { name: 'ROI / Payback Analysis Document', tier: 'better', price: 0, price_type: 'flat', description: 'What it returns and when it pays for itself.' },
  { name: 'Utility Incentive Processing', tier: 'better', price: 0, price_type: 'flat', description: 'We file the rebate paperwork and chase it.' },
  { name: 'Facility Lighting Audit', tier: 'better', price: 0, price_type: 'flat', description: 'A full fixture-by-fixture survey of the building.' },
  { name: 'Lighting Control Training', tier: 'best', price: 0, price_type: 'flat', description: 'We teach your team to drive the system.' },

  // Bryce: keep it, call it commissioning. Cole listed the old name on BOTH
  // sides; the rename is the resolution.
  { name: 'Commissioning', tier: 'best', price: 0, price_type: 'flat', description: 'Controls programmed, tuned and proven on site.' },

  // Bryce: warranty is a PERCENTAGE of the project, so it scales instead of
  // being re-typed per estimate. Percentages left at 0 until he sets them —
  // inventing a rate would put a made-up number on a customer document.
  { name: 'Extended Warranty', tier: 'better', price: 0, price_type: 'percent', description: 'Parts and labour cover beyond the standard term.' },

  // CONFLICT: on both of Cole's lists. Seeded active, flagged for a decision.
  { name: 'Spec & Cut Sheet Package', tier: 'better', price: 0, price_type: 'flat', description: 'Full product documentation for your records.' },
]

// Dropped per Cole: Measurement & Verification Report, Project Management Fee.

const { data: rows } = await sb.from('settings').select('id,key,value').eq('company_id',3).eq('key','upsells')
const existing = rows?.[0]
console.log(`\n  existing upsells setting: ${existing ? 'present' : 'none'}`)
console.log(`  seeding ${CATALOGUE.length} items\n`)
for (const u of normalizeUpsells(CATALOGUE)) {
  const price = u.price_type === 'percent' ? `${u.price}% of project` : (u.price ? `$${u.price}` : 'included')
  console.log(`    ${u.tier.padEnd(7)} ${u.name.padEnd(34)} ${price}`)
}
const t = buildTiers({ basePrice: 20000, incentive: 6000, settings: { upsells: CATALOGUE } })
console.log('\n  on a $20,000 project with a $6,000 incentive:')
for (const x of t) console.log(`    ${x.id.padEnd(7)} $${x.price.toFixed(2).padStart(10)}   net $${x.net_price.toFixed(2)}`)
console.log('\n  DROPPED per Cole: Measurement & Verification Report, Project Management Fee')
console.log('  FLAGGED (on both his lists): Spec & Cut Sheet Package — seeded active')

if (!WRITE) { console.log('\n  Report only. Re-run with --write to save.\n'); process.exit(0) }
const payload = { company_id: 3, key: 'upsells', value: JSON.stringify(CATALOGUE) }
const { error } = existing
  ? await sb.from('settings').update({ value: payload.value }).eq('id', existing.id)
  : await sb.from('settings').insert(payload)
console.log(error ? `\n  FAILED: ${error.message}\n` : '\n  saved.\n')
