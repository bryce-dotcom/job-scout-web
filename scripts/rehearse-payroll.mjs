// Rehearse a pay period by hand: the real engine, the real loader, the real
// guards, on production data, writing nothing (lib/payrollRehearsal).
//
// docs/PAYROLL_PLAN.md step 6. The build that ships is the build in
// production, so the rehearsal is not a second tenant: it is this period run
// the way the Payroll page will run it, a day early, with the result in
// front of the office before anyone presses the button. The cron
// (api/cron/payroll-rehearsal.js) does the same thing the day before every
// payday; this is for running it now.
//
//   node scripts/rehearse-payroll.mjs --company 3                 this period, print totals
//   node scripts/rehearse-payroll.mjs --company 3 --people        and the per-person lines
//   node scripts/rehearse-payroll.mjs --company 3 --notify        and send the notice to HR
//   node scripts/rehearse-payroll.mjs --company 3 --offset -1     the previous period

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
const flag = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d }
const COMPANY_ID = Number(flag('--company'))
const OFFSET = Number(flag('--offset', '0')) || 0
const NOTIFY = args.includes('--notify'), PEOPLE = args.includes('--people')
if (!COMPANY_ID) { console.error('usage: rehearse-payroll.mjs --company <id> [--offset n] [--people] [--notify]'); process.exit(1) }

const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(l => l.includes('=') && !l.startsWith('#')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')] }))
const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// src/lib uses extensionless imports (Vite resolves them); bundle it first.
const { build } = await import('esbuild')
const bundled = path.join(os.tmpdir(), 'jobscout-payroll-rehearsal.mjs')
await build({ entryPoints: ['src/lib/payrollRehearsal.js'], bundle: true, format: 'esm', platform: 'node', outfile: bundled, logLevel: 'silent' })
const { rehearsePayroll, rehearsalNotices } = await import(pathToFileURL(bundled).href)

const r = await rehearsePayroll(supabase, { companyId: COMPANY_ID, offset: OFFSET })
console.log([r.head, r.looks, '', ...r.lines].join('\n'))
if (PEOPLE) console.log(['', 'By person:', ...r.people].join('\n'))
if (NOTIFY) {
  const rows = rehearsalNotices(r, { companyId: COMPANY_ID })
  if (rows.length) { const { error } = await supabase.from('employee_notifications').insert(rows); if (error) throw new Error(error.message) }
  console.log(`\nnotice sent to ${rows.length} HR user(s)`)
}
