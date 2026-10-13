// "Every weekday at seven, text me what the setters booked."
//
// The create rail for a routine — so standing work is something a person SAYS,
// not something an admin configures. That is the whole difference between a
// feature and a teammate: the rep who built his own bot taught it his morning
// check in a sentence, and never opened a settings page to do it.
//
// A routine is a prompt plus a when plus a where. It runs as the person who
// owns it, with their access, and anything it would change still comes back as
// a card for them to approve — so creating one can never widen what they can
// do, only when they get told about it.

// deno-lint-ignore-file no-explicit-any
import type { Caller, Prepared, Rest } from './arnieConfig.ts'
import { readRecordList } from './arnieRest.ts'
import { localNow } from './arnieRoutines.ts'

type Any = any
const str = (v: unknown) => (v == null ? '' : String(v)).trim()

const DAY_WORDS: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 }

/**
 * "7", "7am", "08:45", "half past six", "quarter to five" → { hour, minute },
 * or null when it is not a time.
 *
 * The minutes used to be matched and then thrown on the floor — the table had
 * nowhere to put them. Somebody asked for 8:45 and was quietly given 8:00,
 * which is how you end up watching for an email that is not coming.
 */
export function timeOf(said: string): { hour: number; minute: number } | null {
  const t = str(said).toLowerCase()
  if (!t) return null
  if (/\bnoon\b|\bmidday\b/.test(t)) return { hour: 12, minute: 0 }
  if (/\bmidnight\b/.test(t)) return { hour: 0, minute: 0 }

  // Spoken fractions, before the digit match — "half past six" has a 6 in it
  // and would otherwise come out as six o'clock, an error of thirty minutes
  // that nobody would ever see in the card.
  const spoken = /\b(half|quarter)\s+(past|to|after|before)\s+(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b/.exec(t)
  if (spoken) {
    const WORD: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 }
    const base = /^\d+$/.test(spoken[3]) ? Number(spoken[3]) : WORD[spoken[3]]
    if (base != null && base <= 23) {
      const back = spoken[2] === 'to' || spoken[2] === 'before'
      const mins = spoken[1] === 'half' ? 30 : 15
      let h = base
      let min = mins
      if (back) { h = (base + 23) % 24; min = 60 - mins }
      if (/\bpm\b/.test(t) && h < 12) h += 12
      if (/\bam\b/.test(t) && h === 12) h = 0
      return { hour: h, minute: min }
    }
  }

  const m = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/.exec(t)
  if (!m) return null
  let h = Number(m[1])
  if (h > 23) return null
  const minute = m[2] == null ? 0 : Number(m[2])
  if (minute > 59) return null
  if (m[3] === 'pm' && h < 12) h += 12
  if (m[3] === 'am' && h === 12) h = 0
  // A bare "5" with no am/pm is taken as 5 in the morning. That is a guess,
  // and the card is what catches it — it writes the time back in words before
  // anybody approves anything. (The original had a branch here that read as
  // though it disambiguated; both halves returned the same value, so it never
  // did. Left as it behaves, said plainly, rather than quietly changed.)
  return { hour: h, minute }
}

/** The hour alone. Kept because callers and tests ask for it by name. */
export function hourOf(said: string): number | null {
  return timeOf(said)?.hour ?? null
}

/** "8:45am", "7am", "noon" — the way a time is written back to a person. */
export function timeLabel(hour: number, minute: number): string {
  const h12 = ((hour + 11) % 12) + 1
  const ap = hour < 12 ? 'am' : 'pm'
  return minute ? `${h12}:${String(minute).padStart(2, '0')}${ap}` : `${h12}${ap}`
}

export async function prepareRoutine(r: Rest, caller: Caller, f: Record<string, string>): Promise<Prepared> {
  const companyId = caller.companyId as number
  const employeeId = caller.employeeId as number | null
  if (employeeId == null) return { ok: false, error: 'This login has no employee record, so there is nobody to run a routine for.' }

  const name = str(f.routine_name).replace(/\s+/g, ' ')
  const prompt = str(f.prompt).replace(/\s+/g, ' ')
  if (prompt.length < 6) return { ok: false, error: 'Tell me what to check, the way you would ask me for it.' }

  const when = timeOf(f.when)
  if (when == null) return { ok: false, error: `What time should I run "${name || 'that'}"? Say it as a time — "7am", "8:45", "half past six", "noon".` }
  const { hour, minute } = when

  const channel = (str(f.how).toLowerCase() || 'app') as string
  if (!['app', 'sms', 'email'].includes(channel)) return { ok: false, error: `I can put it in the app, text it or email it — not "${f.how}".` }

  // Where the person is, not where the server is.
  const [company] = await readRecordList(r, `companies?select=timezone,company_name&id=eq.${companyId}&limit=1`)
  const tz = str(company?.timezone) || 'America/Denver'

  const [me] = await readRecordList(r, `employees?select=id,name,email,phone&id=eq.${employeeId}&limit=1`)
  if (channel === 'sms' && !str(me?.phone)) return { ok: false, error: 'There is no mobile number on your employee record, so I cannot text it. Add one on the Employees page, or have it in the app.' }
  if (channel === 'email' && !str(me?.email)) return { ok: false, error: 'There is no email on your employee record to send it to.' }

  const everyDay = str(f.every_day).toLowerCase()
  // "every day" is the only thing that turns the weekday default off — a
  // routine that surprises somebody on a Sunday is a routine they disable.
  const weekdaysOnly = !/^(y|yes|true|every ?day|daily)/.test(everyDay)

  const mine = await readRecordList(r, `arnie_routines?select=id,name&employee_id=eq.${employeeId}&limit=50`)
  const clash = mine.find((x: Any) => str(x.name).toLowerCase() === name.toLowerCase())
  if (clash) return { ok: false, error: `You already have a routine called "${name}". Rename this one, or ask me to change that one instead.` }

  // If that time has already gone today, the routine starts tomorrow.
  //
  // isDue allows a short catch-up window so a missed cron tick still runs;
  // without this, approving an 8:45 routine at 8:50 would fire it there and
  // then, which reads as a bug rather than a schedule. Stamping the day it
  // was made as "already run" is the whole guard.
  const { hour: nowH, minute: nowM, day: today } = localNow(tz)
  const alreadyGone = nowH * 60 + nowM >= hour * 60 + minute

  return {
    ok: true,
    columns: {
      company_id: companyId,
      employee_id: employeeId,
      name: name || prompt.slice(0, 60),
      prompt,
      channel,
      hour_local: hour,
      minute_local: minute,
      timezone: tz,
      weekdays_only: weekdaysOnly,
      created_by: employeeId,
      ...(alreadyGone ? { last_run_on: today } : {}),
    },
    display: [
      { label: 'Routine', value: name || prompt.slice(0, 60) },
      { label: 'Asks', value: prompt },
      { label: 'When', value: `${weekdaysOnly ? 'Every weekday' : 'Every day'} at ${timeLabel(hour, minute)} (${tz})${alreadyGone ? ' — starting tomorrow' : ''}` },
      { label: 'Where', value: channel === 'sms' ? `Texted to ${me?.phone}` : channel === 'email' ? `Emailed to ${me?.email}` : 'In the app, on your notifications' },
      { label: 'Runs as', value: `${str(me?.name) || 'you'} — it sees what you see, and anything it would change still comes back as a card` },
    ],
  }
}

export async function rollbackRoutine(r: Rest, companyId: number, prop: Any): Promise<{ ok: true; deleted: number } | { ok: false; error: string }> {
  const id = Number(prop.payload?.created?.id)
  if (!id) return { ok: false, error: 'There is no routine id on that approval to undo.' }
  const res = await fetch(`${r.url}/rest/v1/arnie_routines?id=eq.${id}&company_id=eq.${companyId}`, {
    method: 'DELETE', headers: { apikey: r.key, Authorization: `Bearer ${r.key}` },
  })
  if (!res.ok) return { ok: false, error: `The routine could not be removed (${res.status}).` }
  return { ok: true, deleted: 1 }
}
