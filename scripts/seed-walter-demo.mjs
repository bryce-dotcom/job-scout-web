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

async function main() {
  const { data: company, error: ce } = await sb
    .from('companies').select('id, company_name').eq('id', COMPANY_ID).maybeSingle()
  if (ce) throw new Error(`company lookup failed: ${ce.message}`)
  if (!company) throw new Error(`no company ${COMPANY_ID}`)
  console.log(`company ${COMPANY_ID} — ${company.company_name}`)

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

  const recruitedId = await recruit()

  const blocked = DEMO_REGISTER.filter((r) => r.not_restorable_reason).length
  const l0 = DEMO_REGISTER.filter((r) => r.severity === 'L0' && !r.not_restorable_reason).length
  console.log(`assessment #${created.id} — ${SITE_NAME}`)
  console.log(`  ${items.length} rows logged, ${DEMO_REGISTER.length} distinct marks`)
  console.log(`  ${blocked} not restorable, ${l0} L0 routed to cleaning`)
  console.log(`  ${DEMO_REGISTER.length - blocked - l0} zones to resurface`)
  console.log(`  walter-windows recruited (agent ${recruitedId}) and on the menu`)
  console.log(`\n  /agents/walter/assessment/${created.id}`)
}

main().catch((e) => { console.error(String(e.message || e)); process.exit(1) })
