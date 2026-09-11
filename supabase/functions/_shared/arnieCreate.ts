// The create rail: Arnie drafts a NEW record, a person approves it, and the
// row exists only after that click. Same propose → approve → apply → rollback
// shape as config, record and bulk, so the trust model is the one people
// already know.
//
// Leads first. A lead is the cheapest thing in the system to create and to
// delete, it is the top of the funnel, and it is the thing a setter wants to
// say out loud on the phone: "new lead, Halifax Flooring, Ben, solar retrofit,
// came from Angi". Everything the model supplies is checked here — the
// model never writes a column name, only field values the registry knows.
//
// The duplicate check is not optional and not the model's job. Before a lead
// is even drafted, similar_leads() (the same rule the insert trigger and the
// forms use) is asked. If something matches, the draft stops and the person
// is asked "use that one, or is this really new?" — exactly what would have
// saved Tracy's Halifax fee.

import type { Rest } from './arnieConfig.ts'
import type { Caller } from './auth.ts'
import { readRecordList } from './arnieRest.ts'

interface CreateField {
  /** Column on the table. The model never sees this; it sees `key`. */
  column: string
  label: string
  required?: boolean
  /** Longest value accepted; longer is refused rather than silently cut. */
  max?: number
  /** Reject anything that does not look like this kind of value. */
  shape?: 'email' | 'phone'
}

export interface CreateTarget {
  label: string
  table: string
  /** Access-ladder level needed to draft and to approve. */
  minLevel: number
  fields: Record<string, CreateField>
  /** What the card and the audit call the new row. */
  labelOf: (fields: Record<string, string>) => string
}

export const CREATE_TARGETS: Record<string, CreateTarget> = {
  lead: {
    label: 'lead',
    table: 'leads',
    // Anyone can create a lead: LeadSetter is ungated and setters are level 0.
    minLevel: 0,
    fields: {
      customer_name:  { column: 'customer_name',  label: 'Contact',        required: true, max: 120 },
      business_name:  { column: 'business_name',  label: 'Business',       max: 120 },
      phone:          { column: 'phone',          label: 'Phone',          max: 40, shape: 'phone' },
      email:          { column: 'email',          label: 'Email',          max: 120, shape: 'email' },
      address:        { column: 'address',        label: 'Address',        max: 300 },
      service_type:   { column: 'service_type',   label: 'Service',        max: 80 },
      lead_source:    { column: 'lead_source',    label: 'Source',         max: 80 },
      notes:          { column: 'notes',          label: 'Notes',          max: 2000 },
    },
    labelOf: (f) => f.business_name && f.customer_name
      ? `${f.business_name} (${f.customer_name})`
      : (f.business_name || f.customer_name || 'new lead'),
  },
}

export const isCreateTarget = (t: string): boolean => Object.hasOwn(CREATE_TARGETS, t)

export function createTargetsSentence(): string {
  return Object.entries(CREATE_TARGETS)
    .map(([k, t]) => `${k} (fields: ${Object.keys(t.fields).join(', ')})`)
    .join('; ')
}

export interface CreatePreview {
  kind: 'create'
  label: string
  entity: string
  fields: { label: string; value: string }[]
  /** Set when the draft went ahead despite a near-match the user waved off. */
  despite?: string
}

export type CreateProposeResult =
  | { proposal: any; preview: CreatePreview }
  | { needs_choice: { id: number; label: string; matched_on: string; status: string }[]; message: string }
  | { error: string }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_DIGITS = /\d{7,}/

/** Clean and validate what the model supplied against the registry. */
function cleanFields(target: CreateTarget, raw: unknown): { ok: true; fields: Record<string, string> } | { ok: false; error: string } {
  const src = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {}
  const fields: Record<string, string> = {}
  const unknown = Object.keys(src).filter((k) => !Object.hasOwn(target.fields, k))
  if (unknown.length) return { ok: false, error: `A ${target.label} has no field called ${unknown.join(', ')}. Use: ${Object.keys(target.fields).join(', ')}.` }

  for (const [key, def] of Object.entries(target.fields)) {
    const v = src[key]
    const s = v == null ? '' : String(v).trim()
    if (!s) {
      if (def.required) return { ok: false, error: `I need the ${def.label.toLowerCase()} to create a ${target.label}.` }
      continue
    }
    if (def.max && s.length > def.max) return { ok: false, error: `${def.label} is too long (${s.length} characters, limit ${def.max}).` }
    if (def.shape === 'email' && !EMAIL.test(s)) return { ok: false, error: `"${s}" doesn't look like an email address.` }
    if (def.shape === 'phone' && !PHONE_DIGITS.test(s.replace(/\D/g, ''))) return { ok: false, error: `"${s}" doesn't look like a phone number.` }
    fields[key] = s
  }
  return { ok: true, fields }
}

async function similarLeads(r: Rest, companyId: number, f: Record<string, string>, excludeId: number | null = null) {
  const res = await fetch(`${r.url}/rest/v1/rpc/similar_leads`, {
    method: 'POST',
    headers: { apikey: r.key, Authorization: `Bearer ${r.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_company_id: companyId,
      p_customer_name: f.customer_name ?? null,
      p_business_name: f.business_name ?? null,
      p_phone: f.phone ?? null,
      p_email: f.email ?? null,
      p_exclude_id: excludeId,
      p_limit: 5,
    }),
  })
  if (!res.ok) return []
  const rows = await res.json().catch(() => [])
  return Array.isArray(rows) ? rows : []
}

const leadLabel = (l: any) => l.business_name && l.customer_name
  ? `${l.business_name} (${l.customer_name})`
  : (l.business_name || l.customer_name || `lead #${l.id}`)

export async function proposeCreate(
  r: Rest,
  caller: Caller,
  input: { target: string; fields?: unknown; confirm_new?: boolean; request_text?: string },
): Promise<CreateProposeResult> {
  const companyId = caller.companyId
  if (companyId == null) return { error: 'No company on this login.' }
  const target = CREATE_TARGETS[input.target]
  if (!target) return { error: `"${input.target}" isn't something Arnie can create. It can create: ${createTargetsSentence()}.` }
  if (caller.level < target.minLevel) return { error: `Creating a ${target.label} is above your access level. Ask a manager.` }

  const cleaned = cleanFields(target, input.fields)
  if (!cleaned.ok) return { error: cleaned.error }
  const fields = cleaned.fields

  // The duplicate check. Not skippable by the model; only the person can
  // wave it off, and the card then says that they did.
  let despite: string | undefined
  if (target.table === 'leads') {
    const similar = await similarLeads(r, companyId, fields)
    if (similar.length && !input.confirm_new) {
      return {
        needs_choice: similar.map((l: any) => ({
          id: l.id, label: leadLabel(l), matched_on: l.matched_on || 'similar', status: l.status || 'New',
        })),
        message: 'A lead like this already exists. Tell the user which one(s) matched and how, and ask whether to use the existing lead instead. Only call again with confirm_new=true if the USER says it is a different customer.',
      }
    }
    if (similar.length && input.confirm_new) {
      despite = `Created even though it looks like ${leadLabel(similar[0])} — the user said it's a different customer.`
    }
  }

  const entity = target.labelOf(fields)
  const summary = `Create ${target.label}: ${entity}` + (fields.service_type ? ` — ${fields.service_type}` : '') + (fields.lead_source ? ` (from ${fields.lead_source})` : '')

  const insert = await fetch(`${r.url}/rest/v1/arnie_proposals`, {
    method: 'POST',
    headers: { apikey: r.key, Authorization: `Bearer ${r.key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({
      company_id: companyId,
      created_by: caller.email,
      request_text: input.request_text || summary,
      target: input.target,
      action: 'create',
      payload: {
        entity_table: target.table, entity_label: entity, fields,
        // The person who asked Arnie is the setter/source of the lead unless
        // the fields say otherwise. Recorded now so apply does not have to
        // guess who was talking.
        proposer_employee_id: caller.employeeId,
        despite: despite ?? null,
      },
      summary,
      before_value: null,
      after_value: fields,
      status: 'pending',
    }),
  })
  if (!insert.ok) return { error: `Couldn't save that draft: ${await insert.text()}` }

  return {
    proposal: (await insert.json())?.[0],
    preview: {
      kind: 'create',
      label: target.label,
      entity,
      fields: Object.entries(target.fields)
        .filter(([k]) => fields[k])
        .map(([k, def]) => ({ label: def.label, value: fields[k] })),
      ...(despite ? { despite } : {}),
    },
  }
}

/**
 * Apply an approved create. Consent was to create a specific NEW record: if a
 * matching lead has appeared since the draft (someone else added it, or a
 * previous approve of this same draft already ran), refuse rather than make
 * a second one — which would be this rail causing the exact problem it was
 * built to prevent.
 */
export async function applyCreateProposal(
  r: Rest, companyId: number, prop: any,
): Promise<{ ok: true; id: number; label: string } | { ok: false; error: string; stale?: boolean }> {
  const target = CREATE_TARGETS[prop.target]
  if (!target) return { ok: false, error: 'Unknown create target.' }
  const fields: Record<string, string> = prop.payload?.fields || {}
  if (prop.payload?.created_id) return { ok: false, error: 'This draft was already applied.' }

  if (target.table === 'leads' && !prop.payload?.despite) {
    const similar = await similarLeads(r, companyId, fields)
    if (similar.length) {
      return { ok: false, stale: true, error: `${leadLabel(similar[0])} now exists (${similar[0].matched_on}) — it wasn't there when I drafted this. Use that lead, or ask me again if it really is a different customer.` }
    }
  }

  const row: Record<string, unknown> = { company_id: companyId }
  for (const [key, def] of Object.entries(target.fields)) if (fields[key]) row[def.column] = fields[key]
  if (target.table === 'leads') {
    row.status = 'New'
    row.lead_id = `LEAD-${Date.now().toString(36).toUpperCase()}`
    const who = prop.payload?.proposer_employee_id
    if (who) { row.setter_owner_id = who; row.lead_source_employee_id = who }
  }

  const res = await fetch(`${r.url}/rest/v1/${target.table}`, {
    method: 'POST',
    headers: { apikey: r.key, Authorization: `Bearer ${r.key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(row),
  })
  if (!res.ok) return { ok: false, error: `${res.status} ${await res.text()}` }
  const created = (await res.json())?.[0]
  if (!created?.id) return { ok: false, error: 'The row was not returned after insert.' }

  // Remember what was made, so rollback can take exactly that away.
  await fetch(`${r.url}/rest/v1/arnie_proposals?id=eq.${prop.id}`, {
    method: 'PATCH',
    headers: { apikey: r.key, Authorization: `Bearer ${r.key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ payload: { ...prop.payload, created_id: created.id } }),
  })
  return { ok: true, id: created.id, label: prop.payload?.entity_label || target.label }
}

/**
 * Undo a create by deleting the row — but only while it is still just a row.
 * Once a quote, appointment or commission hangs off it, deleting the lead
 * would take those with it, and that is not "undo", that is destroying work.
 */
export async function rollbackCreateProposal(
  r: Rest, companyId: number, prop: any,
): Promise<{ ok: true; deleted: number } | { ok: false; error: string }> {
  const target = CREATE_TARGETS[prop.target]
  if (!target) return { ok: false, error: 'Unknown create target.' }
  const id = Number(prop.payload?.created_id)
  if (!id) return { ok: false, error: 'This draft never created anything.' }

  if (target.table === 'leads') {
    const refs = await Promise.all([
      readRecordList(r, `quotes?select=id&company_id=eq.${companyId}&lead_id=eq.${id}&limit=1`),
      readRecordList(r, `appointments?select=id&company_id=eq.${companyId}&lead_id=eq.${id}&limit=1`),
      readRecordList(r, `lead_commissions?select=id&company_id=eq.${companyId}&lead_id=eq.${id}&limit=1`),
      readRecordList(r, `jobs?select=id&company_id=eq.${companyId}&lead_id=eq.${id}&limit=1`),
    ])
    const names = ['a quote', 'an appointment', 'a setter commission', 'a job']
    const held = refs.map((x, i) => x.length ? names[i] : null).filter(Boolean)
    if (held.length) return { ok: false, error: `Can't undo — this lead already has ${held.join(', ')} attached. Delete it from the Leads page if you really mean to.` }
  }

  const res = await fetch(`${r.url}/rest/v1/${target.table}?id=eq.${id}&company_id=eq.${companyId}`, {
    method: 'DELETE',
    headers: { apikey: r.key, Authorization: `Bearer ${r.key}`, Prefer: 'return=minimal' },
  })
  if (!res.ok) return { ok: false, error: `${res.status} ${await res.text()}` }
  return { ok: true, deleted: id }
}
