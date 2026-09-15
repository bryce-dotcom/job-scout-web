// Booking an appointment through Arnie — the setter's second sentence after
// "new lead": "book them Tuesday at two with Jordan."
//
// This is the create rail's first target with SIDE EFFECTS, and every one of
// them is copied from what the Lead Setter page does when a person books
// (src/pages/LeadSetter.jsx, handleCreateAppointment). It has to be all
// five, or Arnie becomes a new way to orphan a setter's fee:
//
//   1. the appointment row
//   2. the lead: status Appointment Set, the time, the appointment id, the
//      rep as salesperson, and ownership handed to the rep so the lead is
//      in their list and they do not create a duplicate
//   3. the setter's fee in lead_commissions (pending — it earns under the
//      company's rule)
//   4. the lead-source fee, if the lead has a source employee
//   5. the legacy setter_commissions row, while anything still reads it
//
// Rollback undoes all five, and refuses once a fee has moved past pending.

import type { Rest } from './arnieConfig.ts'
import type { Caller } from './auth.ts'
import { readRecordList, patchRow } from './arnieRest.ts'
import { RECORD_TARGETS, resolveEntity } from './arnieRecords.ts'
import { localToUtc } from './arnieTime.ts'
import type { Prepared } from './arnieCreate.ts'

const H = (r: Rest) => ({ apikey: r.key, Authorization: `Bearer ${r.key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' })
const ins = async (r: Rest, table: string, row: Record<string, unknown>) => {
  const res = await fetch(`${r.url}/rest/v1/${table}`, { method: 'POST', headers: H(r), body: JSON.stringify(row) })
  if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`)
  return (await res.json())?.[0]
}
const del = async (r: Rest, table: string, companyId: number, id: unknown) =>
  fetch(`${r.url}/rest/v1/${table}?id=eq.${id}&company_id=eq.${companyId}`, { method: 'DELETE', headers: { ...H(r), Prefer: 'return=minimal' } })

const LEAD_COLS = 'id,lead_id,customer_name,business_name,service_type,address,status,appointment_id,appointment_time,salesperson_id,salesperson_ids,lead_owner_id,setter_owner_id,lead_source_employee_id,customer_id'
const leadName = (l: any) => l.business_name || l.customer_name || `lead #${l.id}`

const fmt = (d: Date, tz: string) => {
  try { return d.toLocaleString('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) } catch { return d.toISOString() }
}

export async function prepareAppointment(r: Rest, caller: Caller, f: Record<string, string>): Promise<Prepared> {
  const companyId = caller.companyId as number
  const tz = f.timezone && /^[A-Za-z_]+\/[A-Za-z_\/+-]+$/.test(f.timezone) ? f.timezone : 'America/Denver'

  // The lead, by description. Ambiguity is a question, never a pick.
  const found = await resolveEntity(r, companyId, RECORD_TARGETS.lead_note, f.lead)
  if ('error' in found) return { ok: false, error: found.error }
  if ('candidates' in found) return { needs_choice: found.candidates, message: 'More than one lead matches. Ask which one, then call again naming it as listed.' }
  const [lead] = await readRecordList(r, `leads?select=${LEAD_COLS}&company_id=eq.${companyId}&id=eq.${found.row.id}&limit=1`)
  if (!lead) return { ok: false, error: 'That lead is no longer there.' }
  // Booked means a real appointment on the calendar — not a status. The demo
  // tenant has leads that say "Appointment Set" with no appointment behind
  // them, and real tenants get there too when a status is set by hand.
  // Refusing those would leave nothing to reschedule; booking repairs them.
  const existing = await readRecordList(r, `appointments?select=id,start_time,status&company_id=eq.${companyId}&lead_id=eq.${lead.id}&status=neq.Cancelled&end_time=gt.${new Date().toISOString()}&order=start_time&limit=1`)
  if (lead.appointment_id || existing.length) {
    const at = existing[0]?.start_time || lead.appointment_time
    return { ok: false, error: `${leadName(lead)} already has an appointment${at ? ' on ' + fmt(new Date(at), tz) : ''}. Reschedule it from the Lead Setter page rather than booking a second one.` }
  }
  const statusOnly = String(lead.status || '').toLowerCase() === 'appointment set'

  // When.
  const start = localToUtc(f.when, tz)
  if (!start) return { ok: false, error: `Give me the time as YYYY-MM-DD HH:MM (in ${tz}) — I got "${f.when}".` }
  if (start.getTime() < Date.now() - 3600000) return { ok: false, error: `${fmt(start, tz)} is in the past.` }
  const minutes = Math.min(Math.max(parseInt(f.duration_minutes || '60', 10) || 60, 15), 480)
  const end = new Date(start.getTime() + minutes * 60000)

  // Who is taking it. Named → looked up; not named → the lead's rep; neither → ask.
  let repId: number | null = null, repName = ''
  if (f.salesperson) {
    const t = String(f.salesperson).replace(/[*,()]/g, '').trim()
    const reps = await readRecordList(r, `employees?select=id,name&company_id=eq.${companyId}&active=eq.true&name=ilike.*${t}*&limit=6`)
    if (!reps.length) return { ok: false, error: `No active employee matching "${f.salesperson}".` }
    if (reps.length > 1) return { needs_choice: reps.map((e: any) => ({ id: e.id, label: e.name })), message: 'More than one person matches that name. Ask which, then call again with the full name.' }
    repId = reps[0].id; repName = reps[0].name
  } else if (lead.salesperson_id) {
    const [e] = await readRecordList(r, `employees?select=id,name&company_id=eq.${companyId}&id=eq.${lead.salesperson_id}&limit=1`)
    if (e) { repId = e.id; repName = e.name + ' (already on the lead)' }
  }
  if (!repId) return { ok: false, error: 'Who is taking the appointment? Give me the rep\'s name.' }

  // A clash is worth saying, not worth blocking — a person can decide.
  const clash = await readRecordList(r, `appointments?select=id,title,start_time&company_id=eq.${companyId}&salesperson_id=eq.${repId}&start_time=lt.${end.toISOString()}&end_time=gt.${start.toISOString()}&status=neq.Cancelled&limit=1`)

  const location = f.location || lead.address || null
  const title = `${lead.customer_name || lead.business_name} - ${lead.service_type || 'Consultation'}`
  const display = [
    { label: 'Lead', value: leadName(lead) + (lead.customer_name && lead.business_name && lead.customer_name !== lead.business_name ? ` (${lead.customer_name})` : '') },
    { label: 'When', value: `${fmt(start, tz)} · ${minutes} min` },
    { label: 'With', value: repName },
    { label: 'Where', value: location || '(no address on the lead)' },
    ...(clash.length ? [{ label: 'Clash', value: `${repName.replace(/ \(.*\)$/, '')} already has "${clash[0].title}" at ${fmt(new Date(clash[0].start_time), tz)}` }] : []),
    ...(statusOnly ? [{ label: 'Note', value: 'The lead is marked Appointment Set but nothing is on the calendar — this books it.' }] : []),
  ]
  return {
    ok: true,
    columns: {
      lead_id: lead.id, customer_id: lead.customer_id ?? null,
      title, start_time: start.toISOString(), end_time: end.toISOString(), duration_minutes: minutes,
      location, salesperson_id: repId, salesperson_ids: [repId], lead_owner_id: lead.lead_owner_id ?? null,
      status: 'Scheduled', notes: f.notes || null,
      // what the lead looked like, so rollback can put it back
      lead_before: { status: lead.status, appointment_time: lead.appointment_time, appointment_id: lead.appointment_id,
        salesperson_id: lead.salesperson_id, salesperson_ids: lead.salesperson_ids, lead_owner_id: lead.lead_owner_id },
      lead_source_employee_id: lead.lead_source_employee_id ?? null,
      tz,
    },
    display,
  }
}

/** Book it: the five writes the Lead Setter page makes. */
export async function applyAppointment(r: Rest, companyId: number, prop: any): Promise<{ ok: true; id: number; label: string; created: Record<string, unknown> } | { ok: false; error: string; stale?: boolean }> {
  const c = prop.payload?.columns || {}
  const setterId = prop.payload?.proposer_employee_id ?? null
  if (!c.lead_id || !c.start_time) return { ok: false, error: 'That draft is missing its lead or time.' }

  // Consent was to book THIS lead, which had no appointment. If one has
  // appeared since — someone booked it from the page — refuse.
  const [lead] = await readRecordList(r, `leads?select=id,appointment_id&company_id=eq.${companyId}&id=eq.${c.lead_id}&limit=1`)
  if (!lead) return { ok: false, error: 'That lead is no longer there.' }
  const since = await readRecordList(r, `appointments?select=id&company_id=eq.${companyId}&lead_id=eq.${c.lead_id}&status=neq.Cancelled&end_time=gt.${new Date().toISOString()}&limit=1`)
  if (lead.appointment_id || since.length) return { ok: false, stale: true, error: 'That lead got an appointment since I drafted this. Check the Lead Setter page before booking another.' }

  // 1. appointment
  const apt = await ins(r, 'appointments', {
    company_id: companyId, lead_id: c.lead_id, title: c.title, start_time: c.start_time, end_time: c.end_time,
    duration_minutes: c.duration_minutes, location: c.location, salesperson_id: c.salesperson_id, salesperson_ids: c.salesperson_ids,
    setter_id: setterId, lead_owner_id: c.lead_owner_id, status: 'Scheduled', notes: c.notes,
  })
  const created: Record<string, unknown> = { appointment_id: apt.id, commission_ids: [] as number[], setter_commission_id: null as number | null }

  // 2. the lead — rep takes ownership so it shows in their list
  await patchRow(r, 'leads', companyId, c.lead_id, {
    status: 'Appointment Set', appointment_time: c.start_time, appointment_id: apt.id,
    salesperson_id: c.salesperson_id, salesperson_ids: c.salesperson_ids, lead_owner_id: c.salesperson_id,
  })

  // 3–5. the fees. Same rates, same fallbacks, same tables as the page.
  const [co] = await readRecordList(r, `companies?select=setter_pay_per_appointment,source_pay_per_lead&id=eq.${companyId}&limit=1`)
  if (setterId) {
    const [setter] = await readRecordList(r, `employees?select=commission_setter_rate,commission_setter_type&company_id=eq.${companyId}&id=eq.${setterId}&limit=1`)
    const rate = Number(setter?.commission_setter_rate) || Number(co?.setter_pay_per_appointment) || 25
    if (rate > 0) {
      const row = await ins(r, 'lead_commissions', { company_id: companyId, lead_id: c.lead_id, appointment_id: apt.id, commission_type: 'appointment_set', employee_id: setterId, amount: rate, rate_type: setter?.commission_setter_type || 'flat', payment_status: 'pending' })
      ;(created.commission_ids as number[]).push(row.id)
    }
    if (Number(co?.setter_pay_per_appointment) > 0) {
      try {
        const legacy = await ins(r, 'setter_commissions', { company_id: companyId, lead_id: c.lead_id, appointment_id: apt.id, setter_id: setterId, setter_amount: Number(co.setter_pay_per_appointment), payment_status: 'pending' })
        created.setter_commission_id = legacy?.id ?? null
      } catch { /* legacy table — the page tolerates its absence too */ }
    }
  }
  if (c.lead_source_employee_id) {
    const [src] = await readRecordList(r, `employees?select=commission_leads_rate,commission_leads_type&company_id=eq.${companyId}&id=eq.${c.lead_source_employee_id}&limit=1`)
    const rate = Number(src?.commission_leads_rate) || Number(co?.source_pay_per_lead) || 0
    if (rate > 0) {
      const row = await ins(r, 'lead_commissions', { company_id: companyId, lead_id: c.lead_id, appointment_id: apt.id, commission_type: 'lead_source', employee_id: c.lead_source_employee_id, amount: rate, rate_type: src?.commission_leads_type || 'flat', payment_status: 'pending' })
      ;(created.commission_ids as number[]).push(row.id)
    }
  }

  return { ok: true, id: apt.id, label: prop.payload?.entity_label || 'appointment', created }
}

/** Unbook: all five, in reverse — unless a fee has already moved. */
export async function rollbackAppointment(r: Rest, companyId: number, prop: any): Promise<{ ok: true; deleted: number } | { ok: false; error: string }> {
  const c = prop.payload?.columns || {}
  const made = prop.payload?.created || {}
  const aptId = Number(made.appointment_id)
  if (!aptId) return { ok: false, error: 'This draft never booked anything.' }

  const ids: number[] = (made.commission_ids || []).map(Number).filter(Boolean)
  if (ids.length) {
    const rows = await readRecordList(r, `lead_commissions?select=id,payment_status&company_id=eq.${companyId}&id=in.(${ids.join(',')})`)
    const moved = rows.filter((x: any) => x.payment_status !== 'pending')
    if (moved.length) return { ok: false, error: `Can't unbook — a fee on this appointment is already ${moved[0].payment_status}. Cancel it from the Lead Setter page.` }
    for (const id of ids) await del(r, 'lead_commissions', companyId, id)
  }
  if (made.setter_commission_id) await del(r, 'setter_commissions', companyId, made.setter_commission_id)
  if (c.lead_id && c.lead_before) await patchRow(r, 'leads', companyId, c.lead_id, c.lead_before)
  await del(r, 'appointments', companyId, aptId)
  return { ok: true, deleted: aptId }
}
