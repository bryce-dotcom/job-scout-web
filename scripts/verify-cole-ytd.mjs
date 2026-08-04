// Is Cole's YTD sales figure right? Verifies the DATA and what the UI shows.
// Paginates with a stable sort and asserts counts, because a silently
// truncated fetch is how I got this wrong twice already.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8')
  .split('\n').filter(l => l.includes('=') && !l.trim().startsWith('#'))
  .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const CO = 3, COLE = 16
const YEAR = '2026-01-01'
const money = n => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

async function all(table, select) {
  const { count } = await sb.from(table).select('id', { count: 'exact', head: true }).eq('company_id', CO)
  const out = []
  for (let f = 0; ; f += 1000) {
    const { data, error } = await sb.from(table).select(select)
      .eq('company_id', CO).order('id', { ascending: true }).range(f, f + 999)
    if (error) { console.log(`${table}: ${error.message}`); break }
    out.push(...(data || [])); if (!data || data.length < 1000) break
  }
  const uniq = new Set(out.map(r => r.id)).size
  if (uniq !== count) console.log(`  *** ${table}: fetched ${uniq} but server says ${count} — TRUNCATED`)
  return out
}

const jobs = await all('jobs', 'id, job_id, job_title, job_total, status, created_at, salesperson_id, lead_id, quote_id')
const leads = await all('leads', 'id, salesperson_id, lead_owner_id, salesperson_ids, status')
const quotes = await all('quotes', 'id, quote_id, lead_id, salesperson_id, quote_amount, discount, status, approved_date, created_at')
const qlines = []
for (let f = 0; ; f += 1000) {
  const { data } = await sb.from('quote_lines').select('quote_id, line_total, total').order('id').range(f, f + 999)
  qlines.push(...(data || [])); if (!data || data.length < 1000) break
}
const lineSum = new Map()
for (const l of qlines) lineSum.set(l.quote_id, (lineSum.get(l.quote_id) || 0) + (Number(l.line_total ?? l.total ?? 0) || 0))

const leadIdx = new Map(leads.map(l => [String(l.id), l]))
const leadOf = j => (j.lead_id ? leadIdx.get(String(j.lead_id)) : null) || null

// lib/jobOwnership 'credit' — job salesperson, else the lead's.
const coleOwns = (j) => {
  if (j.salesperson_id != null) return String(j.salesperson_id) === String(COLE)
  const l = leadOf(j)
  if (!l) return false
  if (l.salesperson_id != null) return String(l.salesperson_id) === String(COLE)
  return Array.isArray(l.salesperson_ids) && l.salesperson_ids.map(String).includes(String(COLE))
}

const ytdJobs = jobs.filter(j => (j.created_at || '') >= YEAR && coleOwns(j))
const jobTotal = ytdJobs.reduce((s, j) => s + (Number(j.job_total) || 0), 0)

console.log(`COLE — YTD 2026\n`)
console.log(`Jobs sold (any stage): ${ytdJobs.length}   ${money(jobTotal)}`)
const byStatus = new Map()
for (const j of ytdJobs) {
  const k = j.status || '(none)'
  if (!byStatus.has(k)) byStatus.set(k, { n: 0, a: 0 })
  const b = byStatus.get(k); b.n++; b.a += Number(j.job_total) || 0
}
for (const [k, v] of [...byStatus.entries()].sort((a, b) => b[1].a - a[1].a))
  console.log(`   ${k.padEnd(22)} ${String(v.n).padStart(3)}  ${money(v.a).padStart(14)}`)

// Estimates: the board now shows line-sum minus discount, not quote_amount.
const effective = (q) => {
  const ls = lineSum.get(q.id) || 0
  const sub = ls > 0 ? ls : (Number(q.quote_amount) || 0)
  return Math.max(0, sub - (Number(q.discount) || 0))
}
const coleQuotes = quotes.filter(q => String(q.salesperson_id) === String(COLE) ||
  (q.lead_id && String(leadIdx.get(String(q.lead_id))?.salesperson_id) === String(COLE)))
const openYtd = coleQuotes.filter(q => (q.created_at || '') >= YEAR && !/reject|lost|void/i.test(q.status || ''))
console.log(`\nOpen estimates written YTD: ${openYtd.length}   ${money(openYtd.reduce((s, q) => s + effective(q), 0))}`)
console.log(`   (stored quote_amount would say ${money(openYtd.reduce((s, q) => s + (Number(q.quote_amount) || 0), 0))})`)

// What the PIPELINE TILE shows: sum of cards currently in a Won stage.
const wonStageLeadIds = new Set(leads.filter(l => l.status === 'Won').map(l => String(l.id)))
const coleWonNow = ytdJobs.filter(j => j.lead_id && wonStageLeadIds.has(String(j.lead_id)))
console.log(`\nWhat the "Sales Won" TILE shows (cards sitting in the Won stage right now):`)
console.log(`   ${coleWonNow.length} deals   ${money(coleWonNow.reduce((s, j) => s + (Number(j.job_total) || 0), 0))}`)
console.log(`\n   Everything else Cole sold has already moved on to a delivery`)
console.log(`   stage, so the tile does not count it.`)
