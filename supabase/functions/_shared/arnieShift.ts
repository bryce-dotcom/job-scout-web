// "Clock me out at 5:30 yesterday."
//
// The daily brief finds a shift left open from a previous day and says so —
// "those hours will not pay correctly until it is closed" — and then the
// tech has to go find the Payroll page, or an admin, to close it. This is
// the fix, by voice, behind the same card as every other change.
//
// What gets written is exactly what the Payroll page writes when an admin
// fixes a missed clock-out (src/pages/Payroll.jsx, handleSaveEntry):
// clock_out, total_hours less any lunch, and the adjustment trail —
// adjusted_by, adjusted_at, adjustment_reason, with the original values
// kept on the first adjustment. Nothing is invented: the time comes from
// the person, in their zone, and is checked against the clock-in.
//
// Who: your OWN open shift, anyone. Someone else's, admin — the Payroll
// page's rule.

import type { Rest } from './arnieConfig.ts'
import type { Caller } from './auth.ts'
import { readRecordList, patchRow } from './arnieRest.ts'
import { localToUtc } from './arnieTime.ts'

const fmt = (iso: string | Date, tz: string) => {
  try { return new Date(iso).toLocaleString('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) } catch { return String(iso) }
}
const hoursBetween = (row: any, out: Date) => {
  let h = (out.getTime() - new Date(row.clock_in).getTime()) / 36e5
  if (row.lunch_start && row.lunch_end) h -= (new Date(row.lunch_end).getTime() - new Date(row.lunch_start).getTime()) / 36e5
  return Math.round(h * 100) / 100
}

export type ShiftProposeResult =
  | { proposal: any; preview: { kind: 'record'; label: string; entity: string; field: string; before: string; after: string } }
  | { needs_choice: { id: number; label: string }[]; message: string }
  | { error: string }

/**
 * Whose shift? The description names a person or it does not. When it
 * does, and it is not the caller, the Payroll page's rule applies: admin.
 */
async function whoseShift(r: Rest, caller: Caller, query: string): Promise<{ id: number; name: string; self: boolean } | { needs_choice: { id: number; label: string }[]; message: string } | { error: string }> {
  const companyId = caller.companyId as number
  const emps = await readRecordList(r, `employees?select=id,name&company_id=eq.${companyId}&active=eq.true`)
  const me = emps.find((e: any) => String(e.id) === String(caller.employeeId))
  const q = String(query || '').toLowerCase()
  const named = emps.filter((e: any) => {
    const parts = String(e.name || '').toLowerCase().split(/\s+/).filter((p: string) => p.length >= 3)
    return parts.length && parts.every((p: string) => q.includes(p))
  })
  const selfWords = /\b(my|me|mine|i)\b/.test(q)
  if (!named.length || (named.length === 1 && String(named[0].id) === String(caller.employeeId))) {
    if (!me) return { error: 'This login has no employee record, so there is no shift to close.' }
    return { id: me.id, name: me.name, self: true }
  }
  if (named.length > 1 && !selfWords) {
    return { needs_choice: named.slice(0, 6).map((e: any) => ({ id: e.id, label: e.name })), message: 'More than one person matches. Ask which, then call again with the full name.' }
  }
  const other = named[0]
  if (caller.level < 3) return { error: `You can close your own open shift. Closing ${other.name}'s needs an admin — that is the Payroll page's rule too.` }
  return { id: other.id, name: other.name, self: false }
}

export async function proposeShiftClose(
  r: Rest, caller: Caller,
  input: { record_query?: string; record_id?: number; value: string; timezone?: string },
): Promise<ShiftProposeResult> {
  const companyId = caller.companyId
  if (companyId == null) return { error: 'No company on this login.' }
  const tz = input.timezone && /^[A-Za-z_]+\/[A-Za-z_\/+-]+$/.test(input.timezone) ? input.timezone : 'America/Denver'

  // The row: by id after a needs_choice, else the open shift of whoever was named.
  let row: any
  if (input.record_id) {
    ;[row] = await readRecordList(r, `time_clock?select=id,employee_id,clock_in,clock_out,lunch_start,lunch_end,job_id,original_clock_in&company_id=eq.${companyId}&id=eq.${input.record_id}&limit=1`)
    if (!row) return { error: `There's no time entry #${input.record_id} here.` }
    if (String(row.employee_id) !== String(caller.employeeId) && caller.level < 3) return { error: 'You can close your own open shift; someone else\'s needs an admin.' }
  } else {
    const who = await whoseShift(r, caller, input.record_query || '')
    if ('error' in who) return { error: who.error }
    if ('needs_choice' in who) return who
    const open = await readRecordList(r, `time_clock?select=id,employee_id,clock_in,clock_out,lunch_start,lunch_end,job_id,original_clock_in&company_id=eq.${companyId}&employee_id=eq.${who.id}&clock_out=is.null&order=clock_in`)
    if (!open.length) return { error: `${who.self ? 'You have' : who.name + ' has'} no open shift — nothing to close.` }
    if (open.length > 1) {
      return { needs_choice: open.map((o: any) => ({ id: o.id, label: `clocked in ${fmt(o.clock_in, tz)}` })), message: `${who.self ? 'You have' : who.name + ' has'} more than one open shift. Ask which, then call again with record_id.` }
    }
    row = open[0]
  }
  if (row.clock_out) return { error: `That shift is already closed at ${fmt(row.clock_out, tz)}.` }

  // The time. "now", or a wall-clock time in the caller's zone.
  const v = String(input.value || '').trim().toLowerCase()
  const out = v === 'now' || v === '' ? new Date() : localToUtc(input.value, tz)
  if (!out) return { error: `Give me the clock-out as YYYY-MM-DD HH:MM in ${tz}, or "now" — I got "${input.value}".` }
  const inAt = new Date(row.clock_in)
  if (out.getTime() <= inAt.getTime()) return { error: `${fmt(out, tz)} is before the clock-in at ${fmt(inAt, tz)}.` }
  if (out.getTime() > Date.now() + 5 * 60000) return { error: `${fmt(out, tz)} is in the future.` }
  const hours = hoursBetween(row, out)
  if (hours > 16) return { error: `That makes a ${hours}-hour shift from ${fmt(inAt, tz)}. Give me the time they actually stopped.` }

  const [emp] = await readRecordList(r, `employees?select=name&company_id=eq.${companyId}&id=eq.${row.employee_id}&limit=1`)
  const [job] = row.job_id ? await readRecordList(r, `jobs?select=job_id,job_title,customer_name&company_id=eq.${companyId}&id=eq.${row.job_id}&limit=1`) : [null]
  const entity = `${emp?.name || 'employee'} — clocked in ${fmt(inAt, tz)}${job ? ' on ' + [job.job_id, job.job_title, job.customer_name].filter(Boolean).join(' — ') : ''}`
  const after = out.toISOString()
  const summary = `Closed ${emp?.name || 'employee'}'s open shift at ${fmt(out, tz)} (${hours} h).`

  const insert = await fetch(`${r.url}/rest/v1/arnie_proposals`, {
    method: 'POST',
    headers: { apikey: r.key, Authorization: `Bearer ${r.key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({
      company_id: companyId, created_by: caller.email,
      request_text: input.record_query || `time entry #${row.id}`,
      target: 'shift_close', action: 'set',
      payload: {
        entity_table: 'time_clock', entity_id: row.id, entity_label: entity, field: 'clock_out', value: after,
        total_hours: hours, tz, said: input.value, proposer_employee_id: caller.employeeId,
        keep_originals: !row.original_clock_in,
        original: { clock_in: row.clock_in, clock_out: null, total_hours: null },
      },
      summary, before_value: null, after_value: after, status: 'pending',
    }),
  })
  if (!insert.ok) return { error: `Couldn't save that draft: ${await insert.text()}` }
  return {
    proposal: (await insert.json())?.[0],
    preview: { kind: 'record', label: 'shift clock-out', entity, field: 'clock_out', before: '(still open)', after: `${fmt(out, tz)} · ${hours} h` },
  }
}

/** Close it — the Payroll page's write, and refuse if someone closed it first. */
export async function applyShiftClose(r: Rest, companyId: number, prop: any): Promise<{ ok: true; before: any; after: any } | { ok: false; error: string; stale?: boolean }> {
  const p = prop.payload || {}
  const [row] = await readRecordList(r, `time_clock?select=id,clock_in,clock_out,lunch_start,lunch_end,original_clock_in&company_id=eq.${companyId}&id=eq.${p.entity_id}&limit=1`)
  if (!row) return { ok: false, error: 'That time entry no longer exists.' }
  if (row.clock_out) return { ok: false, stale: true, error: `That shift was closed since I drafted this — at ${row.clock_out}. Nothing to do.` }
  const out = new Date(p.value)
  const patch: Record<string, unknown> = {
    clock_out: out.toISOString(),
    total_hours: hoursBetween(row, out),
    adjusted_by: p.proposer_employee_id ?? null,
    adjusted_at: new Date().toISOString(),
    adjustment_reason: `Closed via Arnie${p.said ? ` ("${String(p.said).slice(0, 60)}")` : ''} — clock-out was missed.`,
  }
  if (!row.original_clock_in) { patch.original_clock_in = row.clock_in; patch.original_clock_out = null; patch.original_total_hours = null }
  const res = await patchRow(r, 'time_clock', companyId, row.id, patch)
  if (!res.ok) return { ok: false, error: res.error }
  return { ok: true, before: null, after: out.toISOString() }
}

/** Reopen it: clock_out and hours back to null, the adjustment trail cleared. */
export async function rollbackShiftClose(r: Rest, companyId: number, prop: any): Promise<{ ok: true; restored: any } | { ok: false; error: string }> {
  const p = prop.payload || {}
  const [row] = await readRecordList(r, `time_clock?select=id,clock_out&company_id=eq.${companyId}&id=eq.${p.entity_id}&limit=1`)
  if (!row) return { ok: false, error: 'That time entry no longer exists.' }
  if (row.clock_out && row.clock_out !== p.value && new Date(row.clock_out).getTime() !== new Date(p.value).getTime()) {
    return { ok: false, error: `That shift has been changed since — it now ends ${row.clock_out}. Fix it on the Payroll page.` }
  }
  const patch: Record<string, unknown> = { clock_out: null, total_hours: null, adjusted_by: null, adjusted_at: null, adjustment_reason: null }
  if (p.keep_originals) { patch.original_clock_in = null; patch.original_clock_out = null; patch.original_total_hours = null }
  const res = await patchRow(r, 'time_clock', companyId, row.id, patch)
  if (!res.ok) return { ok: false, error: res.error }
  return { ok: true, restored: null }
}

// ─── "Clock me in on the Halifax job." ──────────────────────────────────────
//
// The mirror of the close, and the more common one: a tech says it once a
// morning. What gets written is exactly what Field Scout writes
// (src/pages/FieldScout.jsx, handleClockIn / handleSwitchJob): a time_clock
// row with clock_in = now and the job, the job bumped to In Progress if it
// was Chillin or Scheduled — and, when a shift is already open from today,
// the SWITCH: the open punch closed at this moment with the stamp Field
// Scout leaves, the new one opened a second later so payroll never sees
// two overlapping. What it will not do: open a second shift on top of a
// stale one (Field Scout's rule — only they know when yesterday ended), or
// back-date a punch (that is an adjustment, the Payroll page's job).
//
// Who: yourself. Arnie clocks in the person talking to him, nobody else —
// the same as the clock-in button. No GPS: the card says so.

const NOT_CLOCKABLE = ['Completed', 'Verified Complete', 'Invoiced', 'Paid', 'Closed', 'Archived', 'Cancelled']
const STALE_HOURS = 16
const JOB_SEL = 'id,job_id,job_title,customer_name,business_name,status,start_date'
const jobLine = (j: any) => [j.job_id, j.job_title, j.customer_name || j.business_name].filter(Boolean).join(' — ') || `Job #${j.id}`
const SELF = /\b(my|me|mine|i)\b/
const nameHits = (name: string, q: string) => { const parts = String(name || '').toLowerCase().split(/\s+/).filter((p) => p.length >= 3); return parts.length > 0 && parts.every((p) => q.includes(p)) }

export async function findJob(r: Rest, companyId: number, said: string) {
  const term = String(said || '').replace(/[*,()]/g, ' ').trim()
  const NOISE = new Set(['clock', 'punch', 'the', 'job', 'jobs', 'into', 'onto', 'start', 'switch', 'over', 'for', 'with', 'now', 'shift'])
  const words = [...new Set(term.toLowerCase().split(/\s+/).filter((w) => w.length >= 3 && !NOISE.has(w)))]
  if (!words.length) return { rows: [] as any[], words }
  const hits = new Map<number, { row: any; n: number }>()
  const notIn = NOT_CLOCKABLE.map((s) => `"${s}"`).join(',')
  for (const w of words) {
    const rows = await readRecordList(r, `jobs?select=${JOB_SEL}&company_id=eq.${companyId}&status=not.in.(${notIn})&or=(job_id.ilike.*${w}*,job_title.ilike.*${w}*,customer_name.ilike.*${w}*,business_name.ilike.*${w}*,address.ilike.*${w}*)&limit=40`)
    for (const j of rows) { const h = hits.get(j.id) || { row: j, n: 0 }; h.n += 1; hits.set(j.id, h) }
  }
  const ranked = [...hits.values()].sort((a, b) => b.n - a.n)
  const best = ranked[0]?.n ?? 0
  return { rows: ranked.filter((h) => h.n === best).map((h) => h.row), words }
}

export async function proposeShiftOpen(
  r: Rest, caller: Caller,
  input: { record_query?: string; record_id?: number; value: string; timezone?: string },
): Promise<ShiftProposeResult> {
  const companyId = caller.companyId
  if (companyId == null) return { error: 'No company on this login.' }
  const tz = input.timezone && /^[A-Za-z_]+\/[A-Za-z_\/+-]+$/.test(input.timezone) ? input.timezone : 'America/Denver'
  const said = String(input.record_query || '')
  const q = said.toLowerCase()
  const v = String(input.value || '').trim().toLowerCase()
  if (v && v !== 'now') return { error: 'I clock you in at the moment you approve the card. A punch at an earlier time is an adjustment — that is fixed on the Payroll page, not here.' }

  // Only yourself. The clock-in button has no "for someone else" either.
  const emps = await readRecordList(r, `employees?select=id,name&company_id=eq.${companyId}&active=eq.true`)
  const me = emps.find((e: any) => String(e.id) === String(caller.employeeId))
  if (!me) return { error: 'This login has no active employee record, so there is no one to clock in.' }
  const other = emps.find((e: any) => String(e.id) !== String(me.id) && nameHits(e.name, q))
  if (other && !SELF.test(q)) return { error: `I clock in the person talking to me. ${other.name} clocks in from their own Field Scout — or an admin fixes it on the Payroll page.` }

  // The job: by id after a needs_choice, by words, or none ("clock me in").
  let job: any = null
  const general = /\b(general|no job|without a job|not on a job)\b/.test(q)
  if (input.record_id) {
    ;[job] = await readRecordList(r, `jobs?select=${JOB_SEL}&company_id=eq.${companyId}&id=eq.${input.record_id}&limit=1`)
    if (!job) return { error: `There's no job #${input.record_id} here.` }
    if (NOT_CLOCKABLE.includes(job.status)) return { error: `${jobLine(job)} is ${job.status} — not a job to clock into.` }
  } else if (!general) {
    const found = await findJob(r, companyId, said)
    if (found.rows.length > 1) {
      return { needs_choice: found.rows.slice(0, 6).map((j: any) => ({ id: j.id, label: `${jobLine(j)} · ${j.status}` })), message: 'More than one job matches. Ask which, then call again with that record_id.' }
    }
    job = found.rows[0] || null
    if (!job && found.words.length) {
      return { error: `I do not find an open job for "${said.trim()}". Give me the job number or the customer — or say "clock me in, no job" for a general punch.` }
    }
  }

  // The open shift, if any: today's is a switch, yesterday's is a refusal.
  const open = await readRecordList(r, `time_clock?select=id,job_id,clock_in,lunch_start,lunch_end,notes&company_id=eq.${companyId}&employee_id=eq.${me.id}&clock_out=is.null&order=clock_in.desc&limit=2`)
  const cur = open[0] || null
  if (cur) {
    const hrs = (Date.now() - new Date(cur.clock_in).getTime()) / 36e5
    if (hrs > STALE_HOURS) return { error: `You still have a shift open from ${fmt(cur.clock_in, tz)}. Close that one first so the hours land on the right day — tell me when you actually stopped and I will draft the clock-out.` }
    if (!job) return { error: `You are already clocked in, since ${fmt(cur.clock_in, tz)}${cur.job_id ? ' on a job' : ''}. Name a job and I will switch you to it.` }
    if (String(cur.job_id) === String(job.id)) return { error: `You are already clocked in on ${jobLine(job)}, since ${fmt(cur.clock_in, tz)}.` }
  }
  const [from] = cur?.job_id ? await readRecordList(r, `jobs?select=${JOB_SEL}&company_id=eq.${companyId}&id=eq.${cur.job_id}&limit=1`) : [null]

  const target = job ? jobLine(job) : 'general (no job)'
  const entity = `${me.name} — ${target}`
  const before = cur ? `on ${from ? jobLine(from) : 'general'} since ${fmt(cur.clock_in, tz)}` : '(not clocked in)'
  const bump = job && ['Chillin', 'Scheduled'].includes(job.status) ? '; the job goes to In Progress' : ''
  const after = `${cur ? 'switch to' : 'clock in on'} ${target} at the moment you approve${bump}. No GPS from here.`
  const summary = cur
    ? `Switched ${me.name} from ${from ? jobLine(from) : 'general'} to ${target}.`
    : `Clocked ${me.name} in on ${target}.`

  const insert = await fetch(`${r.url}/rest/v1/arnie_proposals`, {
    method: 'POST',
    headers: { apikey: r.key, Authorization: `Bearer ${r.key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({
      company_id: companyId, created_by: caller.email,
      request_text: said || 'clock me in',
      target: 'shift_open', action: 'set',
      payload: {
        entity_table: 'employees', entity_id: me.id, entity_label: entity, field: 'clock_in', value: 'now',
        employee_id: me.id, job_id: job?.id ?? null, job_status_before: job?.status ?? null,
        switch_from: cur ? { id: cur.id, job_id: cur.job_id, notes: cur.notes ?? null } : null, tz,
      },
      summary, before_value: null, after_value: 'now', status: 'pending',
    }),
  })
  if (!insert.ok) return { error: `Couldn't save that draft: ${await insert.text()}` }
  return {
    proposal: (await insert.json())?.[0],
    preview: { kind: 'record', label: 'shift clock-in', entity, field: 'clock_in', before, after },
  }
}

/** Clock in now — Field Scout's write, the switch included — refusing if the picture changed since the draft. */
export async function applyShiftOpen(r: Rest, companyId: number, prop: any): Promise<{ ok: true; before: any; after: any } | { ok: false; error: string; stale?: boolean }> {
  const p = prop.payload || {}
  const open = await readRecordList(r, `time_clock?select=id,job_id,clock_in,lunch_start,lunch_end,notes&company_id=eq.${companyId}&employee_id=eq.${p.employee_id}&clock_out=is.null&order=clock_in.desc&limit=2`)
  const cur = open[0] || null
  const expectedSwitch = !!p.switch_from
  if (expectedSwitch ? (!cur || String(cur.id) !== String(p.switch_from.id)) : !!cur) {
    return { ok: false, stale: true, error: cur ? `You are already clocked in (since ${cur.clock_in}). Nothing to do.` : 'The shift I was going to switch you from has been closed since. Ask me again and I will draft a plain clock-in.' }
  }
  const now = new Date()
  const hdr = { apikey: r.key, Authorization: `Bearer ${r.key}`, 'Content-Type': 'application/json' }
  let switchedOut: any = null
  if (cur) {
    const stamp = `[SWITCHED JOBS at ${now.toISOString()} — continued on job ${p.job_id ?? 'General'}]`
    const res = await patchRow(r, 'time_clock', companyId, cur.id, { clock_out: now.toISOString(), total_hours: hoursBetween(cur, now), notes: cur.notes ? `${cur.notes}\n${stamp}` : stamp })
    if (!res.ok) return { ok: false, error: res.error }
    switchedOut = { id: cur.id, notes: cur.notes ?? null }
  }
  const ins = await fetch(`${r.url}/rest/v1/time_clock`, {
    method: 'POST', headers: { ...hdr, Prefer: 'return=representation' },
    body: JSON.stringify({
      company_id: companyId, employee_id: p.employee_id, job_id: p.job_id ?? null,
      clock_in: new Date(now.getTime() + (cur ? 1000 : 0)).toISOString(),
      ...(cur ? { notes: `[Switched from job ${cur.job_id || 'General'}]` } : {}),
    }),
  })
  if (!ins.ok) {
    const t = await ins.text()
    if (cur) await patchRow(r, 'time_clock', companyId, cur.id, { clock_out: null, total_hours: null, notes: cur.notes ?? null })
    return { ok: false, error: /duplicate key|one_open_per_employee/i.test(t) ? 'A shift opened for you while I was drafting this — you are clocked in already.' : `Could not clock you in: ${ins.status} ${t}` }
  }
  const row = (await ins.json())?.[0]
  let jobBumped = false
  if (p.job_id && ['Chillin', 'Scheduled'].includes(p.job_status_before)) {
    const [j] = await readRecordList(r, `jobs?select=status&company_id=eq.${companyId}&id=eq.${p.job_id}&limit=1`)
    if (j && ['Chillin', 'Scheduled'].includes(j.status)) {
      const res = await patchRow(r, 'jobs', companyId, p.job_id, { status: 'In Progress', updated_at: now.toISOString() })
      jobBumped = res.ok
    }
  }
  // Rollback needs the row this opened and whether it bumped the job. The
  // lifecycle keeps before/after values, not ids, so they go on the payload.
  await fetch(`${r.url}/rest/v1/arnie_proposals?id=eq.${prop.id}&company_id=eq.${companyId}`, {
    method: 'PATCH', headers: { ...hdr, Prefer: 'return=minimal' },
    body: JSON.stringify({ payload: { ...p, opened_id: row?.id ?? null, switched_out: switchedOut, job_bumped: jobBumped } }),
  })
  return { ok: true, before: null, after: row?.clock_in ?? now.toISOString() }
}

/** Undo the punch: delete the row it opened (if still open), reopen the one it closed, put the job status back. */
export async function rollbackShiftOpen(r: Rest, companyId: number, prop: any): Promise<{ ok: true; restored: any } | { ok: false; error: string }> {
  const [fresh] = await readRecordList(r, `arnie_proposals?select=payload&company_id=eq.${companyId}&id=eq.${prop.id}&limit=1`)
  const p = fresh?.payload || prop.payload || {}
  if (!p.opened_id) return { ok: false, error: 'I have no record of the shift this opened.' }
  const [row] = await readRecordList(r, `time_clock?select=id,clock_out,lunch_start&company_id=eq.${companyId}&id=eq.${p.opened_id}&limit=1`)
  if (row) {
    if (row.clock_out || row.lunch_start) return { ok: false, error: 'That shift has been worked since — it has a clock-out or a lunch on it. Fix it on the Payroll page rather than deleting it.' }
    const del = await fetch(`${r.url}/rest/v1/time_clock?id=eq.${row.id}&company_id=eq.${companyId}`, { method: 'DELETE', headers: { apikey: r.key, Authorization: `Bearer ${r.key}`, Prefer: 'return=minimal' } })
    if (!del.ok) return { ok: false, error: `Could not remove the punch: ${del.status} ${await del.text()}` }
  }
  if (p.switched_out?.id) {
    const res = await patchRow(r, 'time_clock', companyId, p.switched_out.id, { clock_out: null, total_hours: null, notes: p.switched_out.notes ?? null })
    if (!res.ok) return { ok: false, error: `Removed the punch, but could not reopen the shift it switched from: ${res.error}` }
  }
  if (p.job_bumped && p.job_id) {
    const [j] = await readRecordList(r, `jobs?select=status&company_id=eq.${companyId}&id=eq.${p.job_id}&limit=1`)
    if (j?.status === 'In Progress') await patchRow(r, 'jobs', companyId, p.job_id, { status: p.job_status_before })
  }
  return { ok: true, restored: null }
}
