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
