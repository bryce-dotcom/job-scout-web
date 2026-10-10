// Standing work: the routines Arnie runs on a schedule.
//
// A routine is a question asked every weekday morning and answered where the
// person reads things — which is exactly the shape of the two a rep built for
// himself before we had any: a Lead Setter check, and a daily refresh of what
// moved. It runs through the same Arnie as a typed question, as the employee
// it belongs to, so it sees what they would see and nothing more.
//
// What it will NOT do is act on its own. Anything that changes a record comes
// back as a card addressed to that person; a routine is allowed to notice, not
// to decide. The rails do not loosen because nobody is watching — if anything
// that is when they matter most.
//
// Due-ness is per person, in their own zone, once a day. The brief
// (arnie-brief-push) works the same way and for the same reason: an hourly
// cron is the only clock, so "7am" has to mean 7am where they are, and a row
// already run today must not run again when the hour comes round in another
// timezone.

// deno-lint-ignore-file no-explicit-any
import { runArnieTurn, plainText } from './arnieHeadless.ts'
import { forSms } from './arnieSms.ts'

type Any = any
const str = (v: unknown) => (v == null ? '' : String(v)).trim()

export interface RoutineRest { url: string; key: string; internalKey?: string }
const H = (r: RoutineRest) => ({ apikey: r.key, Authorization: `Bearer ${r.key}`, 'Content-Type': 'application/json' })
const FH = (r: RoutineRest) => ({ ...H(r), ...(r.internalKey ? { 'x-arnie-internal': r.internalKey } : {}) })

/** The local hour and calendar day for a zone, from one instant. */
export function localNow(tz: string, now = new Date()): { hour: number; day: string; weekday: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz || 'UTC', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', weekday: 'short',
  }).formatToParts(now)
  const get = (t: string) => parts.find((p) => p.type === t)?.value || ''
  const WD: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  // 24 is midnight in some locales' hourCycle; fold it back to 0.
  const hour = Number(get('hour')) % 24
  return { hour, day: `${get('year')}-${get('month')}-${get('day')}`, weekday: WD[get('weekday')] ?? 0 }
}

/**
 * Is this routine due right now?
 *
 * Deliberately conservative at both ends: a row with no timezone is not run on
 * a guess, and one already run today is never run twice. Missing an hour is
 * recoverable; sending somebody their morning check twice is the kind of thing
 * that makes people turn a feature off.
 */
export function isDue(routine: Any, now = new Date()): { due: boolean; why: string } {
  if (!routine?.enabled) return { due: false, why: 'disabled' }
  const tz = str(routine.timezone)
  if (!tz) return { due: false, why: 'no timezone' }
  const { hour, day, weekday } = localNow(tz, now)
  if (hour !== Number(routine.hour_local)) return { due: false, why: `local hour ${hour}, wants ${routine.hour_local}` }
  if (routine.weekdays_only && (weekday === 0 || weekday === 6)) return { due: false, why: 'weekend' }
  if (str(routine.last_run_on) === day) return { due: false, why: 'already ran today' }
  return { due: true, why: day }
}

export async function dueRoutines(r: RoutineRest, now = new Date()): Promise<Any[]> {
  const res = await fetch(`${r.url}/rest/v1/arnie_routines?select=*&enabled=eq.true&limit=2000`, { headers: H(r) })
  if (!res.ok) return []
  const rows: Any[] = await res.json().catch(() => [])
  return rows.filter((x) => isDue(x, now).due)
}

/** Where the answer goes. The app always gets a copy — it is the durable one. */
async function deliver(r: RoutineRest, routine: Any, employee: Any, answer: string, day: string) {
  const title = `${str(routine.name) || 'Routine'}`
  const channel = str(routine.channel) || 'app'

  if (channel === 'app' || channel === 'sms' || channel === 'email') {
    await fetch(`${r.url}/rest/v1/employee_notifications?on_conflict=employee_id,dedupe_key`, {
      method: 'POST',
      headers: { ...H(r), Prefer: 'return=minimal,resolution=merge-duplicates' },
      body: JSON.stringify([{
        company_id: routine.company_id,
        employee_id: routine.employee_id,
        type: 'arnie_routine',
        title,
        message: plainText(answer).slice(0, 4000),
        route: '/agents/arnie',
        metadata: { routine_id: routine.id, ran_on: day },
        dedupe_key: `routine:${routine.id}:${day}`,
      }]),
    }).catch(() => {})
  }

  if (channel === 'sms' && str(employee?.phone)) {
    await fetch(`${r.url}/functions/v1/send-sms`, {
      method: 'POST', headers: FH(r),
      body: JSON.stringify({ to: employee.phone, body: forSms(`${title}\n\n${answer}`), company_id: routine.company_id }),
    }).catch(() => {})
  }

  if (channel === 'email' && str(employee?.email)) {
    await fetch(`${r.url}/functions/v1/send-email`, {
      method: 'POST', headers: FH(r),
      body: JSON.stringify({
        to: employee.email,
        subject: title,
        html: `<div style="font:14px/1.6 -apple-system,Segoe UI,Arial,sans-serif;color:#2c3530;max-width:640px"><h2 style="font-size:16px;margin:0 0 10px">${title}</h2><pre style="white-space:pre-wrap;font:13px/1.6 -apple-system,Segoe UI,Arial,sans-serif;margin:0">${plainText(answer).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre></div>`,
      }),
    }).catch(() => {})
  }
}

/** Run one routine and record what happened, success or not. */
export async function runRoutine(r: RoutineRest, routine: Any, now = new Date()): Promise<{ ok: boolean; answer?: string; error?: string }> {
  const { day } = localNow(str(routine.timezone) || 'UTC', now)
  const empRes = await fetch(
    `${r.url}/rest/v1/employees?select=id,company_id,email,phone,name,role,user_role,is_admin,is_developer,has_hr_access&active=eq.true&id=eq.${routine.employee_id}&limit=1`,
    { headers: H(r) },
  )
  const employee = empRes.ok ? (await empRes.json().catch(() => []))?.[0] : null
  // A routine belonging to somebody who has left stops, and says so, rather
  // than running as a ghost or failing every hour in silence.
  if (!employee) {
    await stamp(r, routine.id, { last_run_on: day, last_error: 'the employee is no longer active', enabled: false })
    return { ok: false, error: 'employee not active' }
  }

  const turn = await runArnieTurn(r, { employee, messages: [{ role: 'user', content: str(routine.prompt) }] })
  if (turn.error || !str(turn.text)) {
    await stamp(r, routine.id, { last_error: turn.error || 'no answer' })
    return { ok: false, error: turn.error || 'no answer' }
  }

  await deliver(r, routine, employee, turn.text, day)
  await stamp(r, routine.id, { last_run_on: day, last_result: plainText(turn.text).slice(0, 2000), last_error: null })
  return { ok: true, answer: turn.text }
}

async function stamp(r: RoutineRest, id: number, patch: Record<string, unknown>) {
  await fetch(`${r.url}/rest/v1/arnie_routines?id=eq.${id}`, {
    method: 'PATCH', headers: H(r),
    body: JSON.stringify({ ...patch, updated_at: new Date().toISOString() }),
  }).catch(() => {})
}
