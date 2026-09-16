// "Who's free Thursday?" — "Put Mike on the Halifax bays Thursday."
//
// Two halves. The READ (crewDay) is the roster for one day: for every
// active employee, the job sections they are on, their appointments,
// approved time off, and whether they are clocked in right now — plus who
// is free and which sections that day have nobody on them. "Free" means
// no section, no appointment, no time off; it does not mean idle, it means
// unbooked, and the card says which.
//
// The WRITE (section_assign) is what the job page's section editor writes
// (src/pages/JobDetail.jsx, handleSaveSection): assigned_to and
// scheduled_date on ONE job section. Nothing else — no status change, no
// hours, no shuffling of other sections. If the person already has work
// or time off that day, the card says so as a clash and the manager
// decides; Arnie does not pick the least-busy tech for you.
//
// Who: manager (level 2). Dispatch is a manager's call, the same as on
// the job page.

import type { Rest } from './arnieConfig.ts'
import type { Caller } from './auth.ts'
import { readRecordList, patchRow } from './arnieRest.ts'
import { findJob } from './arnieShift.ts'
import { resolveDayWord } from './arnieTime.ts'

const SEC_SEL = 'id,job_id,name,status,assigned_to,scheduled_date,estimated_hours,start_time'
const ISO = /^\d{4}-\d{2}-\d{2}$/
const jobLine = (j: any) => [j.job_id, j.job_title, j.customer_name || j.business_name].filter(Boolean).join(' — ') || `Job #${j.id}`
const day = (iso: string) => { try { return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) } catch { return iso } }

/** The roster for one day. Everyone may read it; a schedule is not a secret from the crew on it. */
export async function crewDay(r: Rest, caller: Caller, input: { date?: string; timezone?: string }) {
  const companyId = caller.companyId as number
  const tz = input.timezone && /^[A-Za-z_]+\/[A-Za-z_\/+-]+$/.test(input.timezone) ? input.timezone : 'America/Denver'
  const today = new Date().toLocaleDateString('en-CA', { timeZone: tz })
  const date = String(input.date || '').trim() || today
  if (!ISO.test(date)) return { error: `Give me the day as YYYY-MM-DD — I got "${input.date}".` }
  const dayStart = `${date}T00:00:00`, dayEnd = `${date}T23:59:59`

  const [emps, sections, appts, off, open] = await Promise.all([
    readRecordList(r, `employees?select=id,name,role,user_role&company_id=eq.${companyId}&active=eq.true&order=name&limit=300`),
    readRecordList(r, `job_sections?select=${SEC_SEL}&company_id=eq.${companyId}&scheduled_date=eq.${date}&status=not.in.(Complete,Completed,Verified,Cancelled)&order=start_time.nullsfirst&limit=300`),
    readRecordList(r, `appointments?select=id,title,start_time,salesperson_id,employee_id,location&company_id=eq.${companyId}&start_time=gte.${dayStart}&start_time=lte.${dayEnd}&order=start_time&limit=200`),
    readRecordList(r, `time_off_requests?select=employee_id,start_date,end_date,request_type&company_id=eq.${companyId}&status=eq.approved&start_date=lte.${date}&end_date=gte.${date}&limit=100`),
    date === today ? readRecordList(r, `time_clock?select=employee_id,job_id,clock_in&company_id=eq.${companyId}&clock_out=is.null&limit=100`) : Promise.resolve([]),
  ])
  const jobIds = [...new Set([...sections.map((s: any) => s.job_id), ...open.map((s: any) => s.job_id)].filter(Boolean))]
  const jobs = jobIds.length ? await readRecordList(r, `jobs?select=id,job_id,job_title,customer_name,business_name,address&company_id=eq.${companyId}&id=in.(${jobIds.join(',')})`) : []
  const job = (id: number) => jobs.find((j: any) => String(j.id) === String(id))
  const clock = (iso: string) => { try { return new Date(iso).toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }) } catch { return '' } }

  const crew = emps.map((e: any) => {
    const mine = sections.filter((s: any) => String(s.assigned_to) === String(e.id))
    const myAppts = appts.filter((a: any) => String(a.salesperson_id ?? a.employee_id) === String(e.id))
    const myOff = off.find((o: any) => String(o.employee_id) === String(e.id))
    const punch = open.find((o: any) => String(o.employee_id) === String(e.id))
    return {
      employee_id: e.id, name: e.name, role: e.role || e.user_role || null,
      sections: mine.map((s: any) => ({ job: job(s.job_id) ? jobLine(job(s.job_id)) : `job #${s.job_id}`, section: s.name, hours: s.estimated_hours, status: s.status, address: job(s.job_id)?.address || null })),
      appointments: myAppts.map((a: any) => ({ time: clock(a.start_time), title: a.title, location: a.location })),
      time_off: myOff ? (myOff.request_type || 'time off') : null,
      clocked_in_now: punch ? { since: clock(punch.clock_in), job: punch.job_id && job(punch.job_id) ? jobLine(job(punch.job_id)) : null } : null,
      free: !mine.length && !myAppts.length && !myOff,
    }
  })
  const unstaffed = sections.filter((s: any) => s.assigned_to == null)
  return {
    date, weekday: day(date), timezone: tz,
    free: crew.filter((c: any) => c.free).map((c: any) => c.name),
    free_means: 'no job section, no appointment, no approved time off that day — unbooked, not idle',
    crew,
    unstaffed_sections: unstaffed.map((s: any) => ({ section_id: s.id, job: job(s.job_id) ? jobLine(job(s.job_id)) : `job #${s.job_id}`, section: s.name, hours: s.estimated_hours })),
  }
}

// ── the write ──────────────────────────────────────────────────────────────

const SELF = /\b(my|me|mine|i)\b/
// Every word said appears in the name: "Mike" finds Mike Sullivan; "Mike" with two Mikes on the roster is a question, not a guess.
const nameHits = (name: string, q: string) => { const words = q.split(/\s+/).filter((w) => w.length >= 2); const n = String(name || '').toLowerCase(); return words.length > 0 && words.every((w) => n.includes(w)) }

export type DispatchProposeResult =
  | { proposal: any; preview: { kind: 'record'; label: string; entity: string; field: string; before: string; after: string } }
  | { needs_choice: { id: number; label: string }[]; message: string }
  | { error: string }

export async function proposeSectionAssign(
  r: Rest, caller: Caller,
  input: { record_query?: string; record_id?: number; value: string; timezone?: string; date?: string },
): Promise<DispatchProposeResult> {
  const companyId = caller.companyId
  if (companyId == null) return { error: 'No company on this login.' }
  if (caller.level < 2) return { error: 'Putting someone on a job is a manager\'s call — the same as on the job page. Ask a manager.' }
  const tz = input.timezone && /^[A-Za-z_]+\/[A-Za-z_\/+-]+$/.test(input.timezone) ? input.timezone : 'America/Denver'
  const said = String(input.record_query || '')

  // The person: the value, matched against active employees by name.
  const who = String(input.value || '').trim()
  const emps = await readRecordList(r, `employees?select=id,name&company_id=eq.${companyId}&active=eq.true`)
  const q = who.toLowerCase()
  let person = emps.filter((e: any) => nameHits(e.name, q))
  if (!person.length && SELF.test(q) && caller.employeeId != null) person = emps.filter((e: any) => String(e.id) === String(caller.employeeId))
  if (!person.length) return { error: `I do not find an active employee called "${who}". Give me the name as it is on the Employees page.` }
  if (person.length > 1) return { error: `More than one person matches "${who}": ${person.map((e: any) => e.name).join(', ')}. Which one?` }
  const emp = person[0]

  // The section: by id after a needs_choice, else the job's sections by words.
  let sec: any = null, job: any = null
  if (input.record_id) {
    ;[sec] = await readRecordList(r, `job_sections?select=${SEC_SEL}&company_id=eq.${companyId}&id=eq.${input.record_id}&limit=1`)
    if (!sec) return { error: `There's no job section #${input.record_id} here.` }
    ;[job] = await readRecordList(r, `jobs?select=id,job_id,job_title,customer_name,business_name&company_id=eq.${companyId}&id=eq.${sec.job_id}&limit=1`)
  } else {
    const found = await findJob(r, companyId, said)
    if (!found.rows.length) return { error: `I do not find an open job for "${said.trim()}". Give me the job number or the customer.` }
    if (found.rows.length > 1) return { error: `More than one job matches "${said.trim()}": ${found.rows.slice(0, 5).map(jobLine).join('; ')}. Which one?` }
    job = found.rows[0]
    const secs = await readRecordList(r, `job_sections?select=${SEC_SEL}&company_id=eq.${companyId}&job_id=eq.${job.id}&status=not.in.(Complete,Completed,Verified,Cancelled)&order=sort_order`)
    if (!secs.length) return { error: `${jobLine(job)} has no open sections to put anyone on. Add a section on the job page first.` }
    // A section named in the words wins; else the only one; else ask.
    const words = said.toLowerCase().split(/\s+/).filter((w) => w.length >= 3)
    const named = secs.filter((s: any) => { const n = String(s.name || '').toLowerCase(); return words.some((w) => n.includes(w) && !String(job.job_title || '').toLowerCase().includes(w)) })
    if (named.length === 1) sec = named[0]
    else if (secs.length === 1) sec = secs[0]
    else return { needs_choice: secs.slice(0, 6).map((s: any) => ({ id: s.id, label: `${s.name} · ${s.status}${s.scheduled_date ? ' · ' + day(s.scheduled_date) : ''}${s.assigned_to ? ' · ' + (emps.find((e: any) => String(e.id) === String(s.assigned_to))?.name || 'assigned') : ' · nobody on it'}` })), message: `${jobLine(job)} has ${secs.length} sections. Ask which, then call again with that record_id.` }
  }

  // The day: given, else the section's own, else ask.
  // The day as SAID — the server does the weekday arithmetic (see resolveDayWord).
  const dateSaid = String(input.date || '').trim()
  const date = dateSaid ? resolveDayWord(dateSaid, tz) : (sec.scheduled_date || '')
  if (dateSaid && !date) return { error: `Which day? I can take a weekday ("Thursday"), "tomorrow", or YYYY-MM-DD — I got "${dateSaid}".` }
  if (!date) return { error: `${sec.name} on ${jobLine(job)} has no date yet. Which day is ${emp.name} on it?` }
  if (String(sec.assigned_to) === String(emp.id) && sec.scheduled_date === date) return { error: `${emp.name} is already on ${sec.name} (${jobLine(job)}) for ${day(date)}.` }

  // Clashes: what else the person has that day. Shown, never decided.
  const [others, off] = await Promise.all([
    readRecordList(r, `job_sections?select=${SEC_SEL}&company_id=eq.${companyId}&assigned_to=eq.${emp.id}&scheduled_date=eq.${date}&id=neq.${sec.id}&status=not.in.(Complete,Completed,Verified,Cancelled)&limit=20`),
    readRecordList(r, `time_off_requests?select=request_type&company_id=eq.${companyId}&employee_id=eq.${emp.id}&status=eq.approved&start_date=lte.${date}&end_date=gte.${date}&limit=1`),
  ])
  const otherJobs = others.length ? await readRecordList(r, `jobs?select=id,job_id,job_title,customer_name&company_id=eq.${companyId}&id=in.(${[...new Set(others.map((s: any) => s.job_id))].join(',')})`) : []
  const clash = [
    off.length ? `${emp.name} has approved ${off[0].request_type || 'time off'} that day` : '',
    others.length ? `already on ${others.map((s: any) => { const j = otherJobs.find((x: any) => String(x.id) === String(s.job_id)); return `${s.name} (${j ? jobLine(j) : 'job #' + s.job_id})` }).join(', ')} that day` : '',
  ].filter(Boolean).join('; ')

  const prev = sec.assigned_to ? emps.find((e: any) => String(e.id) === String(sec.assigned_to))?.name || `employee #${sec.assigned_to}` : null
  const entity = `${jobLine(job)} › ${sec.name}${sec.estimated_hours ? ` (${sec.estimated_hours} h)` : ''}`
  const before = `${prev || 'nobody'} · ${sec.scheduled_date ? day(sec.scheduled_date) : 'no date'}`
  const after = `${emp.name} · ${day(date)}${clash ? ` — Clash: ${clash}` : ''}`
  const summary = `Put ${emp.name} on ${sec.name} (${jobLine(job)}) for ${day(date)}${prev && prev !== emp.name ? `, taking it from ${prev}` : ''}.`

  const insert = await fetch(`${r.url}/rest/v1/arnie_proposals`, {
    method: 'POST',
    headers: { apikey: r.key, Authorization: `Bearer ${r.key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({
      company_id: companyId, created_by: caller.email,
      request_text: said || `section #${sec.id}`,
      target: 'section_assign', action: 'set',
      payload: {
        entity_table: 'job_sections', entity_id: sec.id, entity_label: entity, field: 'assigned_to', value: emp.id,
        employee_id: emp.id, employee_name: emp.name, date, tz,
        before: { assigned_to: sec.assigned_to ?? null, scheduled_date: sec.scheduled_date ?? null },
        clash: clash || null,
      },
      summary, before_value: sec.assigned_to ?? null, after_value: emp.id, status: 'pending',
    }),
  })
  if (!insert.ok) return { error: `Couldn't save that draft: ${await insert.text()}` }
  return { proposal: (await insert.json())?.[0], preview: { kind: 'record', label: 'crew assignment', entity, field: 'assigned_to', before, after } }
}

/** The job page's write: assigned_to + scheduled_date. Refuses if the section moved since the draft. */
export async function applySectionAssign(r: Rest, companyId: number, prop: any): Promise<{ ok: true; before: any; after: any } | { ok: false; error: string; stale?: boolean }> {
  const p = prop.payload || {}
  const [sec] = await readRecordList(r, `job_sections?select=${SEC_SEL}&company_id=eq.${companyId}&id=eq.${p.entity_id}&limit=1`)
  if (!sec) return { ok: false, error: 'That job section no longer exists.' }
  if (String(sec.assigned_to ?? '') !== String(p.before?.assigned_to ?? '') || String(sec.scheduled_date ?? '') !== String(p.before?.scheduled_date ?? '')) {
    return { ok: false, stale: true, error: `${p.entity_label} changed since I drafted this. Ask me again and I will redraft it.` }
  }
  const res = await patchRow(r, 'job_sections', companyId, sec.id, { assigned_to: p.employee_id, scheduled_date: p.date, updated_at: new Date().toISOString() })
  if (!res.ok) return { ok: false, error: res.error }
  return { ok: true, before: p.before?.assigned_to ?? null, after: p.employee_id }
}

/** Put the section back to whoever and whenever it was. */
export async function rollbackSectionAssign(r: Rest, companyId: number, prop: any): Promise<{ ok: true; restored: any } | { ok: false; error: string }> {
  const p = prop.payload || {}
  const [sec] = await readRecordList(r, `job_sections?select=${SEC_SEL}&company_id=eq.${companyId}&id=eq.${p.entity_id}&limit=1`)
  if (!sec) return { ok: false, error: 'That job section no longer exists.' }
  if (String(sec.assigned_to ?? '') !== String(p.employee_id ?? '')) return { ok: false, error: `${p.entity_label} has been reassigned since. Change it on the job page.` }
  const res = await patchRow(r, 'job_sections', companyId, sec.id, { assigned_to: p.before?.assigned_to ?? null, scheduled_date: p.before?.scheduled_date ?? null, updated_at: new Date().toISOString() })
  if (!res.ok) return { ok: false, error: res.error }
  return { ok: true, restored: p.before?.assigned_to ?? null }
}
