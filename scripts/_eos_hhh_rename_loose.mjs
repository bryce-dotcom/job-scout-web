// The loose-hours row now counts crew misses only — rename it to match.
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
import fs from 'node:fs'
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const C = 3
const { data: row, error } = await sb.from('settings').select('id, value').eq('company_id', C).eq('key', 'eos_scorecard').single()
if (error) throw error
fs.writeFileSync(`C:/JobScout/eos-hhh-scorecard-backup-${Date.now()}.json`, row.value)
const sc = JSON.parse(row.value)
let n = 0
const next = sc.map(m => {
  if (m.source !== 'man_hours_no_unit') return m
  if (m.metric === 'Crew Hours Not On a Job') return m
  n++; return { ...m, metric: 'Crew Hours Not On a Job' }
})
if (!n) { console.log('already named correctly'); process.exit(0) }
const r = await sb.from('settings').update({ value: JSON.stringify(next), updated_at: new Date().toISOString() }).eq('id', row.id).eq('company_id', C).select('id')
console.log('update:', r.error?.message || `ok (${r.data.length} row)`, '| renamed', n)
