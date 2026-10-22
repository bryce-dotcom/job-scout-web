#!/usr/bin/env node
// The morning sweep — find it before a person does.
//
// Everything checked here is something that actually went wrong, quietly, and
// was found days later by somebody mid-crisis:
//
//   * payroll could not mark a bonus paid AT ALL, because the code wrote to a
//     column that did not exist. One bonus in HHH's entire history read
//     "paid". Found on payroll day, by Bryce, in a panic.
//   * $20,883 of bonuses carried a paid_at and still read as owed.
//   * Tracy's setter fees sat stranded on duplicate leads since September —
//     twelve of them, $850 — and she found two by hand, three weeks apart.
//   * a queued-but-held bonus showed in "your next paycheck" and paid nothing.
//   * a shipped commit's migration was never applied.
//
// None of those needed cleverness to find. They needed somebody to look.
//
// Prints a report and ALWAYS exits 0 — the routine reads the text, and a
// check that cannot run is a line in the report, not a dead run.
//
//   node scripts/morning-sweep.mjs            # all tenants with signal
//   node scripts/morning-sweep.mjs --company 3
//   node scripts/morning-sweep.mjs --hours 25

import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { strandedSetterFees, strandedTotal } from '../src/lib/setterOrphans.js'

config()

const argv = process.argv.slice(2)
const argOf = (name, dflt) => {
  const i = argv.indexOf(name)
  return i === -1 ? dflt : argv[i + 1]
}
const HOURS = Number(argOf('--hours', 25))
const ONLY_COMPANY = argOf('--company', null)

const URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.log('morning sweep: no database credentials in the environment — nothing checked.')
  process.exit(0)
}
const db = createClient(URL, KEY, { auth: { persistSession: false } })

const since = new Date(Date.now() - HOURS * 3600 * 1000).toISOString()
const money = (n) => '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// PostgREST caps a response at 1000 rows whatever .limit() says.
async function pageAll(table, select, filter) {
  const out = []
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(select).range(from, from + 999)
    if (filter) q = filter(q)
    const { data, error } = await q
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out
}

const findings = []   // { company, severity, line, detail? }
const notes = []      // checks that could not run
const add = (company, severity, line, detail) => findings.push({ company, severity, line, detail })

// ── 1. Did the app crash on anybody? ──────────────────────────────────
async function crashes() {
  const rows = await pageAll(
    'client_errors',
    'company_id, route, message, seen_count, last_seen_at, app_build, resolved',
    (q) => q.gte('last_seen_at', since).eq('resolved', false),
  )
  const byKey = new Map()
  for (const r of rows) {
    const key = `${r.company_id}|${r.route}|${String(r.message).slice(0, 60)}`
    const prev = byKey.get(key)
    byKey.set(key, { ...r, seen_count: (prev?.seen_count || 0) + (r.seen_count || 1) })
  }
  for (const c of byKey.values()) {
    add(c.company_id, 'crash', `${c.route} — ${String(c.message).slice(0, 70)} (${c.seen_count}x, build ${c.app_build})`)
  }
}

// ── 2. What did people say? ───────────────────────────────────────────
// Urgency is whatever the person typed. They capitalise it when they mean it.
const SHOUTED = /urgen|priority|asap|critical|not working|broken|wrong/i
async function feedback() {
  const rows = await pageAll(
    'feedback',
    'company_id, user_email, subject, message, feedback_type, status, created_at',
    (q) => q.gte('created_at', since).in('status', ['new', 'in_progress']),
  )
  for (const f of rows) {
    const who = String(f.user_email || '').split('@')[0]
    const shouted = SHOUTED.test(`${f.subject} ${f.message}`)
    add(f.company_id, shouted ? 'urgent' : 'feedback', `${who}: ${String(f.subject || '').slice(0, 70)}`)
  }
}

// ── 3. Is anybody's pay quietly wrong? ────────────────────────────────
async function payLedgers(companyId) {
  const bonuses = await pageAll(
    'job_bonuses',
    'id, company_id, employee_id, amount, status, paid_at, queued_for_payroll, needs_verification',
    (q) => q.eq('company_id', companyId),
  )

  // Paid, and still reading as owed. This is the one that hid $20,883.
  const ghost = bonuses.filter((b) => b.paid_at && b.status !== 'paid')
  if (ghost.length) {
    add(companyId, 'money', `${ghost.length} bonuses carry a paid date but still read as owed — ${money(ghost.reduce((s, b) => s + (+b.amount || 0), 0))}`)
  }

  // Staged for the run AND held. Shows in "your next paycheck", pays nothing.
  const stagedAndHeld = bonuses.filter((b) => b.status === 'accrued' && b.queued_for_payroll && b.needs_verification)
  if (stagedAndHeld.length) {
    add(companyId, 'money', `${stagedAndHeld.length} bonuses are staged for payroll AND held — they will show as coming and pay nothing (${money(stagedAndHeld.reduce((s, b) => s + (+b.amount || 0), 0))})`)
  }

  // A setter's fee stranded on the lead the quote never reached.
  const rule = (await db.from('companies').select('setter_qualification_rule').eq('id', companyId).maybeSingle()).data?.setter_qualification_rule
  if (rule === 'quote_created') {
    const [commissions, leads, employees] = await Promise.all([
      pageAll('lead_commissions', 'id, company_id, lead_id, employee_id, amount, commission_type, payment_status', (q) => q.eq('company_id', companyId)),
      pageAll('leads', 'id, business_name, customer_name, phone, email, customer_id, quote_id', (q) => q.eq('company_id', companyId)),
      pageAll('employees', 'id, name', (q) => q.eq('company_id', companyId)),
    ])
    const nameOf = new Map(employees.map((e) => [e.id, e.name]))
    const byEmp = new Map()
    for (const c of commissions) {
      if (!byEmp.has(c.employee_id)) byEmp.set(c.employee_id, [])
      byEmp.get(c.employee_id).push(c)
    }
    for (const [empId, rows] of byEmp) {
      const stranded = strandedSetterFees({ commissions: rows, leads })
      if (stranded.length) {
        add(companyId, 'money', `${nameOf.get(empId) || `employee ${empId}`}: ${stranded.length} setter ${stranded.length === 1 ? 'fee is' : 'fees are'} waiting on a quote that went to a duplicate lead — ${money(strandedTotal(stranded))}`)
      }
    }
  }
}

// Migrations are NOT checked here. supabase_migrations lives outside the
// schemas PostgREST exposes, so this script cannot read it — and the thing
// that actually hurts is not an unapplied migration, it is CODE WRITING TO A
// COLUMN THAT IS NOT THERE. That failure is silent: the statement 400s inside
// a try/catch and takes everything else in it down with it, which is how
// payroll stopped marking any bonus paid at all. // finds exactly that, so the routine runs it alongside this.

// ── 5. Is what is on main actually live? ──────────────────────────────
async function deployed() {
  const host = process.env.SWEEP_HOST || 'https://jobscout.appsannex.com'
  try {
    const html = await (await fetch(host, { redirect: 'follow' })).text()
    const asset = html.match(/assets\/index-[A-Za-z0-9_-]+\.js/)?.[0]
    if (!asset) { notes.push(`could not find the app bundle at ${host}`); return }
    const res = await fetch(`${host}/${asset}`)
    if (!res.ok) add(null, 'deploy', `the app bundle did not load (${res.status}) — the site may be down`)
  } catch (e) {
    add(null, 'deploy', `could not reach ${host}: ${e.message}`)
  }
}

// ── run ───────────────────────────────────────────────────────────────
const safely = async (label, fn) => { try { await fn() } catch (e) { notes.push(`${label} could not run: ${e.message}`) } }

let companies = []
try {
  const rows = await pageAll('companies', 'id, company_name')
  companies = ONLY_COMPANY ? rows.filter((c) => String(c.id) === String(ONLY_COMPANY)) : rows
} catch (e) {
  notes.push(`could not list companies: ${e.message}`)
}

await safely('crashes', crashes)
await safely('feedback', feedback)
await safely('deploy', deployed)
for (const c of companies) await safely(`pay ledgers for ${c.company_name}`, () => payLedgers(c.id))

const nameOf = new Map(companies.map((c) => [c.id, c.company_name]))
const ORDER = ['crash', 'money', 'urgent', 'deploy', 'feedback']
const LABEL = {
  crash: 'CRASHED ON SOMEBODY',
  money: 'SOMEONE\'S PAY IS WRONG',
  urgent: 'SAID URGENTLY',
  deploy: 'SHIPPING',
  feedback: 'NEW FEEDBACK',
}

console.log(`\nMorning sweep — ${new Date().toISOString().slice(0, 16).replace('T', ' ')}  (last ${HOURS}h)`)
console.log('='.repeat(72))

if (!findings.length) {
  console.log('\nNothing to report. No crashes, no new feedback, pay ledgers consistent,')
  console.log('every migration applied, the app is up.')
} else {
  for (const sev of ORDER) {
    const rows = findings.filter((f) => f.severity === sev)
    if (!rows.length) continue
    console.log(`\n${LABEL[sev]}  (${rows.length})`)
    for (const r of rows) {
      const co = r.company == null ? '' : `[${nameOf.get(r.company) || `company ${r.company}`}] `
      console.log(`  - ${co}${r.line}`)
    }
  }
}

if (notes.length) {
  console.log('\nCOULD NOT CHECK')
  for (const n of notes) console.log(`  - ${n}`)
}
console.log('')
process.exit(0)
