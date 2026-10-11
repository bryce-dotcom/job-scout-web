// One-off: put profit on HHH's scorecard. Bryce 2026-10-10.
// Dollars / Hour compared two unrelated sets of jobs, so each unit's row is
// replaced by Profit / Hour, Profit on Jobs Completed is added beside it, and
// one company-wide row counts the finished jobs we cannot cost yet.
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
import fs from 'node:fs'
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const C = 3
const DOUG = '17'
const { data: row, error } = await sb.from('settings').select('id, value').eq('company_id', C).eq('key', 'eos_scorecard').single()
if (error) throw error
fs.writeFileSync(`C:/JobScout/eos-hhh-scorecard-backup-${Date.now()}.json`, row.value)
const scorecard = JSON.parse(row.value)

const out = []
for (const m of scorecard) {
  if (m.source !== 'dollars_per_hour') { out.push(m); continue }
  const unit = m.entity
  // Same slot, same owner — the question it was trying to answer.
  out.push({
    ...m, id: crypto.randomUUID(), source: 'profit_per_hour',
    metric: unit ? `Profit / Hour (${unit})` : 'Profit / Hour',
  })
  out.push({
    id: crypto.randomUUID(), owner_id: m.owner_id || DOUG, goal: '', type: 'gte',
    source: 'job_profit', entity: unit, current: '',
    metric: unit ? `Profit on Jobs Completed (${unit})` : 'Profit on Jobs Completed',
  })
}
if (!out.some(m => m.source === 'jobs_missing_cost')) {
  out.push({
    id: crypto.randomUUID(), metric: 'Completed Jobs With No Cost', owner_id: DOUG,
    goal: '0', type: 'lte', source: 'jobs_missing_cost', entity: null, current: '',
  })
}
const removed = scorecard.filter(m => m.source === 'dollars_per_hour').length
if (!removed) { console.log('no Dollars / Hour rows found — nothing to swap'); process.exit(0) }
const r = await sb.from('settings').update({ value: JSON.stringify(out), updated_at: new Date().toISOString() })
  .eq('id', row.id).eq('company_id', C).select('id')
console.log('update:', r.error?.message || `ok (${r.data.length} row)`)
console.log(`replaced ${removed} Dollars / Hour row(s); scorecard ${scorecard.length} -> ${out.length} metrics`)
for (const m of out.filter(m => ['profit_per_hour', 'job_profit', 'jobs_missing_cost'].includes(m.source))) console.log('  +', m.metric)
