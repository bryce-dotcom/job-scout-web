// "If there is an existing one put it on the calendar for me; if there is not,
// create a lead and put it in Lead Setter tied to me and then put it in my
// calendar" (Christopher, 2026-10-13) — from a lead's email.
//
// The appointment card books a LEAD that already exists. This books the two
// cases it cannot: an existing CUSTOMER (no lead), and a NEW lead made in the
// same approval. An existing lead still goes through the appointment card, so
// that case behaves exactly as the Lead Setter page does.
//
// No setter fee: nobody set this appointment — a customer emailed. The rep is
// the person drafting it unless another is named, and the default time is
// their next free hour tomorrow ("next opening").

import type { Rest } from './arnieConfig.ts'
import type { Caller } from './auth.ts'
import { readRecordList, patchRow } from './arnieRest.ts'
import { localToUtc, resolveWhenSaid } from './arnieTime.ts'
import { nextOpening } from './arnieInbox.ts'
import { isNextOpening } from './arnieAppointment.ts'
import type { Prepared } from './arnieCreate.ts'

const H = (r: Rest) => ({ apikey: r.key, Authorization: `Bearer ${r.key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' })
const ins = async (r: Rest, table: string, row: Record<string, unknown>) => {
  const res = await fetch(`${r.url}/rest/v1/${table}`, { method: 'POST', headers: H(r), body: JSON.stringify(row) })
  if (!res.ok) throw new Error(`${table}: ${res.status} ${await res.text()}`)
  return (await res.json())?.[0]
}
const del = (r: Rest, table: string, companyId: number, id: unknown) =>
  fetch(`${r.url}/rest/v1/${table}?id=eq.${id}&company_id=eq.${companyId}`, { method: 'DELETE', headers: { ...H(r), Prefer: 'return=minimal' } })
const clean = (s: unknown) => String(s ?? '').replace(/[*,()]/g, ' ').trim()
const fmt = (d: Date, tz: string) => {
  try { return d.toLocaleString('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) } catch { return d.toISOString() }
}

export async function prepareBooking(r: Rest, caller: Caller, f: Record<string, string>): Promise<Prepared> {
  const companyId = caller.companyId as number
  const tz = f.timezone && /^[A-Za-z_]+\/[A-Za-z_\/+-]+$/.test(f.timezone) ? f.timezone : 'America/Denver'
  const minutes = Math.min(Math.max(parseInt(f.duration_minutes || '60', 10) || 60, 15), 480)

  // Who it is for: an existing customer, or a new lead.
  let customer: any = null
  if (f.customer) {
    const t = clean(f.customer)
    const rows = await readRecordList(r, `customers?select=id,name,business_name,address,email,phone&company_id=eq.${companyId}&or=(name.ilike.*${t}*,business_name.ilike.*${t}*)&limit=6`)
    if (!rows.length) return { ok: false, error: `No customer matching "${f.customer}". If they are new, leave customer out and give their name, email and phone — it makes the lead too.` }
    if (rows.length > 1) return { needs_choice: rows.map((c: any) => ({ id: c.id, label: [c.business_name, c.name].filter(Boolean).join(' — ') + (c.address ? ` (${c.address})` : '') })), message: 'More than one customer matches. Ask which, then call again with the name as listed.' }
    customer = rows[0]
  } else {
    if (!f.customer_name) return { ok: false, error: 'Who is it? Name the existing customer (customer), or give the new lead\'s name (customer_name).' }
    // A "new" lead that is already here is a duplicate, and duplicates split
    // the quotes and the setter fees. Matched on email or phone.
    const ors = [
      f.email ? `email.ilike.${clean(f.email)}` : '',
      f.phone && f.phone.replace(/\D/g, '').length >= 7 ? `phone.ilike.*${f.phone.replace(/\D/g, '').slice(-7)}*` : '',
    ].filter(Boolean)
    if (ors.length) {
      const [lead] = await readRecordList(r, `leads?select=id,customer_name,business_name&company_id=eq.${companyId}&or=(${ors.join(',')})&limit=1`)
      if (lead) return { ok: false, error: `That is already a lead: ${lead.business_name || lead.customer_name} (#${lead.id}). Book it with the appointment card instead of making a second lead.` }
      const [cust] = await readRecordList(r, `customers?select=id,name,business_name&company_id=eq.${companyId}&or=(${ors.join(',')})&limit=1`)
      if (cust) return { ok: false, error: `That is already a customer: ${cust.business_name || cust.name}. Call again with customer set to them instead of making a lead.` }
    }
    // The same person already on a card nobody has decided: the 7am check
    // drafted it and the noon check must not draft it again.
    const waiting = await readRecordList(r, `arnie_proposals?select=id,payload&company_id=eq.${companyId}&target=eq.booking&status=eq.pending&limit=50`)
    const same = waiting.find((p: any) => {
      const n = p?.payload?.columns?.new_lead || {}
      const digits = (s: unknown) => String(s ?? '').replace(/\D/g, '').slice(-7)
      return (f.email && String(n.email || '').toLowerCase() === String(f.email).toLowerCase())
        || (f.phone && digits(f.phone).length === 7 && digits(n.phone) === digits(f.phone))
    })
    if (same) return { ok: false, error: `A booking card for ${f.business_name || f.customer_name} is already waiting for approval (#${same.id}). Leave it — mark this email done.` }
  }

  // Who takes it: named, or the person drafting it ("under my name").
  let repId: number | null = caller.employeeId ?? null, repName = 'you'
  if (f.salesperson) {
    const t = clean(f.salesperson)
    const reps = await readRecordList(r, `employees?select=id,name&company_id=eq.${companyId}&active=eq.true&name=ilike.*${t}*&limit=6`)
    if (!reps.length) return { ok: false, error: `No active employee matching "${f.salesperson}".` }
    if (reps.length > 1) return { needs_choice: reps.map((e: any) => ({ id: e.id, label: e.name })), message: 'More than one person matches. Ask which, then call again with the full name.' }
    repId = reps[0].id; repName = reps[0].name
  } else if (repId != null) {
    const [me] = await readRecordList(r, `employees?select=name&id=eq.${repId}&limit=1`)
    repName = me?.name || 'you'
  }
  if (repId == null) return { ok: false, error: 'Who is taking the appointment?' }

  // When: as said, or their next free hour tomorrow.
  let start: Date | null = null, end: Date | null = null, defaulted = false
  if (!f.when || isNextOpening(f.when)) {
    const slot = await nextOpening(r, companyId, repId, tz, { minutes })
    if (!slot) return { ok: false, error: `${repName} has no free hour between 8 and 5 in the next week. Give me a time.` }
    start = slot.start; end = slot.end; defaulted = true
  } else {
    const said = resolveWhenSaid(f.when, tz, 'forward')
    if (!said?.time) return { ok: false, error: `When? "Thursday at 2", "tomorrow 9:30am", or "next opening" — I got "${f.when}".` }
    start = localToUtc(`${said.date} ${said.time}`, tz)
    if (!start) return { ok: false, error: `Give me the time as YYYY-MM-DD HH:MM — I got "${f.when}".` }
    if (start.getTime() < Date.now() - 3600000) return { ok: false, error: `${fmt(start, tz)} is in the past.` }
    end = new Date(start.getTime() + minutes * 60000)
  }

  const clash = await readRecordList(r, `appointments?select=title,start_time&company_id=eq.${companyId}&status=neq.Cancelled&or=(salesperson_id.eq.${repId},salesperson_ids.cs.{${repId}})&start_time=lt.${end!.toISOString()}&end_time=gt.${start!.toISOString()}&limit=1`)
  const who = customer ? (customer.business_name || customer.name) : (f.business_name || f.customer_name)
  const location = f.location || f.address || customer?.address || null
  const title = `${who} - ${f.service_type || 'Consultation'}`
  const display = [
    { label: customer ? 'Customer' : 'New lead', value: customer ? who : `${who}${f.business_name && f.customer_name ? ` (${f.customer_name})` : ''}${f.email ? ' · ' + f.email : ''}${f.phone ? ' · ' + f.phone : ''}` },
    ...(customer ? [] : [{ label: 'Lead Setter', value: `Goes in ${repName}'s list` }]),
    { label: 'When', value: `${fmt(start!, tz)} · ${minutes} min${defaulted ? ' (next opening)' : ''}` },
    { label: 'With', value: repName },
    { label: 'Where', value: location || '(no address)' },
    ...(clash.length ? [{ label: 'Clash', value: `${repName} already has "${clash[0].title}" at ${fmt(new Date(clash[0].start_time), tz)}` }] : []),
  ]
  return {
    ok: true,
    columns: {
      customer_id: customer?.id ?? null,
      new_lead: customer ? null : {
        customer_name: f.customer_name, business_name: f.business_name || null, phone: f.phone || null, email: f.email || null,
        address: f.address || null, service_type: f.service_type || null, lead_source: f.lead_source || 'Email', notes: f.notes || null,
      },
      title, start_time: start!.toISOString(), end_time: end!.toISOString(), duration_minutes: minutes,
      location, salesperson_id: repId, notes: f.notes || null, tz,
    },
    display,
  }
}

export async function applyBooking(r: Rest, companyId: number, prop: any): Promise<{ ok: true; id: number; label: string; created: Record<string, unknown> } | { ok: false; error: string; stale?: boolean }> {
  const c = prop.payload?.columns || {}
  if (!c.start_time || !c.salesperson_id || (!c.customer_id && !c.new_lead)) return { ok: false, error: 'That draft is missing who or when.' }
  const created: Record<string, unknown> = {}
  let leadId: number | null = null
  if (c.new_lead) {
    const lead = await ins(r, 'leads', {
      company_id: companyId, ...c.new_lead, status: 'Appointment Set', appointment_time: c.start_time,
      salesperson_id: c.salesperson_id, salesperson_ids: [c.salesperson_id], lead_owner_id: c.salesperson_id,
    })
    leadId = lead.id
    created.lead_id = lead.id
  }
  const apt = await ins(r, 'appointments', {
    company_id: companyId, lead_id: leadId, customer_id: c.customer_id ?? null, title: c.title,
    start_time: c.start_time, end_time: c.end_time, duration_minutes: c.duration_minutes, location: c.location,
    salesperson_id: c.salesperson_id, salesperson_ids: [c.salesperson_id], setter_id: null,
    lead_owner_id: leadId ? c.salesperson_id : null, status: 'Scheduled', notes: c.notes,
  })
  created.appointment_id = apt.id
  if (leadId) await patchRow(r, 'leads', companyId, leadId, { appointment_id: apt.id })
  return { ok: true, id: apt.id, label: prop.payload?.entity_label || 'appointment', created }
}

export async function rollbackBooking(r: Rest, companyId: number, prop: any): Promise<{ ok: true; deleted: number } | { ok: false; error: string }> {
  const made = prop.payload?.created || {}
  const aptId = Number(made.appointment_id)
  if (!aptId) return { ok: false, error: 'This draft never booked anything.' }
  if (made.lead_id) {
    // The lead it made goes too — unless work has started on it since.
    const quotes = await readRecordList(r, `quotes?select=id&company_id=eq.${companyId}&lead_id=eq.${made.lead_id}&limit=1`)
    if (quotes.length) return { ok: false, error: 'That lead has an estimate on it now — cancel the appointment from Lead Setter instead.' }
  }
  await del(r, 'appointments', companyId, aptId)
  if (made.lead_id) await del(r, 'leads', companyId, made.lead_id)
  return { ok: true, deleted: aptId }
}
