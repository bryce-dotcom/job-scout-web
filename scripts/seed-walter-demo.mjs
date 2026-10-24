// Walter's demo assessment — a post-construction glass review, in the DEMO
// company only.
//
//   node scripts/seed-walter-demo.mjs            seed (safe to re-run)
//   node scripts/seed-walter-demo.mjs --remove   take it back out
//
// Company 25 is Summit Field Co, the demo tenant. NEVER company 3: live test
// employees sat on HHH's real roster for weeks once, and the rule since is
// that demo data goes in the demo company or nowhere.
//
// Why a script and not a migration: a migration runs for every tenant, and
// nobody else wants our demo building in their list. Existing companies get
// provisioned with a service-role write, the same way company setup does it.
//
// The register itself lives in src/lib/walterDemoRegister.js, because
// walterRows.test.js prices the very same rows and pins what the screen should
// show. Two copies of a demo register is two demos.

import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
import { DEMO_ASSESSMENT, DEMO_REGISTER, expandRegister } from '../src/lib/walterDemoRegister.js'
import {
  DEMO_PRODUCTS, DEMO_PRODUCT_GROUPS, DEMO_TAKEOFF, DEMO_TYPES, expandTakeoff,
} from '../src/lib/walterDemoTakeoff.js'
import { localDateStr } from '../src/lib/localDate.js'

const COMPANY_ID = 25
const AGENT_SLUG = 'walter-windows'
const SITE_NAME = DEMO_ASSESSMENT.site_name

const url = process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Need VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.')
  process.exit(1)
}
if (COMPANY_ID === 3) {
  console.error('Refusing to seed company 3. Demo data goes in the demo company.')
  process.exit(1)
}
const sb = createClient(url, key)
const remove = process.argv.includes('--remove')

async function wipe() {
  const { data: existing, error } = await sb
    .from('glass_assessments')
    .select('id')
    .eq('company_id', COMPANY_ID)
    .eq('site_name', SITE_NAME)
  if (error) throw new Error(`lookup failed: ${error.message}`)
  for (const row of existing || []) {
    // Items go first and explicitly: ON DELETE CASCADE covers it, but saying
    // so here means this still cleans up if the FK is ever dropped.
    const { error: e1 } = await sb.from('glass_damage_items')
      .delete().eq('company_id', COMPANY_ID).eq('assessment_id', row.id)
    if (e1) throw new Error(`clearing items failed: ${e1.message}`)
    const { error: e1b } = await sb.from('glass_areas')
      .delete().eq('company_id', COMPANY_ID).eq('assessment_id', row.id)
    if (e1b) throw new Error(`clearing areas failed: ${e1b.message}`)
    const { error: e2 } = await sb.from('glass_assessments')
      .delete().eq('company_id', COMPANY_ID).eq('id', row.id)
    if (e2) throw new Error(`clearing assessment failed: ${e2.message}`)
  }
  return (existing || []).length
}

async function recruit() {
  const { data: agent, error } = await sb
    .from('agents').select('id').eq('slug', AGENT_SLUG).maybeSingle()
  if (error) throw new Error(`agent lookup failed: ${error.message}`)
  if (!agent) throw new Error(`no agents row for ${AGENT_SLUG}`)

  const { error: e1 } = await sb.from('company_agents')
    .upsert({
      company_id: COMPANY_ID,
      agent_id: agent.id,
      subscription_status: 'active',
      activated_at: new Date().toISOString(),
      settings: {},
    }, { onConflict: 'company_id,agent_id', ignoreDuplicates: true })
  if (e1) throw new Error(`company_agents failed: ${e1.message}`)

  // Same shape as MODULE_TEMPLATES['walter-windows'] in companySetup.ts. The
  // nav reads ai_modules, not agents, so without this row Walter is recruited
  // and still invisible.
  const { error: e2 } = await sb.from('ai_modules')
    .upsert({
      company_id: COMPANY_ID,
      module_name: AGENT_SLUG,
      display_name: 'Walter - Windows AI',
      icon: 'Bot',
      default_menu_section: 'OPERATIONS',
      route_path: '/agents/walter',
      sort_order: 50,
      description: 'AI glass specialist — window cleaning and scratch restoration',
      status: 'active',
      capabilities_json: {},
      config_json: {},
    }, { onConflict: 'company_id,module_name', ignoreDuplicates: true })
  if (e2) throw new Error(`ai_modules failed: ${e2.message}`)
  return agent.id
}

/**
 * Does the catalogue still say what the pinned demo figures assume?
 *
 * DEMO_TYPES is a mirror of window_types, needed because a unit test cannot
 * reach the database. A mirror nobody checks is how two copies of a rule
 * drift apart, so this is the check: every field the arithmetic reads, on
 * every type the walk uses, compared against the live table.
 *
 * It refuses rather than warns. A seeded demo that prices differently from
 * the suite that pins it is worse than no demo, because it looks right.
 */
async function checkCatalogue() {
  const codes = DEMO_TYPES.map((t) => t.type_code)
  const { data: live, error } = await sb.from('window_types')
    .select('type_code, type_name, family, panes_per_unit, lites_per_unit, bill_lites, typical_width_in, typical_height_in, size_band, screens_per_unit, has_track')
    .in('type_code', codes)
  if (error) throw new Error(`window_types lookup failed: ${error.message}`)

  const byCode = new Map((live || []).map((t) => [t.type_code, t]))
  const drift = []
  for (const want of DEMO_TYPES) {
    const got = byCode.get(want.type_code)
    if (!got) { drift.push(`${want.type_code}: not in window_types at all`); continue }
    for (const [k, v] of Object.entries(want)) {
      // Numerics come back as numbers or numeric strings depending on the
      // column, so compare loosely on value rather than on type.
      const mine = v === null ? null : String(v)
      const theirs = got[k] === null || got[k] === undefined ? null : String(got[k])
      if (mine !== theirs) drift.push(`${want.type_code}.${k}: demo says ${mine}, table says ${theirs}`)
    }
  }
  if (drift.length) {
    throw new Error(
      'The window catalogue has moved away from the demo mirror:\n  ' +
      drift.join('\n  ') +
      '\n\nFix src/lib/walterDemoTakeoff.js (DEMO_TYPES) and the figures pinned in' +
      '\nsrc/lib/glassCleaningPricing.test.js, then seed again.'
    )
  }
  return codes.length
}

/**
 * A window price book for the demo tenant.
 *
 * Summit Field Co had thirteen products and not one of them glass, so a
 * counted takeoff there priced every single line at nothing — which is the
 * honest answer and a useless demo. These are the products HHH actually
 * sells, at their prices, because the matcher scores NAMES and a book with
 * tidied-up names would exercise a matcher nobody has.
 *
 * Matched on name so re-running does not duplicate them, and left alone if
 * somebody has since edited the price.
 */
async function seedBook() {
  const groupIds = new Map()
  for (const g of DEMO_PRODUCT_GROUPS) {
    const { data: found } = await sb.from('product_groups')
      .select('id').eq('company_id', COMPANY_ID).eq('name', g.name).maybeSingle()
    if (found) { groupIds.set(g.name, found.id); continue }
    const { data: made, error } = await sb.from('product_groups')
      .insert({ ...g, company_id: COMPANY_ID, active: true })
      .select('id').single()
    if (error) throw new Error(`product group ${g.name} failed: ${error.message}`)
    groupIds.set(g.name, made.id)
  }

  let added = 0
  for (const p of DEMO_PRODUCTS) {
    const { data: found } = await sb.from('products_services')
      .select('id').eq('company_id', COMPANY_ID).eq('name', p.name).maybeSingle()
    if (found) continue
    const { error } = await sb.from('products_services').insert({
      company_id: COMPANY_ID,
      name: p.name,
      unit_price: p.unit_price,
      cost: p.cost,
      group_id: groupIds.get(p.group) ?? null,
      // What qualifies a product as glass work. The add-on services sit in
      // a group with no glass word in its name and pass on this alone.
      type: 'Window Cleaning',
      material_or_labor: 'labor',
      active: true,
      taxable: false,
    })
    if (error) throw new Error(`product ${p.name} failed: ${error.message}`)
    added += 1
  }
  return { added, groups: groupIds.size }
}

async function main() {
  const { data: company, error: ce } = await sb
    .from('companies').select('id, company_name').eq('id', COMPANY_ID).maybeSingle()
  if (ce) throw new Error(`company lookup failed: ${ce.message}`)
  if (!company) throw new Error(`no company ${COMPANY_ID}`)
  console.log(`company ${COMPANY_ID} — ${company.company_name}`)

  // First, before anything is removed or written. This check used to run
  // after the assessment and its register were already in — so the one time
  // it fired it had wiped the previous demo, written half the new one and
  // then thrown, leaving an assessment with a damage register and no
  // takeoff. A guard that breaks what it is guarding is not a guard.
  const checked = await checkCatalogue()
  console.log(`  ${checked} window type(s) verified against the catalogue`)

  const cleared = await wipe()
  if (cleared) console.log(`removed ${cleared} existing demo assessment(s)`)
  if (remove) {
    console.log('--remove: done, nothing seeded.')
    return
  }

  const { data: created, error } = await sb
    .from('glass_assessments')
    .insert({
      ...DEMO_ASSESSMENT,
      company_id: COMPANY_ID,
      assessment_date: localDateStr(new Date()),
    })
    .select('id')
    .single()
  if (error) throw new Error(`insert assessment failed: ${error.message}`)

  const items = expandRegister().map((r) => ({
    ...r,
    company_id: COMPANY_ID,
    assessment_id: created.id,
  }))
  const { error: ie } = await sb.from('glass_damage_items').insert(items)
  if (ie) throw new Error(`insert register failed: ${ie.message}`)

  const book = await seedBook()

  const areas = expandTakeoff(COMPANY_ID, created.id)
  const { error: ae } = await sb.from('glass_areas').insert(areas)
  if (ae) throw new Error(`insert takeoff failed: ${ae.message}`)

  const recruitedId = await recruit()

  const blocked = DEMO_REGISTER.filter((r) => r.not_restorable_reason).length
  const l0 = DEMO_REGISTER.filter((r) => r.severity === 'L0' && !r.not_restorable_reason).length
  console.log(`assessment #${created.id} — ${SITE_NAME}`)
  console.log(`  ${items.length} rows logged, ${DEMO_REGISTER.length} distinct marks`)
  console.log(`  ${blocked} not restorable, ${l0} L0 routed to cleaning`)
  console.log(`  ${DEMO_REGISTER.length - blocked - l0} zones to resurface`)
  console.log(`  ${areas.length} runs of windows counted on the cleaning side`)
  console.log(`  price book: ${book.added} product(s) added across ${book.groups} group(s)`)
  console.log(`  walter-windows recruited (agent ${recruitedId}) and on the menu`)
  console.log(`\n  /agents/walter/assessment/${created.id}`)
}

main().catch((e) => { console.error(String(e.message || e)); process.exit(1) })
