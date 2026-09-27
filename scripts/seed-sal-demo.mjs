#!/usr/bin/env node
// Seed Sal's board for the demo tenant (company 25, Summit Field Co).
//
// Six opportunities across the sources and statuses so the storefront has
// something to show and a live proof has rows to act on. Deterministic: no
// AI, fixed hashes, idempotent (unique on company_id + dedupe_hash), and it
// touches ONLY company 25 — never company 3.
//
//   node scripts/seed-sal-demo.mjs            insert / refresh
//   node scripts/seed-sal-demo.mjs --clear    remove the seeded rows

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'

const COMPANY = 25
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const days = (n, h = 14) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); d.setUTCHours(h + 6, 0, 0, 0); return d.toISOString() } // 2 PM Denver

const ROWS = [
  {
    dedupe_hash: 'seed:ogden-led', source_kind: 'email', title: 'Lorin Farr Park LED Lighting Retrofit', buyer: 'City of Ogden — Parks & Recreation', buyer_level: 'city',
    solicitation_number: 'ITB 2026-114', notice_type: 'ifb', summary: 'Replace 212 HID pole and wall-pack fixtures across Lorin Farr Park with DLC-listed LED luminaires and photocell controls. Prevailing wage does not apply. Bid bond 5%.',
    naics: ['238210'], commodity_codes: ['285'], set_aside: null, estimated_value_low: 140000, estimated_value_high: 190000,
    place: { city: 'Ogden', state: 'UT', zip: '84401' }, due_at: days(12), due_tz: 'America/Denver', prebid_at: days(4, 10), prebid_mandatory: false, questions_due_at: days(7),
    requirements: { bond_pct: 5, license: 'Utah E100 electrical', insurance: '$1M GL', prevailing_wage: false, other: ['Two copies', 'Acknowledge Addendum 1'] },
    submit_method: 'portal', submit_to: { portal_url: 'https://utah.bonfirehub.com/portal', contact_name: 'Dana Whitfield', email: 'purchasing@ogdencity.gov' },
    url: 'https://utah.bonfirehub.com/portal/?tab=openOpportunities', fit_score: 88, fit_reasons: ['Exactly a lighting retrofit', 'Ogden is inside the service area', 'Size in band', 'Small-business friendly, no set-aside'], blockers: [], effort_estimate: 'medium', status: 'new',
  },
  {
    dedupe_hash: 'seed:sam-hill-afb', source_kind: 'sam', title: 'LED Lighting Upgrade, Building 1245, Hill AFB', buyer: 'Dept of the Air Force / 75th Contracting Squadron', buyer_level: 'federal',
    solicitation_number: 'FA8201-26-Q-0187', notice_type: 'ifb', summary: null, naics: ['238210'], commodity_codes: ['Z1JZ'], set_aside: 'Total Small Business Set-Aside (FAR 19.5)',
    place: { city: 'Hill AFB', state: 'UT', zip: '84056' }, due_at: days(18, 16), due_tz: null, requirements: {},
    submit_method: 'email', submit_to: { email: 'contracting@us.af.mil', contact_name: 'Contract Specialist', portal_url: 'https://sam.gov/opp/demo/view' },
    url: 'https://sam.gov/', documents: [{ name: 'FA8201-26-Q-0187_SOW.pdf', url: 'https://sam.gov/api/prod/opps/v3/opportunities/resources/files/demo', fetched_at: null, from: 'sam' }],
    fit_score: 74, fit_reasons: ['NAICS 238210 match', 'Small-business set-aside — held', 'Federal quote by email', 'Bonding and DB wages to confirm'], blockers: [], effort_estimate: 'medium', status: 'shortlisted',
  },
  {
    dedupe_hash: 'seed:slcsd-custodial', source_kind: 'email', title: 'Custodial Services — Three Elementary Schools', buyer: 'Salt Lake City School District', buyer_level: 'district',
    solicitation_number: 'RFP 26-031', notice_type: 'rfp', summary: 'Nightly custodial services for three elementary schools, 180-day school year, three-year term with two option years.',
    naics: ['561720'], commodity_codes: ['910'], set_aside: null, estimated_value_low: 240000, estimated_value_high: 320000,
    place: { city: 'Salt Lake City', state: 'UT' }, due_at: days(9, 15), due_tz: 'America/Denver', prebid_at: days(2, 9), prebid_mandatory: true,
    requirements: { bond_pct: null, license: null, insurance: '$2M GL, WC', prevailing_wage: null, other: ['Background checks for all staff', 'References: 3'] },
    submit_method: 'portal', submit_to: { portal_url: 'https://utah.bonfirehub.com/portal' }, url: 'https://utah.bonfirehub.com/portal/?tab=openOpportunities',
    fit_score: 71, fit_reasons: ['Janitorial line matches', 'In area', 'Mandatory pre-bid in 2 days'], blockers: [], effort_estimate: 'large', status: 'new',
  },
  {
    dedupe_hash: 'seed:phoenix-sdvosb', source_kind: 'email', title: 'Parking Structure Lighting Replacement', buyer: 'City of Phoenix — Public Works', buyer_level: 'city',
    solicitation_number: 'IFB 26-0412', notice_type: 'ifb', summary: 'Replace 640 fixtures in two parking structures downtown.', naics: ['238210'], set_aside: 'SDVOSB set-aside',
    place: { city: 'Phoenix', state: 'AZ' }, due_at: days(15), due_tz: 'America/Phoenix', requirements: { bond_pct: 10 },
    submit_method: 'portal', submit_to: { portal_url: 'https://procurement.opengov.com/portal/phoenix' }, url: 'https://procurement.opengov.com/portal/phoenix',
    fit_score: 12, fit_reasons: ['Outside service area (AZ)'], blockers: ['Service-disabled veteran-owned set-aside — not held'], status: 'dismissed', dismissed_reason: 'auto', dismissed_by: 'sal', dismissed_at: new Date().toISOString(),
  },
  {
    dedupe_hash: 'seed:pmn-provo-traffic', source_kind: 'rss', title: 'Traffic Signal LED Replacement, 12 Intersections', buyer: 'Provo City', buyer_level: 'city',
    solicitation_number: null, notice_type: 'ifb', summary: 'Furnish and install LED signal heads at twelve intersections.', naics: [], place: { city: 'Provo', state: 'UT' }, due_at: days(20), due_tz: 'America/Denver',
    submit_method: 'unknown', url: 'https://www.utah.gov/pmn/', fit_score: 8, fit_reasons: ['Excluded: "traffic signal"'], blockers: [], status: 'dismissed', dismissed_reason: 'auto', dismissed_by: 'sal', dismissed_at: new Date().toISOString(),
  },
  {
    dedupe_hash: 'seed:gc-warehouse', source_kind: 'email', title: 'ITB — Electrical & Lighting Package, Front Range Distribution Center', buyer: 'Rocky Mountain Builders (GC)', buyer_level: 'gc',
    solicitation_number: 'RMB-2611-26E', notice_type: 'itb', summary: '210,000 sf tilt-up warehouse; scope includes high-bay LED, site lighting and controls. Plans on PlanHub.',
    naics: ['238210'], place: { city: 'Aurora', state: 'CO' }, due_at: days(-2), due_tz: 'America/Denver',
    submit_method: 'portal', submit_to: { portal_url: 'https://planhub.com/' }, url: 'https://planhub.com/',
    fit_score: 82, fit_reasons: ['Lighting package', 'Denver metro'], blockers: [], effort_estimate: 'large', status: 'expired',
  },
]

const clear = process.argv.includes('--clear')
const { data: co } = await sb.from('companies').select('id').eq('id', COMPANY).maybeSingle()
if (!co) { console.error(`company ${COMPANY} not found`); process.exit(1) }
if (clear) {
  const { error } = await sb.from('bid_opportunities').delete().eq('company_id', COMPANY).like('dedupe_hash', 'seed:%')
  console.log(error ? `clear failed: ${error.message}` : 'cleared seeded rows')
  process.exit(error ? 1 : 0)
}
let n = 0
for (const r of ROWS) {
  const row = { company_id: COMPANY, scored_at: new Date().toISOString(), score_model: 'seed', ...r }
  const { error } = await sb.from('bid_opportunities').upsert(row, { onConflict: 'company_id,dedupe_hash' })
  if (error) console.error(`${r.dedupe_hash}: ${error.message}`); else n++
}
console.log(`seeded ${n}/${ROWS.length} opportunities on company ${COMPANY}`)
