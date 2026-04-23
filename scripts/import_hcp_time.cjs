#!/usr/bin/env node
/**
 * import_hcp_time.cjs — Import a HouseCall Pro time-tracking CSV export into
 * the JobScout time_log table.
 *
 * Usage:
 *   node scripts/import_hcp_time.cjs <path-to-csv>           # dry run (default)
 *   node scripts/import_hcp_time.cjs <path-to-csv> --apply   # actually insert
 *   node scripts/import_hcp_time.cjs <path-to-csv> --company-id 3 --apply
 *
 * Why this exists: HCP's public REST API does NOT expose the time_tracking
 * endpoints (I probed /time_tracking, /time_entries, /timesheets, etc. — all
 * 404). The only way to get real clock-in/out data out of HCP is the CSV
 * export in Reports → Time Tracking.
 *
 * The script is tolerant of HCP's column naming: it fuzzy-matches the header
 * row so it works whether the export calls a column "Employee", "Technician",
 * "Pro Name", etc. On first run it prints the detected mapping so you can
 * sanity-check before applying.
 *
 * Idempotency: every time_log row gets a deterministic time_log_id of the
 * form `hcp:<sha1-first-12>`, computed from (employee_email|date|clock_in).
 * Re-running the script will skip rows that are already present.
 */

require('dotenv').config()
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const SUPABASE_URL = process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SERVICE_KEY) { console.error('Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env'); process.exit(1) }

const args = process.argv.slice(2)
const csvPath = args.find(a => !a.startsWith('--'))
const apply = args.includes('--apply')
const companyIdArg = args.indexOf('--company-id')
const COMPANY_ID = companyIdArg >= 0 ? Number(args[companyIdArg + 1]) : 3

if (!csvPath) { console.error('Usage: node scripts/import_hcp_time.cjs <csv> [--apply] [--company-id 3]'); process.exit(1) }
if (!fs.existsSync(csvPath)) { console.error('File not found: ' + csvPath); process.exit(1) }

const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' }
async function sbGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: H })
  if (!r.ok) throw new Error(`GET ${path} -> ${r.status}: ${await r.text()}`)
  return r.json()
}
async function sbInsert(table, rows) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, { method: 'POST', headers: H, body: JSON.stringify(rows) })
  const body = await r.json()
  return { status: r.status, body }
}

// ─── CSV parser (tolerant) ───
// Handles RFC 4180: quoted fields with embedded commas/quotes/newlines.
function parseCSV(text) {
  const rows = []
  let row = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"' && text[i+1] === '"') { cur += '"'; i++ }
      else if (ch === '"') { inQuotes = false }
      else cur += ch
    } else {
      if (ch === '"') inQuotes = true
      else if (ch === ',') { row.push(cur); cur = '' }
      else if (ch === '\r') { /* skip */ }
      else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = '' }
      else cur += ch
    }
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row) }
  return rows.filter(r => r.some(c => c !== ''))
}

// ─── Column detection ───
// Fuzzy-match a header name against a set of candidate labels. Returns the
// column index or -1 if none matched.
function findCol(headers, candidates) {
  const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '')
  const normalized = headers.map(norm)
  for (const cand of candidates) {
    const c = norm(cand)
    const exact = normalized.indexOf(c)
    if (exact >= 0) return exact
  }
  for (const cand of candidates) {
    const c = norm(cand)
    const partial = normalized.findIndex(h => h.includes(c) || c.includes(h))
    if (partial >= 0) return partial
  }
  return -1
}

const COLUMN_HINTS = {
  employee:    ['employee', 'technician', 'tech', 'pro', 'proname', 'employeename', 'technicianname', 'user'],
  email:       ['email', 'employeeemail', 'emailaddress'],
  jobNumber:   ['job', 'jobnumber', 'jobid', 'invoice', 'invoicenumber', 'workorder', 'jobinvoicenumber'],
  date:        ['date', 'day', 'workdate', 'shiftdate'],
  clockIn:     ['clockin', 'starttime', 'startat', 'start', 'timein', 'in'],
  clockOut:    ['clockout', 'endtime', 'endat', 'end', 'timeout', 'out'],
  hours:       ['hours', 'duration', 'totalhours', 'time', 'laborhours'],
  notes:       ['notes', 'description', 'memo', 'comment', 'comments'],
  category:    ['category', 'type', 'timetype', 'activitytype'],
}

// ─── Time parsing ───
// Accept a bunch of formats: "8:30 AM", "08:30", "2026-03-27 08:30:00",
// "3/27/2026 8:30 AM", ISO-8601, etc.
function parseDateTime(dateStr, timeStr) {
  if (!dateStr && !timeStr) return null
  const combined = [dateStr, timeStr].filter(Boolean).join(' ').trim()
  const d = new Date(combined)
  if (!isNaN(d.getTime())) return d.toISOString()
  // Try MM/DD/YYYY
  const m = combined.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?)?$/i)
  if (m) {
    let [, mo, dy, yr, hh, mm, ss, ap] = m
    if (yr.length === 2) yr = '20' + yr
    let h = hh ? parseInt(hh, 10) : 0
    if (ap) { if (ap.toUpperCase() === 'PM' && h < 12) h += 12; if (ap.toUpperCase() === 'AM' && h === 12) h = 0 }
    const iso = new Date(+yr, +mo - 1, +dy, h, +(mm||0), +(ss||0)).toISOString()
    return iso
  }
  return null
}

function parseDuration(str) {
  if (!str) return null
  const s = String(str).trim()
  // "7.5" or "7.5 hrs"
  const dec = s.match(/^(-?\d+(?:\.\d+)?)/)
  if (dec && !s.includes(':')) return parseFloat(dec[1])
  // "7:30" (h:mm) or "7:30:00"
  const hm = s.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/)
  if (hm) return +hm[1] + (+hm[2])/60 + ((+hm[3]||0))/3600
  return null
}

function sha12(s) { return crypto.createHash('sha1').update(s).digest('hex').slice(0, 12) }

(async () => {
  console.log('─'.repeat(72))
  console.log('HCP time-tracking CSV import')
  console.log('  file:        ' + csvPath)
  console.log('  company_id:  ' + COMPANY_ID)
  console.log('  mode:        ' + (apply ? 'APPLY (will insert rows)' : 'DRY RUN (no writes)'))
  console.log('─'.repeat(72))

  // ── Load CSV ──
  const text = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '')
  const rows = parseCSV(text)
  if (rows.length < 2) { console.error('CSV has no data rows'); process.exit(1) }
  const headers = rows[0].map(h => h.trim())
  const dataRows = rows.slice(1)
  console.log(`Parsed ${dataRows.length} data rows, ${headers.length} columns`)
  console.log('  Headers: ' + headers.join(' | '))

  // ── Detect columns ──
  const col = {}
  for (const [key, hints] of Object.entries(COLUMN_HINTS)) {
    col[key] = findCol(headers, hints)
  }
  console.log('\nDetected column mapping:')
  for (const [k, idx] of Object.entries(col)) {
    console.log(`  ${k.padEnd(12)} -> ${idx >= 0 ? headers[idx] + ' (col ' + idx + ')' : '(not found)'}`)
  }

  const hasTimes = col.clockIn >= 0 && col.clockOut >= 0
  const hasHours = col.hours >= 0
  if (!hasTimes && !hasHours) {
    console.error('\nERROR: need either (clock-in + clock-out) OR (hours) column. Neither found.')
    console.error('If the CSV uses different names, tell me the header names and I will update COLUMN_HINTS.')
    process.exit(1)
  }
  if (col.employee < 0 && col.email < 0) {
    console.error('\nERROR: need either Employee Name or Employee Email column. Neither found.')
    process.exit(1)
  }
  if (col.date < 0 && !hasTimes) {
    console.error('\nERROR: need a Date column (or clock-in/out that includes the date).')
    process.exit(1)
  }

  // ── Load JobScout employees + jobs for matching ──
  console.log('\nLoading JobScout employees and jobs for matching...')
  const employees = await sbGet(`employees?select=id,name,email,active&company_id=eq.${COMPANY_ID}`)
  const jobs = await sbGet(`jobs?select=id,job_id,customer_name,job_title,start_date&company_id=eq.${COMPANY_ID}&limit=10000`)
  console.log(`  ${employees.length} employees, ${jobs.length} jobs`)
  const byEmail = new Map(employees.map(e => [(e.email || '').toLowerCase(), e]))
  const byName = new Map(employees.map(e => [(e.name || '').toLowerCase(), e]))
  const jobByNumber = new Map(jobs.map(j => [String(j.job_id || '').toLowerCase(), j]))

  // ── Build time_log rows ──
  const prepared = []
  const unmatched = { employees: new Set(), jobs: new Set() }
  const warnings = []

  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i]
    const empName  = col.employee >= 0 ? (r[col.employee] || '').trim() : ''
    const empEmail = col.email    >= 0 ? (r[col.email] || '').trim()    : ''
    const jobNum   = col.jobNumber>= 0 ? (r[col.jobNumber] || '').trim().replace(/^#/, '') : ''
    const dateStr  = col.date     >= 0 ? (r[col.date] || '').trim()     : ''
    const inStr    = col.clockIn  >= 0 ? (r[col.clockIn] || '').trim()  : ''
    const outStr   = col.clockOut >= 0 ? (r[col.clockOut] || '').trim() : ''
    const hoursStr = col.hours    >= 0 ? (r[col.hours] || '').trim()    : ''
    const notes    = col.notes    >= 0 ? (r[col.notes] || '').trim()    : ''
    const category = col.category >= 0 ? (r[col.category] || '').trim() : null

    // Match employee
    let employee = null
    if (empEmail) employee = byEmail.get(empEmail.toLowerCase())
    if (!employee && empName) employee = byName.get(empName.toLowerCase())
    if (!employee) {
      unmatched.employees.add(empEmail || empName)
      continue
    }

    // Match job (optional — null is fine, it becomes a "general" entry)
    let job = null
    if (jobNum) {
      job = jobByNumber.get(jobNum.toLowerCase())
      if (!job) unmatched.jobs.add(jobNum)
    }

    // Times / hours
    const clockInIso  = hasTimes ? parseDateTime(dateStr, inStr)  : null
    const clockOutIso = hasTimes ? parseDateTime(dateStr, outStr) : null
    let hours = parseDuration(hoursStr)
    if (hours === null && clockInIso && clockOutIso) {
      hours = (new Date(clockOutIso) - new Date(clockInIso)) / 3600000
    }
    if (!hours || hours <= 0) {
      warnings.push(`row ${i+2}: could not compute hours (hoursStr="${hoursStr}", in="${inStr}", out="${outStr}")`)
      continue
    }

    // Row date (YYYY-MM-DD)
    let rowDate = null
    if (dateStr) {
      const d = new Date(dateStr)
      if (!isNaN(d.getTime())) rowDate = d.toISOString().slice(0, 10)
    }
    if (!rowDate && clockInIso) rowDate = clockInIso.slice(0, 10)
    if (!rowDate) { warnings.push(`row ${i+2}: could not determine date`); continue }

    const timeLogId = 'hcp:' + sha12([employee.email, rowDate, clockInIso || hoursStr, jobNum].join('|'))

    prepared.push({
      time_log_id: timeLogId,
      company_id: COMPANY_ID,
      employee_id: employee.id,
      employee_email: employee.email,
      job_id: job ? job.id : null,
      date: rowDate,
      hours: Math.round(hours * 100) / 100,
      clock_in_time: clockInIso,
      clock_out_time: clockOutIso,
      category: category,
      notes: [notes, jobNum && !job ? `(HCP job #${jobNum} — unmatched)` : ''].filter(Boolean).join(' ').trim() || null,
      is_clocked_in: false,
    })
  }

  // ── Summary ──
  console.log('\n─── Summary ───')
  console.log(`Total CSV rows:         ${dataRows.length}`)
  console.log(`Ready to insert:        ${prepared.length}`)
  console.log(`Unmatched employees:    ${unmatched.employees.size}`)
  if (unmatched.employees.size) console.log('  ' + [...unmatched.employees].slice(0, 20).join(', '))
  console.log(`Unmatched job numbers:  ${unmatched.jobs.size}  (rows still imported with job_id=null)`)
  if (unmatched.jobs.size && unmatched.jobs.size <= 20) console.log('  ' + [...unmatched.jobs].join(', '))
  if (warnings.length) {
    console.log(`Warnings:               ${warnings.length}`)
    warnings.slice(0, 10).forEach(w => console.log('  ' + w))
  }

  if (prepared.length) {
    const totalHours = prepared.reduce((s, r) => s + r.hours, 0)
    const byEmp = {}
    for (const r of prepared) byEmp[r.employee_email] = (byEmp[r.employee_email] || 0) + r.hours
    console.log(`Total hours:            ${totalHours.toFixed(1)}`)
    console.log('Hours by employee:')
    for (const [email, hrs] of Object.entries(byEmp).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${email.padEnd(35)} ${hrs.toFixed(1)}`)
    }
  }

  // ── Idempotency: skip existing ──
  if (prepared.length) {
    const existingIds = new Set()
    // Chunk the check so the URL doesn't blow up.
    for (let i = 0; i < prepared.length; i += 100) {
      const chunk = prepared.slice(i, i + 100).map(r => r.time_log_id)
      const q = `time_log?select=time_log_id&time_log_id=in.(${chunk.map(id => `"${id}"`).join(',')})`
      const found = await sbGet(q)
      found.forEach(r => existingIds.add(r.time_log_id))
    }
    const toInsert = prepared.filter(r => !existingIds.has(r.time_log_id))
    console.log(`Already in DB:          ${prepared.length - toInsert.length}`)
    console.log(`Net new to insert:      ${toInsert.length}`)

    if (!apply) {
      console.log('\nDRY RUN — no rows written. Re-run with --apply to insert.')
      return
    }

    if (!toInsert.length) { console.log('\nNothing new to insert.'); return }

    // Insert in batches of 200
    let inserted = 0, failed = 0
    for (let i = 0; i < toInsert.length; i += 200) {
      const batch = toInsert.slice(i, i + 200)
      const r = await sbInsert('time_log', batch)
      if (r.status >= 200 && r.status < 300) {
        inserted += Array.isArray(r.body) ? r.body.length : batch.length
        process.stdout.write(`  inserted ${inserted}/${toInsert.length}\r`)
      } else {
        failed += batch.length
        console.error(`\nBatch ${i}-${i+batch.length} failed (HTTP ${r.status}): ${JSON.stringify(r.body).slice(0, 300)}`)
      }
    }
    console.log(`\nInserted: ${inserted}, Failed: ${failed}`)
  }
})().catch(err => { console.error(err); process.exit(1) })
