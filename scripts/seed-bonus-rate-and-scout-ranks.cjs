// One-shot: ensure company 3 has efficiency_bonus_rate=30 and seeded scout ranks
require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const COMPANY_ID = 3

const SCOUT_RANKS = [
  { name: 'Scout', weight: 1 },
  { name: 'Tenderfoot', weight: 1.5 },
  { name: 'Second Class', weight: 2 },
  { name: 'First Class', weight: 2.5 },
  { name: 'Star', weight: 3 },
  { name: 'Life', weight: 4 },
  { name: 'Eagle', weight: 5 },
]

async function main() {
  // 1) Update payroll_config.efficiency_bonus_rate -> 30
  const { data: pcRow } = await supabase
    .from('settings')
    .select('value')
    .eq('company_id', COMPANY_ID)
    .eq('key', 'payroll_config')
    .maybeSingle()

  let payrollConfig = {}
  if (pcRow?.value) {
    try { payrollConfig = typeof pcRow.value === 'string' ? JSON.parse(pcRow.value) : pcRow.value } catch {}
  }
  const oldRate = payrollConfig.efficiency_bonus_rate
  payrollConfig.efficiency_bonus_rate = 30

  await supabase.from('settings').upsert({
    company_id: COMPANY_ID,
    key: 'payroll_config',
    value: JSON.stringify(payrollConfig),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'company_id,key' })
  console.log(`[OK] payroll_config.efficiency_bonus_rate: ${oldRate} -> 30`)

  // 2) Seed skill_levels with scout ranks if not present / empty
  const { data: slRow } = await supabase
    .from('settings')
    .select('value')
    .eq('company_id', COMPANY_ID)
    .eq('key', 'skill_levels')
    .maybeSingle()

  let existing = []
  if (slRow?.value) {
    try { existing = typeof slRow.value === 'string' ? JSON.parse(slRow.value) : slRow.value } catch {}
  }
  if (!Array.isArray(existing) || existing.length === 0) {
    await supabase.from('settings').upsert({
      company_id: COMPANY_ID,
      key: 'skill_levels',
      value: JSON.stringify(SCOUT_RANKS),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'company_id,key' })
    console.log(`[OK] seeded ${SCOUT_RANKS.length} scout ranks`)
  } else {
    console.log(`[SKIP] skill_levels already has ${existing.length} entries:`, existing.map(s => s.name || s).join(', '))
  }
}

main().catch(e => { console.error(e); process.exit(1) })
