// Pay periods stored one day late.
//
// Every place that turned a period-end Date into a string used
// toISOString().split('T')[0]. That converts to UTC, so 31 Aug 23:59:59
// Mountain became "2026-09-01". Fixed in lib/localDate.js; this corrects the
// rows already written under the bug.
//
// The shift is uniform — every stored end is exactly one day late — so the
// repair is end minus one day. It is verified per row rather than assumed:
// a corrected end must be the day before the next period starts, and for
// semi-monthly must land on the 15th or the last day of its month.
//
// Safe to run because payroll has not been run officially through JobScout
// yet; Gusto is still the system of record. Report only by default anyway.
//
//   npx vite-node scripts/repair-pay-period-ends.mjs
//   npx vite-node scripts/repair-pay-period-ends.mjs --write --approve

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const env = Object.fromEntries(
  fs.readFileSync(path.resolve(HERE, '../../job-scout-web/.env'), 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const WRITE = process.argv.includes('--write')
const APPROVE = process.argv.includes('--approve')
if (WRITE && !APPROVE) {
  console.log('\n  --write needs --approve too. These are payroll records; refusing.\n')
  process.exit(1)
}

const minusOneDay = (ymd) => {
  const [y, m, d] = String(ymd).split('-').map(Number)
  if (!y || !m || !d) return null
  const dt = new Date(y, m - 1, d - 1)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}
const lastDayOf = (y, m) => new Date(y, m, 0).getDate()

/** Does the corrected end look like a real semi-monthly period end? */
const sane = (start, end) => {
  const [, , sd] = String(start).split('-').map(Number)
  const [ey, em, ed] = String(end).split('-').map(Number)
  if (!ey) return false
  if (sd === 1) return ed === 15                    // first half ends the 15th
  if (sd === 16) return ed === lastDayOf(ey, em)    // second half ends month end
  return true                                        // other frequencies: no claim
}

const check = async (table, endCol, startCol, extra = {}) => {
  let q = sb.from(table).select('*').eq('company_id', 3)
  const { data, error } = await q
  if (error) throw new Error(`${table}: ${error.message}`)
  const rows = (data || []).filter(r => r[endCol])
  const fixes = []
  for (const r of rows) {
    // IDEMPOTENT: a row whose end is already a real period end is left alone.
    // Without this the script shifts every row again on a second run, turning
    // a repair tool into a way to corrupt payroll a day at a time.
    if (sane(r[startCol], r[endCol])) continue
    const want = minusOneDay(r[endCol])
    if (!want || want === r[endCol]) continue
    fixes.push({ r, want, ok: sane(r[startCol], want) })
  }
  console.log(`\n${table}: ${rows.length} rows with a ${endCol}, ${fixes.length} to correct`)
  for (const f of fixes) {
    console.log(`   id ${String(f.r.id).padEnd(5)} ${f.r[startCol]} -> ${f.r[endCol]}   becomes ${f.want}   ${f.ok ? '' : '   <-- does NOT look like a period end, skipping'}`)
  }
  return fixes
}

const runs = await check('payroll_runs', 'period_end', 'period_start')
const adj = await check('payroll_adjustments', 'pay_period_end', 'pay_period_start')

if (!WRITE) {
  console.log('\n  Report only. --write --approve to apply.\n')
  process.exit(0)
}

for (const [table, endCol, fixes] of [['payroll_runs', 'period_end', runs], ['payroll_adjustments', 'pay_period_end', adj]]) {
  const go = fixes.filter(f => f.ok)
  console.log(`\n  ${table}: writing ${go.length} of ${fixes.length}`)
  for (const f of go) {
    const { error } = await sb.from(table).update({ [endCol]: f.want }).eq('id', f.r.id).eq('company_id', 3)
    console.log(error ? `   FAILED ${f.r.id}: ${error.message}` : `   ${f.r.id}: ${f.r[endCol]} -> ${f.want}`)
  }
  const skipped = fixes.filter(f => !f.ok)
  if (skipped.length) console.log(`   left alone (unrecognised shape): ${skipped.map(f => f.r.id).join(', ')}`)
}
console.log('')
