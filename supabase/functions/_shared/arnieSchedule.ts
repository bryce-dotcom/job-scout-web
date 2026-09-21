// "Schedule the Halifax job Thursday at 8 with Jordan and Mike."
//
// The Job Board's Schedule modal, by voice — and the sentence that comes
// right after "Halifax signed". The card shows the day and time (taken as
// said, resolved on the server), how long, who is on it and whether any
// of them already has something that day, and where the lead lands.
// Approve = exactly what PMJobSetter.handleScheduleJobSubmit writes:
// jobs.start_date/end_date, the company's Scheduled status, assigned_team
// (names), job_lead_id (the first person, for clock-in matching), one
// appointment per person with job_id set (the link the calendar sync
// reads), and the lead mirrored to the delivery column.
//
// Who: a manager (level 2) — the same line the dispatch rail draws. A
// clash is shown, never decided: the manager sees "Mike has the Riverside
// bays Thursday" and approves anyway or not.
//
// Rollback: the job back to the day/status/team it had, the appointments
// this made removed — refused once someone has clocked in on it.

import type { Rest } from './arnieConfig.ts'
import type { Caller } from './auth.ts'
import { readRecordList } from './arnieRest.ts'
import { findJob } from './arnieShift.ts'
import { localToUtc, resolveWhenSaid } from './arnieTime.ts'
import { leadStatusForJob } from './estimateConvert.ts'

const hdr = (r: Rest) => ({ apikey: r.key, Authorization: `Bearer ${r.key}`, 'Content-Type': 'application/json' })
const jobLine = (j: any) => [j.job_id, j.job_title, j.customer_name || j.business_name].filter(Boolean).join(' — ') || `Job #${j.id}`
const dayLabel = (iso: string) => { try { return new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' }) } catch { return iso } }
const clock = (iso: string, tz: string) => { try { return new Date(iso).toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }) } catch { return '' } }
const nameHits = (name: string, q: string) => { const words = q.toLowerCase().split(/\s+/).filter((w) => w.length >= 2); const n = String(name || '').toLowerCase(); return words.length > 0 && words.every((w) => n.includes(w)) }
const DONE = ['Completed', 'Verified Complete', 'Invoiced', 'Paid', 'Closed', 'Archived', 'Cancelled']

/** "Jordan and Mike", "Jordan, Mike Sullivan" → the people, or what could not be placed. */
export function splitPeople(said: string): string[] {
  return String(said || '').split(/\s*(?:,|&|\band\b|\+|\/)\s*/i).map((s) => s.trim()).filter(Boolean)
}

export function parseDuration(said: string | undefined, fallback = 4): number {
  const s = String(said || '').toLowerCase().trim()
  if (!s) return fallback
  const m = s.match(/(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours)?/)
  if (!m) return fallback
  const n = Number(m[1])
  if (/day/.test(s)) return Math.min(24, Math.max(1, n * 8))
  return Number.isFinite(n) && n > 0 && n <= 24 ? n : fallback
}

export async function prepareSchedule(r: Rest, caller: Caller, f: Record<string, string>) {
  const companyId = caller.companyId as number
  if (caller.level < 2) return { ok: false as const, error: 'Scheduling a job is a manager\'s call. Ask them — or tell me and I can draft a note to one.' }

  const found = await findJob(r, companyId, f.job)
  if (!found.rows.length) return { ok: false as const, error: `No open job matches "${f.job}". Say the job number, the customer, or the job title.` }
  if (found.rows.length > 1) return { needs_choice: found.rows.slice(0, 6).map((j: any) => ({ id: j.id, label: jobLine(j) })), message: 'More than one job matches. Ask which, then call again with the job named exactly as listed.' }
  const job = found.rows[0]
  if (DONE.includes(job.status)) return { ok: false as const, error: `${jobLine(job)} is ${job.status} — nothing to schedule.` }

  const [co] = await readRecordList(r, `companies?select=timezone&id=eq.${companyId}&limit=1`)
  const tz = co?.timezone || 'America/Denver'
  const when = resolveWhenSaid(f.when || '', tz, 'forward')
  if (!when) return { ok: false as const, error: `I couldn't read "${f.when}" as a day. Say it like "Thursday at 8", "October 1 at 7:30", or "tomorrow morning".` }
  const time = when.time || '08:00'   // the board's default: 8 AM
  const start = localToUtc(`${when.date} ${time}`, tz)
  if (!start) return { ok: false as const, error: `I couldn't place ${when.date} ${time} in ${tz}.` }
  const hours = parseDuration(f.duration, 4)
  const end = new Date(start.getTime() + hours * 3600000)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: tz })
  if (when.date < today) return { ok: false as const, error: `${dayLabel(when.date)} is in the past. Say the day you mean.` }

  // The crew: every name must land on exactly one active person.
  const emps = await readRecordList(r, `employees?select=id,name,role&company_id=eq.${companyId}&active=eq.true&order=name&limit=300`)
  const crew: any[] = []
  for (const said of splitPeople(f.crew || '')) {
    const hits = emps.filter((e: any) => nameHits(e.name, said))
    if (!hits.length) return { ok: false as const, error: `I don't see "${said}" on the roster. Who did you mean?` }
    if (hits.length > 1) return { needs_choice: hits.slice(0, 6).map((e: any) => ({ id: e.id, label: `${e.name}${e.role ? ' — ' + e.role : ''}` })), message: `"${said}" matches more than one person. Ask which, then call again with the full name.` }
    if (!crew.some((c) => c.id === hits[0].id)) crew.push(hits[0])
  }

  // Clashes, shown not decided: sections, appointments and time off on that day for each person.
  const dayStart = `${when.date}T00:00:00`, dayEnd = `${when.date}T23:59:59`
  const clashes: string[] = []
  for (const e of crew) {
    const [secs, appts, off] = await Promise.all([
      readRecordList(r, `job_sections?select=id,job_id,name&company_id=eq.${companyId}&assigned_to=eq.${e.id}&scheduled_date=eq.${when.date}&status=not.in.(Complete,Completed,Verified,Cancelled)&limit=10`),
      readRecordList(r, `appointments?select=id,title,start_time,job_id&company_id=eq.${companyId}&employee_id=eq.${e.id}&start_time=gte.${dayStart}&start_time=lte.${dayEnd}&status=neq.Cancelled&limit=10`),
      readRecordList(r, `time_off_requests?select=request_type&company_id=eq.${companyId}&employee_id=eq.${e.id}&status=eq.approved&start_date=lte.${when.date}&end_date=gte.${when.date}&limit=1`),
    ])
    const otherAppts = appts.filter((a: any) => String(a.job_id) !== String(job.id))
    const bits: string[] = []
    if (off.length) bits.push(`approved ${off[0].request_type || 'time off'}`)
    if (secs.length) {
      const jobs = await readRecordList(r, `jobs?select=id,job_id,job_title,customer_name&company_id=eq.${companyId}&id=in.(${[...new Set(secs.map((s: any) => s.job_id))].join(',')})`)
      bits.push(...secs.map((s: any) => { const j = jobs.find((x: any) => String(x.id) === String(s.job_id)); return `${s.name} on ${j ? jobLine(j) : 'job #' + s.job_id}` }))
    }
    bits.push(...otherAppts.map((a: any) => `${clock(a.start_time, tz)} ${a.title}`))
    if (bits.length) clashes.push(`${e.name}: ${bits.join('; ')}`)
  }

  const [lead] = job.lead_id ? await readRecordList(r, `leads?select=id,status&company_id=eq.${companyId}&id=eq.${job.lead_id}&limit=1`) : [null]
  const [jsRow] = await readRecordList(r, `settings?select=value&company_id=eq.${companyId}&key=eq.job_statuses&limit=1`)
  let jobStatuses: any[] = []
  try { jobStatuses = JSON.parse(jsRow?.value || '[]') } catch { /* defaults */ }
  const scheduled = jobStatuses.find((s: any) => (s?.name || s?.id || s) === 'Scheduled')
  const status = scheduled ? (scheduled.id || scheduled.name || 'Scheduled') : (jobStatuses.length ? null : 'Scheduled')
  const leadStatus = lead ? leadStatusForJob(status || job.status, jobStatuses) : null

  const [full] = await readRecordList(r, `jobs?select=id,status,start_date,end_date,assigned_team,job_lead_id,job_address,customer_id,job_title,job_id&company_id=eq.${companyId}&id=eq.${job.id}&limit=1`)
  const display: { label: string; value: string }[] = [
    { label: 'Job', value: jobLine(job) + (full?.start_date ? ` — currently ${clock(full.start_date, tz)} ${dayLabel(full.start_date.slice(0, 10))}` : ' — unscheduled') },
    { label: 'When', value: `${dayLabel(when.date)} at ${clock(start.toISOString(), tz)}${when.time ? '' : ' (8 AM — the board\'s default; say a time to change it)'} · ${hours} hour${hours === 1 ? '' : 's'}, to ${clock(end.toISOString(), tz)}` },
    { label: 'Crew', value: crew.length ? crew.map((c) => c.name).join(', ') + ` — each gets a calendar entry; ${crew[0].name} is the job lead for clock-in` : 'nobody yet — say who, or assign from the Job Board' },
  ]
  if (clashes.length) display.push({ label: 'Already that day', value: clashes.join(' · ') + ' — approve anyway, or pick another day' })
  display.push({ label: 'Status', value: `${job.status || 'Chillin'} → ${status || job.status}` })
  if (lead) display.push({ label: 'Lead', value: `${lead.status || 'open'} → ${leadStatus}` })

  return {
    ok: true as const,
    columns: {
      job_id: job.id, job_number: job.job_id, job_label: jobLine(job), tz,
      start: start.toISOString(), end: end.toISOString(), hours, status,
      crew: crew.map((c) => ({ id: c.id, name: c.name })), clashes,
      lead_id: lead?.id ?? null, lead_status: leadStatus, lead_status_before: lead?.status ?? null,
      before: { status: full?.status ?? null, start_date: full?.start_date ?? null, end_date: full?.end_date ?? null, assigned_team: full?.assigned_team ?? null, job_lead_id: full?.job_lead_id ?? null },
      job_address: full?.job_address ?? null, customer_id: full?.customer_id ?? null, title: full?.job_title || `Job #${full?.job_id || job.id}`,
    },
    display,
  }
}

export async function applySchedule(r: Rest, companyId: number, prop: any) {
  const c = prop.payload?.columns || {}
  const [job] = await readRecordList(r, `jobs?select=id,status,start_date,updated_at&company_id=eq.${companyId}&id=eq.${c.job_id}&limit=1`)
  if (!job) return { ok: false as const, error: 'That job is gone.' }
  if (DONE.includes(job.status)) return { ok: false as const, stale: true, error: `${c.job_label} is ${job.status} now — nothing to schedule.` }
  if ((job.start_date || null) !== (c.before?.start_date || null) || job.status !== c.before?.status) return { ok: false as const, stale: true, error: `${c.job_label} was scheduled from the board after I drafted this. Look at it there, then ask me again.` }

  const patch: Record<string, unknown> = { start_date: c.start, end_date: c.end, updated_at: new Date().toISOString() }
  if (c.status) patch.status = c.status
  if (c.crew?.length) { patch.assigned_team = c.crew.map((x: any) => x.name).join(', '); patch.job_lead_id = c.crew[0].id }
  const up = await fetch(`${r.url}/rest/v1/jobs?id=eq.${c.job_id}&company_id=eq.${companyId}`, { method: 'PATCH', headers: { ...hdr(r), Prefer: 'return=minimal' }, body: JSON.stringify(patch) })
  if (!up.ok) return { ok: false as const, error: `Could not schedule: ${up.status} ${await up.text()}` }

  let appointmentIds: number[] = []
  if (c.crew?.length) {
    const rows = c.crew.map((e: any) => ({
      company_id: companyId,
      title: c.crew.length > 1 ? `${c.title} (${e.name})` : c.title,
      start_time: c.start, end_time: c.end, location: c.job_address || '', status: 'Scheduled',
      employee_id: e.id, customer_id: c.customer_id || null, job_id: c.job_id, appointment_type: 'Job',
      notes: `Job: ${c.title} | Assigned: ${e.name} | Scheduled by Arnie`, created_at: new Date().toISOString(),
    }))
    const ins = await fetch(`${r.url}/rest/v1/appointments`, { method: 'POST', headers: { ...hdr(r), Prefer: 'return=representation' }, body: JSON.stringify(rows) })
    if (ins.ok) appointmentIds = (await ins.json()).map((a: any) => a.id)
    else console.error('[arnieSchedule] appointments failed', ins.status, await ins.text())
  }
  if (c.lead_id && c.lead_status) await fetch(`${r.url}/rest/v1/leads?id=eq.${c.lead_id}&company_id=eq.${companyId}`, { method: 'PATCH', headers: { ...hdr(r), Prefer: 'return=minimal' }, body: JSON.stringify({ status: c.lead_status, updated_at: new Date().toISOString() }) })
  return { ok: true as const, id: c.job_id, label: `${c.job_label} — scheduled`, created: { appointment_ids: appointmentIds } }
}

export async function rollbackSchedule(r: Rest, companyId: number, prop: any) {
  const c = prop.payload?.columns || {}
  const clocked = await readRecordList(r, `time_clock?select=id&company_id=eq.${companyId}&job_id=eq.${c.job_id}&clock_in=gte.${c.start}&limit=1`)
  if (clocked.length) return { ok: false as const, error: `Someone has clocked in on ${c.job_label} since. Reschedule it from the Job Board instead.` }
  const ids: number[] = prop.payload?.created?.appointment_ids || []
  if (ids.length) await fetch(`${r.url}/rest/v1/appointments?company_id=eq.${companyId}&id=in.(${ids.join(',')})`, { method: 'DELETE', headers: { ...hdr(r), Prefer: 'return=minimal' } })
  const b = c.before || {}
  const back = await fetch(`${r.url}/rest/v1/jobs?id=eq.${c.job_id}&company_id=eq.${companyId}`, { method: 'PATCH', headers: { ...hdr(r), Prefer: 'return=minimal' }, body: JSON.stringify({ status: b.status, start_date: b.start_date, end_date: b.end_date, assigned_team: b.assigned_team, job_lead_id: b.job_lead_id, updated_at: new Date().toISOString() }) })
  if (!back.ok) return { ok: false as const, error: `Could not put the job back: ${back.status} ${await back.text()}` }
  if (c.lead_id) await fetch(`${r.url}/rest/v1/leads?id=eq.${c.lead_id}&company_id=eq.${companyId}`, { method: 'PATCH', headers: { ...hdr(r), Prefer: 'return=minimal' }, body: JSON.stringify({ status: c.lead_status_before, updated_at: new Date().toISOString() }) })
  return { ok: true as const, deleted: ids.length }
}
