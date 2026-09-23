// One-off: add the company-wide and no-unit Man Hours rows to HHH's
// scorecard (company 3). Bryce 2026-09-23 — more than half of last week's
// clocked hours belonged to no business unit and appeared on no row.
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
const has = (source) => scorecard.some(m => m.source === source && !m.entity)
const additions = []
if (!has('man_hours')) {
  additions.push({
    id: crypto.randomUUID(), metric: 'Total Man Hours (All Units)', owner_id: DOUG,
    goal: '', type: 'gte', source: 'man_hours', entity: null, current: '',
  })
}
if (!has('man_hours_no_unit')) {
  additions.push({
    id: crypto.randomUUID(), metric: 'Man Hours — No Unit', owner_id: DOUG,
    // Lower is better, and the target is zero: every hour should name a job.
    goal: '0', type: 'lte', source: 'man_hours_no_unit', entity: null, current: '',
  })
}
if (!additions.length) { console.log('both rows already present — nothing to do'); process.exit(0) }

// Sit them next to the per-unit hours rows rather than at the bottom.
const lastHours = scorecard.map(m => m.source).lastIndexOf('man_hours')
const at = lastHours >= 0 ? lastHours + 1 : scorecard.length
const next = [...scorecard.slice(0, at), ...additions, ...scorecard.slice(at)]

const r = await sb.from('settings').update({ value: JSON.stringify(next), updated_at: new Date().toISOString() })
  .eq('id', row.id).eq('company_id', C).select('id')
console.log('update:', r.error?.message || `ok (${r.data.length} row)`)
console.log('added:', additions.map(a => a.metric).join(', '), '| scorecard is now', next.length, 'metrics')
