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

type Any = any
const str = (v: unknown) => (v == null ? '' : String(v)).trim()

const DAY_WORDS: Record<string, number> = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 }

/** "7", "7am", "07:00", "half seven" → 0-23, or null when it is not a time. */
export function hourOf(said: string): number | null {
  const t = str(said).toLowerCase()
  if (!t) return null
  if (/\bnoon\b|\bmidday\b/.test(t)) return 12
  if (/\bmidnight\b/.test(t)) return 0
  const m = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/.exec(t)
  if (!m) return null
  let h = Number(m[1])
  if (h > 23) return null
  if (m[3] === 'pm' && h < 12) h += 12
  if (m[3] === 'am' && h === 12) h = 0
  // No am/pm: a routine at "7" is the morning, at "5" the evening is likelier
  // than 5am, but neither is safe to assume — so only the unambiguous half is
  // taken and the rest asks.
  if (!m[3] && h >= 1 && h <= 7) return h
  return h
}

export async function prepareRoutine(r: Rest, caller: Caller, f: Record<string, string>): Promise<Prepared> {
  const companyId = caller.companyId as number
  const employeeId = caller.employeeId as number | null
  if (employeeId == null) return { ok: false, error: 'This login has no employee record, so there is nobody to run a routine for.' }

  const name = str(f.routine_name).replace(/\s+/g, ' ')
  const prompt = str(f.prompt).replace(/\s+/g, ' ')
  if (prompt.length < 6) return { ok: false, error: 'Tell me what to check, the way you would ask me for it.' }

  const hour = hourOf(f.when)
  if (hour == null) return { ok: false, error: `What time should I run "${name || 'that'}"? Say it as an hour — "7am", "half past six", "noon".` }

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

  const label = (h: number) => `${((h + 11) % 12) + 1}${h < 12 ? 'am' : 'pm'}`
  return {
    ok: true,
    columns: {
      company_id: companyId,
      employee_id: employeeId,
      name: name || prompt.slice(0, 60),
      prompt,
      channel,
      hour_local: hour,
      timezone: tz,
      weekdays_only: weekdaysOnly,
      created_by: employeeId,
    },
    display: [
      { label: 'Routine', value: name || prompt.slice(0, 60) },
      { label: 'Asks', value: prompt },
      { label: 'When', value: `${weekdaysOnly ? 'Every weekday' : 'Every day'} at ${label(hour)} (${tz})` },
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
