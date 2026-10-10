// One-off: HHH (company 3) accountability chart + scorecard owners, per Bryce 2026-09-21.
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
import fs from 'node:fs'
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const C = 3
const { data: rows, error } = await sb.from('settings').select('id, key, value').eq('company_id', C).in('key', ['eos_scorecard', 'eos_accountability_chart'])
if (error) throw error
const byKey = Object.fromEntries(rows.map(r => [r.key, r]))
const backupPath = `C:/JobScout/eos-hhh-settings-backup-${Date.now()}.json`
fs.writeFileSync(backupPath, JSON.stringify(rows, null, 2))
console.log('backup written:', backupPath)

const oldChart = JSON.parse(byKey.eos_accountability_chart.value)
const seat = (name) => oldChart.find(s => s.seat === name)
const gwc = { g: null, w: null, c: null }
const uuid = () => crypto.randomUUID()
// People: 3 Bryce, 14 Christopher, 15 Alayda, 16 Cole, 17 Doug, 18 Tracy
const chart = [
  { id: seat('Visionary')?.id || uuid(), seat: 'Visionary', person_id: '3', level: 0, gwc,
    roles: ['Vision & long-term direction', 'Culture & core values', 'Key relationships & big ideas', '', ''] },
  { id: seat('Integrator')?.id || uuid(), seat: 'Integrator', person_id: null, level: 1, gwc,
    roles: ['', '', '', '', ''] },
  { id: seat('Sales/Marketing')?.id || uuid(), seat: 'Sales', person_id: '16', level: 2, gwc,
    roles: ['Sales Manager — all sales, both units', 'Energy Scout sales', 'Pipeline, follow-up & closing', 'Weekly sales numbers', ''] },
  { id: uuid(), seat: 'HHH Sales', person_id: '14', level: 2, gwc,
    roles: ['HHH Building Services sales', 'Estimates & quotes (HHH)', 'HHH customer relationships', 'Weekly HHH sales numbers', ''] },
  { id: seat('Operations')?.id || uuid(), seat: 'Operations', person_id: '17', level: 2, gwc,
    roles: ['All installations', 'Crew scheduling & dispatch', 'Job completion & quality', 'Man hours & dollars per hour', 'Callbacks'] },
  { id: uuid(), seat: 'Submittals & Marketing', person_id: '15', level: 2, gwc,
    roles: ['Utility submittals (Energy Scout)', 'Marketing & lead generation', 'Website, brand & social', 'New leads', ''] },
  { id: seat('Finance')?.id || uuid(), seat: 'Finance', person_id: '18', level: 2, gwc,
    roles: ['Books & bookkeeping', 'Receivables & collections', 'Cash collected & expenses', 'Meeting setting (appointments)', ''] },
]

const old = JSON.parse(byKey.eos_scorecard.value)
const byId = Object.fromEntries(old.map(m => [m.id, m]))
const keep = (id, changes = {}) => { const m = byId[id]; if (!m) throw new Error('missing metric ' + id); return { ...m, ...changes } }
const scorecard = [
  // Christopher — HHH sales
  keep('7f851717-afa2-4000-b514-565e30d7f338', { owner_id: '14' }),
  // Cole — Sales Manager
  keep('e8b12136-32fc-4ece-8513-71026a3042fc', { owner_id: '16' }),
  // Doug — Operations: every installation metric, both units
  keep('cc2292a9-1f22-4834-b876-d3d7875037c4', { owner_id: '17' }),
  keep('efa18fd6-baf4-43ed-93e4-06987899d4f8', { owner_id: '17' }),
  keep('664747cb-6e7a-4ee7-880e-fc2d27e9aed3', { owner_id: '17' }),
  keep('0e3b6aa0-eb9e-44a5-b6b5-1a53828ddd7f', { owner_id: '17' }),
  keep('a63a6a5c-443e-4108-b06c-59663c94e4e7', { owner_id: '17', metric: 'Lead Callbacks Due (HHH Building Services)' }),
  keep('cb99223a-cf23-4658-a013-c1487f595990', { owner_id: '17' }),
  keep('cacb594f-e761-4696-9754-3d8d0e0f439a', { owner_id: '17' }),
  keep('2e67f776-df47-455b-83d9-847d5b41d732', { owner_id: '17' }),
  keep('0d1cab3d-96c0-4b5f-ac74-cb95e1e82cf7', { owner_id: '17' }),
  // Alayda — submittals + marketing
  keep('2f480356-75fe-43c9-9a3d-a5d7b2ae5456', { owner_id: '15' }),
  { id: uuid(), metric: 'New Leads', owner_id: '15', goal: '', type: 'gte', source: 'leads_created', entity: null, current: '' },
  // Tracy — money + meeting setting
  keep('0f13e288-bfb4-4e9b-aa3d-818bd682e4a1', { owner_id: '18' }),
  keep('d25ebf89-f2af-4e84-bbf5-fafe85ee09e9', { owner_id: '18' }),
  keep('944a6820-ff15-476c-a631-0060e7081067', { owner_id: '18', type: 'lte' }),
  { id: uuid(), metric: 'Meetings Set', owner_id: '18', goal: '', type: 'gte', source: 'meetings_created', entity: null, current: '' },
]
// Dropped: e9b83b90 — a second "Dollar Amount Sold (Energy Scout)" owned by Doug, who is now Operations.
const dropped = old.filter(m => !scorecard.find(s => s.id === m.id)).map(m => `${m.metric} (owner ${m.owner_id})`)
console.log('dropped metrics:', dropped)

const now = new Date().toISOString()
const r1 = await sb.from('settings').update({ value: JSON.stringify(chart), updated_at: now }).eq('id', byKey.eos_accountability_chart.id).eq('company_id', C).select('id')
const r2 = await sb.from('settings').update({ value: JSON.stringify(scorecard), updated_at: now }).eq('id', byKey.eos_scorecard.id).eq('company_id', C).select('id')
console.log('chart update:', r1.error?.message || `ok (${r1.data?.length} row)`, '| scorecard update:', r2.error?.message || `ok (${r2.data?.length} row)`)
console.log('seats:', chart.map(s => `${s.seat} → ${s.person_id ?? '—'}`).join('; '))
console.log('metrics:', scorecard.length, scorecard.map(m => `${m.metric} → ${m.owner_id}`).join('; '))
