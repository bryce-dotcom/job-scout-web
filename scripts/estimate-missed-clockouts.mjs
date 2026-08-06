// Estimate clock-out times for punches left open by the cross-midnight bug.
//
// Reports only. Nothing is written without --write, and --write refuses to run
// without an explicit --approve flag, because this is pay.
//
// Evidence, strongest first:
//   1. CREW  — a coworker on the same job that same shift who did clock out.
//             Night crews arrive and leave together, so this is near-direct.
//   2. PING  — last_ping_at, but only when it already runs longer than the
//             person's typical shift. The app stops pinging when the phone
//             locks, so most pings die 20 minutes in; treating that as the end
//             of a night shift would pay someone 0.2h for a full night.
//   3. OWN   — that employee's own median completed shift for the same start
//             window (evening starts and day starts are different jobs).
//   4. CREW-TYPICAL — company median for that window, when the person has no
//             history of their own.
//
// last_ping_at is ALWAYS a floor: we know for certain they were still on site
// then, so no estimate is ever allowed to land before it.

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ENV_FILE = path.resolve(HERE, '../../job-scout-web/.env')
const env = Object.fromEntries(
  fs.readFileSync(ENV_FILE, 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.trim().startsWith('#'))
    .map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }),
)
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

const MAX_SHIFT_HOURS = 18
const COMPANY_ID = 3
const H = 3600000

const denver = (s, opts = {}) => s ? new Date(s).toLocaleString('en-US',
  { timeZone: 'America/Denver', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, ...opts }) : '—'
const denverHour = (s) => Number(new Date(s).toLocaleString('en-US', { timeZone: 'America/Denver', hour: '2-digit', hour12: false }))
const isEvening = (s) => { const h = denverHour(s); return h >= 18 || h < 4 }
const median = (xs) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] }
// Below this many completed shifts, a personal median is an anecdote. Derrick
// had TWO closed night shifts (1.5h, 1.9h) against five left open — and the
// ones the bug ate are precisely the long ones, so his surviving sample skews
// short. Trusting it would underpay him.
const MIN_SAMPLE = 5
const hoursBetween = (a, b) => (new Date(b) - new Date(a)) / H

async function allPunches() {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('time_clock')
      .select('id, employee_id, job_id, clock_in, clock_out, last_ping_at, total_hours')
      .eq('company_id', COMPANY_ID).order('clock_in', { ascending: true }).range(from, from + 999)
    if (error) throw error
    if (!data?.length) break
    rows.push(...data)
    if (data.length < 1000) break
  }
  return rows
}

const punches = await allPunches()
const { data: emps } = await sb.from('employees').select('id, name, hourly_rate, pay_type').eq('company_id', COMPANY_ID)
const empById = new Map((emps || []).map(e => [e.id, e]))

const closed = punches.filter(p => p.clock_out && hoursBetween(p.clock_in, p.clock_out) > 0
  && hoursBetween(p.clock_in, p.clock_out) <= MAX_SHIFT_HOURS)

// Typical completed shift, split by start window, per employee and company-wide.
const durationsFor = (rows, evening) =>
  rows.filter(p => isEvening(p.clock_in) === evening).map(p => hoursBetween(p.clock_in, p.clock_out))
const companyMedian = { true: median(durationsFor(closed, true)), false: median(durationsFor(closed, false)) }
const ownSample = (empId, evening) => durationsFor(closed.filter(p => p.employee_id === empId), evening)
const ownMedian = (empId, evening) => median(ownSample(empId, evening))

const now = new Date()
const stale = punches
  .filter(p => !p.clock_out && hoursBetween(p.clock_in, now) > MAX_SHIFT_HOURS)
  .sort((a, b) => new Date(b.clock_in) - new Date(a.clock_in))

function estimate(p) {
  const evening = isEvening(p.clock_in)
  const own = ownMedian(p.employee_id, evening)
  const typical = own ?? companyMedian[evening] ?? 8
  const floor = p.last_ping_at ? new Date(p.last_ping_at) : null

  let end = null, method = null, note = ''

  // 1. A coworker on the same job who clocked out of the same shift.
  if (p.job_id != null) {
    const mates = closed.filter(c => c.job_id === p.job_id && c.employee_id !== p.employee_id
      && Math.abs(hoursBetween(p.clock_in, c.clock_in)) <= 4)
    if (mates.length) {
      const outs = mates.map(m => new Date(m.clock_out).getTime())
      const candidate = new Date(median(outs))
      const impliedHours = hoursBetween(p.clock_in, candidate)
      // Do not inherit a coworker's unusually long day. On job 23427 the only
      // mate inside the window was Dusty, who worked 12:55pm-2:05am; pairing
      // Lucas to him implied a 14.6h shift against his own ~6h pattern. Being
      // generous with someone else's hours is still getting it wrong.
      // Reference: the person's own median when it rests on enough shifts,
      // otherwise the company median for that start window. Lucas had too few
      // closed day shifts for his own median to count, which is exactly when
      // an inherited outlier does the most damage.
      const reference = (own != null && ownSample(p.employee_id, evening).length >= MIN_SAMPLE)
        ? own
        : companyMedian[evening]
      const tooLong = reference != null && impliedHours > reference * 1.5
      if (!tooLong && impliedHours > 0) {
        end = candidate
        method = 'CREW'
        note = `${mates.length} coworker${mates.length > 1 ? 's' : ''} on job ${p.job_id}`
      }
    }
  }

  // 2. A ping that already outlasts a normal shift is itself the best answer.
  if (!end && floor && hoursBetween(p.clock_in, floor) >= typical * 0.8) {
    end = floor
    method = 'PING'
    note = `app tracked ${hoursBetween(p.clock_in, floor).toFixed(1)}h on site`
  }

  // 3. Someone who started the same job the same night, whose own history is
  //    better than this person's. A two-man night crew arrives 20 minutes
  //    apart and leaves together; borrowing the mate's shift length beats
  //    trusting a median built from two samples.
  if (!end && ownSample(p.employee_id, evening).length < MIN_SAMPLE) {
    const mates = stale.concat(closed).filter(c => c.job_id != null && c.job_id === p.job_id
      && c.employee_id !== p.employee_id && Math.abs(hoursBetween(p.clock_in, c.clock_in)) <= 4)
    const best = mates
      .map(m => ({ m, n: ownSample(m.employee_id, evening).length, med: ownMedian(m.employee_id, evening) }))
      .filter(x => x.med != null && x.n >= MIN_SAMPLE)
      .sort((a, b) => b.n - a.n)[0]
    if (best) {
      // They leave together: the mate's shift ends at mate-in + mate-median.
      end = new Date(new Date(best.m.clock_in).getTime() + best.med * H)
      method = 'CREW-EST'
      note = `left with ${empById.get(best.m.employee_id)?.name || best.m.employee_id} on job ${p.job_id} (${best.n} shifts)`
    }
  }

  // 4./5. Fall back to how long this person's shifts actually run.
  if (!end) {
    end = new Date(new Date(p.clock_in).getTime() + typical * H)
    const n = ownSample(p.employee_id, evening).length
    method = own ? (n >= MIN_SAMPLE ? 'OWN' : 'OWN-THIN') : 'CREW-TYPICAL'
    note = `${typical.toFixed(1)}h median ${evening ? 'night' : 'day'} shift` + (own ? ` (${n} shift${n === 1 ? '' : 's'})` : '')
  }

  // Never end before a ping proves they were still there.
  if (floor && end < floor) { end = floor; note += `; held to last ping` }

  const hours = hoursBetween(p.clock_in, end)
  const confidence = (method === 'CREW' || method === 'PING') ? 'high'
    : (method === 'OWN' || method === 'CREW-EST') ? 'medium'
    : 'low'
  return { end, method, note, hours, evening, confidence }
}

const rows = stale.map(p => ({ p, e: estimate(p) }))

console.log(`\n${rows.length} punches need a clock-out. Estimates below — NOTHING is written.\n`)
console.log('  punch  employee            clocked in            estimated out         hours  conf    basis')
console.log('  ' + '-'.repeat(112))
let totalHours = 0, totalPay = 0
for (const { p, e } of rows) {
  const emp = empById.get(p.employee_id)
  const rate = Number(emp?.hourly_rate) || 0
  totalHours += e.hours
  totalPay += e.hours * rate
  console.log('  ' + String(p.id).padEnd(6),
    String(emp?.name || p.employee_id).padEnd(19),
    denver(p.clock_in).padEnd(21),
    denver(e.end).padEnd(21),
    e.hours.toFixed(1).padStart(5),
    ' ' + e.confidence.padEnd(7),
    `${e.method}: ${e.note}`)
}
console.log('  ' + '-'.repeat(112))
console.log(`  ${totalHours.toFixed(1)} unpaid hours across ${rows.length} shifts` +
  (totalPay ? ` ≈ $${totalPay.toFixed(2)} at current hourly rates` : ''))

const byMethod = rows.reduce((m, { e }) => ({ ...m, [e.method]: (m[e.method] || 0) + 1 }), {})
console.log('  basis:', Object.entries(byMethod).map(([k, v]) => `${k} ${v}`).join('  '))

if (process.argv.includes('--write')) {
  if (!process.argv.includes('--approve')) {
    console.log('\n  --write needs --approve too. This is payroll; refusing.\n')
    process.exit(1)
  }
  for (const { p, e } of rows) {
    const { error } = await sb.from('time_clock').update({
      clock_out: e.end.toISOString(),
      total_hours: Number(e.hours.toFixed(2)),
      flagged_for_review: true,
      review_reason: `Estimated clock-out (${e.method}: ${e.note}) — missed punch, confirm with employee`,
      adjustment_reason: `Auto-estimated after cross-midnight clock-out bug; basis ${e.method}`,
      adjusted_at: new Date().toISOString(),
    }).eq('id', p.id).is('clock_out', null)
    console.log(error ? `  FAILED ${p.id}: ${error.message}` : `  wrote ${p.id} → ${denver(e.end)} (${e.hours.toFixed(1)}h)`)
  }
  console.log('\n  All rows left flagged_for_review so payroll confirms each one.\n')
} else {
  console.log('\n  Re-run with --write --approve to apply. Every row is written flagged for review.\n')
}
