// Backfill ai_modules rows for every company_agents row that is missing one.
//
// Cause: the onboarding/Base Camp recruit flow inserts into `company_agents`
// (the subscription record) but never creates the corresponding `ai_modules`
// row (the sidebar menu entry). Without the menu entry, the agent never
// appears in AI CREW and the placement gear has nothing to configure.
//
// This script reads every active company_agents row, joins to the agents
// registry, and inserts a default ai_modules row when one is missing.
// Idempotent — safe to run multiple times.
//
// Usage:
//   node scripts/backfill-ai-modules.cjs --dry    # show plan
//   node scripts/backfill-ai-modules.cjs --apply  # actually insert

require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')

const APPLY = process.argv.includes('--apply')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Slug → ai_modules template. Defaults are picked to match HHH's existing
// placements where possible; otherwise OPERATIONS for trade agents and
// SALES_FLOW for sales/marketing agents.
// Module-name convention: match what's already in the DB for the 5 HHH rows
// (lenard, freddy, conrad-connect, victor-verify, arnie), and use the slug
// for new ones so the natural-key (company_id, module_name) is stable.
const TEMPLATES = {
  'lenard-lighting':  { module_name: 'lenard',         display_name: 'Lenard - Lighting AI',         icon: 'Lightbulb',  default_menu_section: 'SALES_FLOW', route_path: '/agents/lenard',         sort_order: 10, description: 'AI lighting auditor + utility-rebate specialist' },
  'freddy-fleet':     { module_name: 'freddy',         display_name: 'Freddy - Fleet AI',            icon: 'Truck',      default_menu_section: 'OPERATIONS', route_path: '/agents/freddy',         sort_order: 20, description: 'AI fleet manager for vehicles equipment and maintenance' },
  'zach-yard-yeti':   { module_name: 'zach-yard-yeti', display_name: 'Zach - Lawn Care AI',          icon: 'Sprout',     default_menu_section: 'OPERATIONS', route_path: '/agents/zach',           sort_order: 25, description: 'AI lawn-care specialist — properties, visits, treatments, pricing' },
  'conrad-connect':   { module_name: 'conrad-connect', display_name: 'Conrad - Email Marketing AI',  icon: 'Mail',       default_menu_section: 'SALES_FLOW', route_path: '/agents/conrad-connect', sort_order: 30, description: 'AI email marketing agent powered by Constant Contact' },
  'victor-verify':    { module_name: 'victor-verify',  display_name: 'Victor - Verification AI',     icon: 'ShieldCheck',default_menu_section: 'OPERATIONS', route_path: '/agents/victor',         sort_order: 35, description: 'AI quality verification for completed work' },
  'arnie-og':         { module_name: 'arnie',          display_name: 'OG Arnie',                     icon: 'Bot',        default_menu_section: 'OPERATIONS', route_path: '/agents/arnie',          sort_order: 40, description: 'General-purpose AI assistant' },
  'frankie-finance':  { module_name: 'frankie-finance',display_name: 'Frankie - Finance AI',         icon: 'DollarSign', default_menu_section: 'OPERATIONS', route_path: '/agents/frankie',        sort_order: 45, description: 'AI bookkeeper + finance assistant' },
}

;(async () => {
  // 1. Get every active company_agents row + slug
  const { data: ca, error: caErr } = await s
    .from('company_agents')
    .select('company_id, agent_id, subscription_status, agents(slug)')
    .eq('subscription_status', 'active')
  if (caErr) { console.error(caErr); process.exit(1) }

  // 2. Get every existing ai_modules row, keyed (company_id, module_name)
  const { data: ai, error: aiErr } = await s
    .from('ai_modules')
    .select('company_id, module_name')
  if (aiErr) { console.error(aiErr); process.exit(1) }
  const existing = new Set(ai.map(r => `${r.company_id}::${r.module_name}`))

  // 3. Compute the missing inserts
  const plan = []
  const skipped = { noTemplate: [], alreadyExists: 0 }
  for (const r of ca) {
    const slug = r.agents?.slug
    if (!slug) continue
    const tpl = TEMPLATES[slug]
    if (!tpl) { skipped.noTemplate.push(slug); continue }
    const key = `${r.company_id}::${tpl.module_name}`
    if (existing.has(key)) { skipped.alreadyExists++; continue }
    plan.push({
      company_id: r.company_id,
      module_name: tpl.module_name,
      display_name: tpl.display_name,
      description: tpl.description,
      icon: tpl.icon,
      status: 'active',
      default_menu_section: tpl.default_menu_section,
      default_menu_parent: null,
      user_menu_section: null,
      user_menu_parent: null,
      sort_order: tpl.sort_order,
      capabilities_json: {},
      config_json: {},
      route_path: tpl.route_path,
    })
  }

  console.log(`Plan: ${plan.length} ai_modules row(s) to insert`)
  console.log(`  Already present: ${skipped.alreadyExists}`)
  if (skipped.noTemplate.length) {
    const uniq = [...new Set(skipped.noTemplate)]
    console.log(`  No template for slugs: ${uniq.join(', ')}`)
  }

  for (const row of plan.slice(0, 20)) {
    console.log(`  + co=${row.company_id} ${row.module_name.padEnd(15)} ${row.display_name}`)
  }
  if (plan.length > 20) console.log(`  … and ${plan.length - 20} more`)

  if (!APPLY) {
    console.log('\n[DRY RUN] Pass --apply to insert.')
    return
  }

  if (plan.length === 0) { console.log('\nNothing to insert.'); return }

  const { data: inserted, error: insErr } = await s.from('ai_modules').insert(plan).select('id,company_id,module_name')
  if (insErr) { console.error('Insert failed:', insErr); process.exit(1) }
  console.log(`\n✅ Inserted ${inserted.length} ai_modules rows.`)
})().catch(err => { console.error('FAILED:', err); process.exit(1) })
