// One-off: AR on HHH's scorecard is now a week-ENDING balance, so say so.
// Bryce 2026-09-23 — the row printed the same figure in both columns.
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
import fs from 'node:fs'
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const C = 3
const { data: row, error } = await sb.from('settings').select('id, value').eq('company_id', C).eq('key', 'eos_scorecard').single()
if (error) throw error
fs.writeFileSync(`C:/JobScout/eos-hhh-scorecard-backup-${Date.now()}.json`, row.value)
const scorecard = JSON.parse(row.value)
let changed = 0
const next = scorecard.map(m => {
  if (m.source !== 'receivables') return m
  const metric = m.entity ? `Accounts Receivable (week end) (${m.entity})` : 'Accounts Receivable (week end)'
  if (metric === m.metric) return m
  changed++
  return { ...m, metric }
})
if (!changed) { console.log('label already current — nothing to do'); process.exit(0) }
const r = await sb.from('settings').update({ value: JSON.stringify(next), updated_at: new Date().toISOString() })
  .eq('id', row.id).eq('company_id', C).select('id')
console.log('update:', r.error?.message || `ok (${r.data.length} row)`, '| relabelled', changed)
