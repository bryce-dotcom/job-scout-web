// LIVE verification of the EOS scorecard for HHH (company 3).
//
// Imports the REAL metric definitions from the page (AUTO_SOURCES) so this
// measures the shipped code path, not a copy of it. Loads data exactly the
// way the store does, then cross-checks each number against a raw count
// taken straight from the table.
//
// Run: npx vite-node scripts/_eos_live_verify.mjs
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
import { AUTO_SOURCES } from '../src/pages/admin/EOS.jsx'
import { getWeekRange } from '../src/lib/eosWeek.js'
import { mergeJobHourSources } from '../src/lib/jobHours.js'
import { DEFAULT_TZ } from '../src/lib/dateTz.js'

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const C = 3

async function page(table, cols = '*', tweak = (q) => q) {
  let out = [], from = 0
  for (;;) {
    const { data, error } = await tweak(sb.from(table).select(cols).eq('company_id', C)).order('id').range(from, from + 999)
    if (error) { console.log('  ERR', table, error.message); break }
    out = out.concat(data || [])
    if (!data || data.length < 1000) break
    from += 1000
  }
  return out
}

const since = getWeekRange(14).start
const [jobs, leads, invoices, payments, appointments, timeLogs, timeClock, expenses, plaidTransactions, quotes, leadPayments, submittals, settings] = await Promise.all([
  page('jobs', '*', q => q.neq('status', 'Archived')),
  page('leads'), page('invoices'), page('payments'), page('appointments'), page('time_log'),
  page('time_clock', 'id, employee_id, job_id, clock_in, clock_out, total_hours', q => q.gte('clock_in', since)),
  page('expenses'), page('plaid_transactions'), page('quotes', 'id, quote_amount'), page('lead_payments'),
  page('file_attachments', 'id, job_id, created_at', q => q.eq('photo_context', 'submittal')),
  sb.from('settings').select('key, value').eq('company_id', C).then(r => r.data || []),
])
const setting = (k) => { try { return JSON.parse(settings.find(s => s.key === k)?.value || 'null') } catch { return null } }
const jobStatuses = setting('job_statuses') || []
const scorecard = setting('eos_scorecard') || []
const chart = setting('eos_accountability_chart') || []
const { data: employees } = await sb.from('employees').select('id, name').eq('company_id', C)
const nameOf = (id) => employees.find(e => String(e.id) === String(id))?.name || '—'

const storeData = {
  jobs, leads, invoices, utilityInvoices: await page('utility_invoices'), payments, appointments, timeLogs,
  hourEntries: mergeJobHourSources({ timeClock, timeLog: timeLogs }),
  expenses, plaidTransactions, quotes,
  quoteAmountById: new Map(quotes.map(q => [q.id, q.quote_amount])),
  leadPayments, submittals, jobStatuses, tz: DEFAULT_TZ,
}

console.log('=== DATA LOADED (as the page sees it) ===')
console.log(`jobs ${jobs.length} | leads ${leads.length} | appts ${appointments.length} | punches ${timeClock.length} | typed rows ${timeLogs.length} | merged hour entries ${storeData.hourEntries.length}`)
console.log(`payments ${payments.length} | invoices ${invoices.length} | plaid ${plaidTransactions.length} | submittals ${submittals.length}`)

console.log('\n=== ACCOUNTABILITY CHART (live) ===')
for (const s of chart) console.log(`  L${s.level}  ${String(s.seat).padEnd(24)} ${nameOf(s.person_id)}`)

const w1 = getWeekRange(1), w2 = getWeekRange(2)
console.log(`\n=== SCORECARD — week of ${w1.startDate}..${w1.endDate} vs ${w2.startDate}..${w2.endDate} ===`)
const fmt = (v, f) => v == null ? '—' : f === 'currency' ? '$' + Math.round(v).toLocaleString() : String(Math.round(v * 10) / 10)
const run = (m, w) => {
  const src = AUTO_SOURCES[m.source]
  if (!src) return null
  return src.compute(storeData, w.start, w.end, w.startDate, w.endDate, m.entity || null)
}
let zeros = []
for (const m of scorecard) {
  const src = AUTO_SOURCES[m.source]
  const a = run(m, w1), b = run(m, w2)
  console.log(`  ${String(m.metric).padEnd(42)} ${String(nameOf(m.owner_id)).padEnd(18)} ${fmt(a, src?.format).padStart(10)}  (prev ${fmt(b, src?.format)})`)
  if (a === 0) zeros.push(m.metric)
}
if (zeros.length) console.log('\n  reads ZERO this week:', zeros.join(', '))

// ── Independent cross-checks, straight from the tables ──────────────────
console.log('\n=== CROSS-CHECK (raw table maths, must match above) ===')
const inWk = (iso) => iso >= w1.start && iso <= w1.end
const rawHours = timeClock.filter(t => inWk(t.clock_in)).reduce((s, t) => {
  const h = Number(t.total_hours)
  if (Number.isFinite(h) && h > 0) return s + h
  if (t.clock_in && t.clock_out) return s + Math.max(0, (new Date(t.clock_out) - new Date(t.clock_in)) / 36e5)
  return s
}, 0)
console.log(`  raw punch hours in week (all units):      ${Math.round(rawHours * 10) / 10}`)
console.log(`  metric Total Man Hours HHH + Energy Scout: ${Math.round((AUTO_SOURCES.man_hours.compute(storeData, w1.start, w1.end, w1.startDate, w1.endDate, 'HHH Building Services') + AUTO_SOURCES.man_hours.compute(storeData, w1.start, w1.end, w1.startDate, w1.endDate, 'Energy Scout')) * 10) / 10} (job-linked punches only)`)
const rawCash = payments.filter(p => p.date >= w1.startDate && p.date <= w1.endDate).reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
console.log(`  raw payments dated in week:              $${Math.round(rawCash).toLocaleString()}`)
console.log(`  metric Cash Collected (all units):       $${Math.round(AUTO_SOURCES.cash_collected.compute(storeData, w1.start, w1.end, w1.startDate, w1.endDate, null)).toLocaleString()}`)
const rawSetMeetings = appointments.filter(a => a.created_at >= w1.start && a.created_at <= w1.end && !['Job', 'Recurring Job', 'Block'].includes(a.appointment_type || '')).length
console.log(`  raw non-job appts created in week:        ${rawSetMeetings}`)
console.log(`  metric Meetings Set:                     ${AUTO_SOURCES.meetings_created.compute(storeData, w1.start, w1.end, w1.startDate, w1.endDate, null)}`)
const bu = {}
jobs.forEach(j => { bu[j.business_unit ?? '(none)'] = (bu[j.business_unit ?? '(none)'] || 0) + 1 })
console.log('  business units now present on jobs:     ', JSON.stringify(bu))
