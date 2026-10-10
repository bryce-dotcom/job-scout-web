// One-off: Doug (emp 17) is the Integrator at HHH (company 3). Bryce 2026-09-21.
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
import fs from 'node:fs'
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const C = 3
const { data: row, error } = await sb.from('settings').select('id, value').eq('company_id', C).eq('key', 'eos_accountability_chart').single()
if (error) throw error
fs.writeFileSync(`C:/JobScout/eos-hhh-chart-backup-${Date.now()}.json`, row.value)
const chart = JSON.parse(row.value).map(s => s.seat === 'Integrator'
  ? { ...s, person_id: '17', roles: ['Runs the business day to day', 'Leads the L10 & holds the team to the Scorecard', 'Owns all installations (Operations)', 'Removes obstacles between seats', 'Rocks accountability'] }
  : s)
const r = await sb.from('settings').update({ value: JSON.stringify(chart), updated_at: new Date().toISOString() }).eq('id', row.id).eq('company_id', C).select('id')
console.log('update:', r.error?.message || `ok (${r.data.length} row)`)
console.log(chart.map(s => `${s.seat} → ${s.person_id ?? '—'}`).join('; '))
