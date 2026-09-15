// "Merge the Haliflax lead into Halifax Flooring."
//
// The duplicate warning (leads.possible_duplicate_of, similar_leads()) tells
// a rep the second copy exists. What it could not do was put the two back
// together. The second copy has its own appointment, its own setter fee,
// maybe its own quote — and deleting it, the only tool there was, UNLINKS
// all of that (store.js deleteLead) so the pay survives but points at
// nothing. A merge MOVES every child to the lead that stays, fills the
// blanks on it from the copy, keeps the copy's notes, and only then removes
// the copy. Rollback puts the copy back, id and all, and moves the children
// home.
//
// What a merge does NOT do is decide pay. When both leads carry a setter
// fee, both arrive on the merged lead and the card says so. Who earns it is
// a manager's call on the Lead Setter page, not a side effect of tidying.
//
// Which one stays: the one the other was flagged as a copy OF, else the
// older. The person can say "keep the newer one" or name the id.
//
// Who: manager (level 2) — the same bar as deleting a lead
// (guard_history_delete), because the copy is deleted at the end.

import type { Rest } from './arnieConfig.ts'
import type { Caller } from './auth.ts'
import { readRecordList, patchRow } from './arnieRest.ts'

const hdr = (r: Rest) => ({ apikey: r.key, Authorization: `Bearer ${r.key}`, 'Content-Type': 'application/json' })

/**
 * Every column that points at a lead. jobs.lead_id is TEXT holding the
 * numeric id (see lib/jobOwnership.js — the trap that made rep totals read
 * low); PostgREST compares it as a string, so it rides the same path.
 * leads.possible_duplicate_of is here so a THIRD copy flagged against the
 * one being removed is re-flagged against the one that stays.
 */
const REFS: { table: string; column: string; noun: string }[] = [
  { table: 'appointments',        column: 'lead_id', noun: 'appointment' },
  { table: 'quotes',              column: 'lead_id', noun: 'quote' },
  { table: 'jobs',                column: 'lead_id', noun: 'job' },
  { table: 'setter_commissions',  column: 'lead_id', noun: 'setter fee' },
  { table: 'lead_commissions',    column: 'lead_id', noun: 'lead commission' },
  { table: 'lead_payments',       column: 'lead_id', noun: 'payment' },
  { table: 'lead_follow_ups',     column: 'lead_id', noun: 'follow-up' },
  { table: 'lighting_audits',     column: 'lead_id', noun: 'audit' },
  { table: 'sales_pipeline',      column: 'lead_id', noun: 'pipeline entry' },
  { table: 'utility_invoices',    column: 'lead_id', noun: 'utility invoice' },
  { table: 'expenses',            column: 'lead_id', noun: 'expense' },
  { table: 'file_attachments',    column: 'lead_id', noun: 'file' },
  { table: 'dig_sites',           column: 'lead_id', noun: 'dig site' },
  { table: 'lawn_properties',     column: 'lead_id', noun: 'property' },
  { table: 'lawn_quote_requests', column: 'lead_id', noun: 'quote request' },
  { table: 'cc_contact_map',      column: 'lead_id', noun: 'contact link' },
  { table: 'prospect_enrichments', column: 'imported_as_lead_id', noun: 'enrichment' },
  { table: 'leads',               column: 'possible_duplicate_of', noun: 'flagged copy' },
]

/** Blanks on the kept lead that the copy may fill. Never overwrites. */
const FILL = ['customer_name', 'business_name', 'email', 'phone', 'address', 'service_type', 'lead_source', 'lead_source_name',
  'business_unit', 'job_title', 'salesperson_id', 'setter_owner_id', 'lead_owner_id', 'setter_id', 'customer_id', 'meter_number', 'ein']

const blank = (v: unknown) => v == null || String(v).trim() === ''
const label = (l: any) => [l.lead_id, l.business_name || l.customer_name].filter(Boolean).join(' — ') || `Lead #${l.id}`
const plural = (n: number, noun: string) => `${n} ${n === 1 ? noun : noun.endsWith('y') ? noun.slice(0, -1) + 'ies' : noun + 's'}`
const day = (iso: string | null) => iso ? String(iso).slice(0, 10) : '?'

export type MergeProposeResult =
  | { proposal: any; preview: { kind: 'record'; label: string; entity: string; field: string; before: string; after: string } }
  | { needs_choice: { id: number; label: string }[]; message: string }
  | { error: string }

/** Which rows in each child table point at this lead. Ids, so apply and rollback move exactly these. */
async function refsOf(r: Rest, companyId: number, leadId: number, exceptLeadId: number | null) {
  const out: { table: string; column: string; noun: string; ids: number[] }[] = []
  for (const ref of REFS) {
    const skip = ref.table === 'leads' && exceptLeadId != null ? `&id=neq.${exceptLeadId}` : ''
    const rows = await readRecordList(r, `${ref.table}?select=id&company_id=eq.${companyId}&${ref.column}=eq.${leadId}${skip}&limit=500`)
    if (rows.length) out.push({ ...ref, ids: rows.map((x: any) => x.id).sort((a: number, b: number) => a - b) })
  }
  return out
}

const sameRefs = (a: { table: string; ids: number[] }[], b: { table: string; ids: number[] }[]) =>
  JSON.stringify(a.map((x) => [x.table, x.ids])) === JSON.stringify(b.map((x) => [x.table, x.ids]))

async function findLeads(r: Rest, companyId: number, said: string) {
  const term = String(said || '').replace(/[*,()]/g, ' ').trim()
  const NOISE = new Set(['lead', 'leads', 'merge', 'duplicate', 'duplicates', 'copy', 'copies', 'into', 'with', 'and', 'the', 'that', 'this', 'them', 'both', 'two'])
  const words = [...new Set(term.toLowerCase().split(/\s+/).filter((w) => w.length >= 3 && !NOISE.has(w)))]
  if (!words.length) return { error: 'Tell me which customer — the business or the person on the lead.' }
  const hits = new Map<number, { row: any; n: number }>()
  for (const w of words) {
    const rows = await readRecordList(r, `leads?select=*&company_id=eq.${companyId}&or=(customer_name.ilike.*${w}*,business_name.ilike.*${w}*,lead_id.ilike.*${w}*,email.ilike.*${w}*)&limit=40`)
    for (const l of rows) { const h = hits.get(l.id) || { row: l, n: 0 }; h.n += 1; hits.set(l.id, h) }
  }
  return { rows: [...hits.values()].sort((a, b) => b.n - a.n).map((h) => h.row) }
}

/**
 * Two leads out of what the words found. A flagged copy and its original
 * beat everything; then a similar_leads() twin of the best match; then
 * exactly two hits. More than that is a question, not a guess.
 */
async function thePair(r: Rest, companyId: number, rows: any[]) {
  if (!rows.length) return { error: 'I do not find a lead for that here.' }
  for (const a of rows) {
    const b = rows.find((x) => String(x.id) === String(a.possible_duplicate_of))
    if (b) return { dup: a, keep: b }
  }
  if (rows.length === 1 || (rows.length > 2 && rows[0])) {
    const best = rows[0]
    const twins = await similarLeads(r, companyId, best)
    const twin = twins.find((t: any) => String(t.id) !== String(best.id))
    if (twin) {
      const [full] = await readRecordList(r, `leads?select=*&company_id=eq.${companyId}&id=eq.${twin.id}&limit=1`)
      if (full) return older(best, full)
    }
    if (rows.length === 1) return { error: `I only find one lead for that — ${label(best)}. Nothing to merge.` }
  }
  if (rows.length === 2) return older(rows[0], rows[1])
  return { needs_choice: rows.slice(0, 6).map((l) => ({ id: l.id, label: `${label(l)} · ${l.status || 'New'} · ${day(l.created_at)}` })), message: 'More than two leads match. Ask which is the copy to fold in, then call again with that record_id — and the id to keep as value if it is not the older one.' }
}

const older = (a: any, b: any) => {
  const ta = new Date(a.created_at || a.created_date || 0).getTime(), tb = new Date(b.created_at || b.created_date || 0).getTime()
  return ta <= tb && !(ta === tb && Number(a.id) > Number(b.id)) ? { keep: a, dup: b } : { keep: b, dup: a }
}

async function similarLeads(r: Rest, companyId: number, l: any) {
  const res = await fetch(`${r.url}/rest/v1/rpc/similar_leads`, {
    method: 'POST', headers: hdr(r),
    body: JSON.stringify({ p_company_id: companyId, p_customer_name: l.customer_name ?? null, p_business_name: l.business_name ?? null, p_phone: l.phone ?? null, p_email: l.email ?? null, p_exclude_id: l.id, p_limit: 3 }),
  })
  if (!res.ok) return []
  const rows = await res.json().catch(() => [])
  return Array.isArray(rows) ? rows : []
}

export async function proposeLeadMerge(
  r: Rest, caller: Caller,
  input: { record_query?: string; record_id?: number; value: string; timezone?: string },
): Promise<MergeProposeResult> {
  const companyId = caller.companyId
  if (companyId == null) return { error: 'No company on this login.' }
  if (caller.level < 2) return { error: 'Merging leads removes one of them, so it needs a manager — the same as deleting a lead.' }

  const said = String(input.value || '').trim().toLowerCase()
  let keep: any, dup: any
  if (input.record_id) {
    // After a needs_choice: record_id is the copy to fold in; value may name the keeper.
    ;[dup] = await readRecordList(r, `leads?select=*&company_id=eq.${companyId}&id=eq.${input.record_id}&limit=1`)
    if (!dup) return { error: `There's no lead #${input.record_id} here.` }
    const keepId = /^\d+$/.test(said) ? Number(said) : dup.possible_duplicate_of
    if (keepId) [keep] = await readRecordList(r, `leads?select=*&company_id=eq.${companyId}&id=eq.${keepId}&limit=1`)
    if (!keep) {
      const twin = (await similarLeads(r, companyId, dup))[0]
      if (twin) [keep] = await readRecordList(r, `leads?select=*&company_id=eq.${companyId}&id=eq.${twin.id}&limit=1`)
    }
    if (!keep) return { error: `I do not see which lead ${label(dup)} is a copy of. Tell me the id to keep.` }
  } else {
    const found = await findLeads(r, companyId, input.record_query || '')
    if ('error' in found) return { error: found.error }
    const pair = await thePair(r, companyId, found.rows)
    if ('error' in pair) return { error: pair.error }
    if ('needs_choice' in pair) return pair
    ;({ keep, dup } = pair)
    if (/^\d+$/.test(said) && String(keep.id) !== said) { if (String(dup.id) === said) [keep, dup] = [dup, keep]; else return { error: `#${said} is not one of the two leads I found (${label(keep)}, ${label(dup)}).` } }
    else if (/\b(newer|newest|second|latest)\b/.test(said)) { const o = older(keep, dup); keep = o.dup; dup = o.keep }
  }
  if (String(keep.id) === String(dup.id)) return { error: 'That is the same lead twice.' }

  // What moves, and what fills.
  const refs = await refsOf(r, companyId, dup.id, keep.id)
  const fill: Record<string, unknown> = {}
  const keptBefore: Record<string, unknown> = {}
  for (const c of FILL) if (blank(keep[c]) && !blank(dup[c])) { fill[c] = dup[c]; keptBefore[c] = keep[c] ?? null }
  if (String(keep.possible_duplicate_of) === String(dup.id)) { fill.possible_duplicate_of = null; keptBefore.possible_duplicate_of = keep.possible_duplicate_of }
  const stamp = new Date().toISOString().slice(0, 10)
  const carried = [dup.notes && `Notes: ${String(dup.notes).trim()}`, dup.status && dup.status !== keep.status && `It was at "${dup.status}".`].filter(Boolean).join(' ')
  const noteLine = `[Merged ${stamp}] Lead ${label(dup)} (#${dup.id}, created ${day(dup.created_at)}) was folded into this one.${carried ? ' ' + carried : ''}`
  keptBefore.notes = keep.notes ?? null
  fill.notes = [keep.notes, noteLine].filter((s) => s && String(s).trim()).join('\n')

  const moves = refs.map((x) => plural(x.ids.length, x.noun))
  const bothFees = refs.some((x) => x.table === 'setter_commissions') && (await readRecordList(r, `setter_commissions?select=id&company_id=eq.${companyId}&lead_id=eq.${keep.id}&limit=1`)).length > 0
  const filled = Object.keys(fill).filter((k) => k !== 'notes' && k !== 'possible_duplicate_of')
  const after = [
    `Keep ${label(keep)} (#${keep.id}, ${keep.status || 'New'}, created ${day(keep.created_at)}).`,
    moves.length ? `Moves over: ${moves.join(', ')}.` : 'Nothing else points at the copy.',
    filled.length ? `Fills in: ${filled.map((k) => k.replace(/_/g, ' ')).join(', ')}.` : '',
    bothFees ? 'Both leads carry a setter fee — both stay on the merged lead; who earns it is decided on Lead Setter, not here.' : '',
    `Then the copy is removed. This can be rolled back.`,
  ].filter(Boolean).join(' ')
  const before = `Two leads: ${label(keep)} (#${keep.id}, ${keep.status || 'New'}) and ${label(dup)} (#${dup.id}, ${dup.status || 'New'}, created ${day(dup.created_at)})`
  const entity = `${label(dup)} → ${label(keep)}`
  const summary = `Merged lead ${label(dup)} (#${dup.id}) into ${label(keep)} (#${keep.id}): ${moves.length ? moves.join(', ') + ' moved' : 'nothing to move'}${filled.length ? '; filled ' + filled.join(', ') : ''}.`

  const insert = await fetch(`${r.url}/rest/v1/arnie_proposals`, {
    method: 'POST', headers: { ...hdr(r), Prefer: 'return=representation' },
    body: JSON.stringify({
      company_id: companyId, created_by: caller.email,
      request_text: input.record_query || `lead #${dup.id} into #${keep.id}`,
      target: 'lead_merge', action: 'set',
      payload: {
        entity_table: 'leads', entity_id: keep.id, entity_label: entity, field: 'merge', value: `#${dup.id}`,
        keep_id: keep.id, dup_id: dup.id, dup_row: dup, refs, fill, kept_before: keptBefore,
        keep_snapshot: Object.fromEntries([...FILL, 'notes', 'possible_duplicate_of'].map((c) => [c, keep[c] ?? null])),
        proposer_employee_id: caller.employeeId,
      },
      summary, before_value: null, after_value: `merged #${dup.id} into #${keep.id}`, status: 'pending',
    }),
  })
  if (!insert.ok) return { error: `Couldn't save that draft: ${await insert.text()}` }
  // The saved payload carries the whole copy (every column, for rollback).
  // The model and the card get the id and the summary — the card is what
  // the person reads, and a model handed sixty columns narrates sixty columns.
  const saved = (await insert.json())?.[0] || {}
  const proposal = { ...saved, payload: { entity_table: 'leads', entity_id: keep.id, entity_label: entity, keep_id: keep.id, dup_id: dup.id, moves, filled } }
  return { proposal, preview: { kind: 'record', label: 'lead merge', entity, field: 'merge', before, after } }
}

/** Move the children, fill the blanks, remove the copy — refusing if either lead moved since the draft. */
export async function applyLeadMerge(r: Rest, companyId: number, prop: any): Promise<{ ok: true; before: any; after: any } | { ok: false; error: string; stale?: boolean }> {
  const p = prop.payload || {}
  const [keep] = await readRecordList(r, `leads?select=*&company_id=eq.${companyId}&id=eq.${p.keep_id}&limit=1`)
  const [dup] = await readRecordList(r, `leads?select=*&company_id=eq.${companyId}&id=eq.${p.dup_id}&limit=1`)
  if (!keep) return { ok: false, error: 'The lead to keep no longer exists.' }
  if (!dup) return { ok: false, stale: true, error: 'The copy is already gone — someone removed it since I drafted this. Nothing to do.' }
  const snap = p.keep_snapshot || {}
  for (const c of Object.keys(snap)) if (String(keep[c] ?? '') !== String(snap[c] ?? '')) return { ok: false, stale: true, error: `${label(keep)} changed since I drafted this (${c.replace(/_/g, ' ')}). Ask me again and I'll redraft it.` }
  const refs = await refsOf(r, companyId, dup.id, keep.id)
  if (!sameRefs(refs, p.refs || [])) return { ok: false, stale: true, error: `What points at ${label(dup)} changed since I drafted this. Ask me again and I'll redraft it.` }

  for (const ref of refs) {
    const res = await fetch(`${r.url}/rest/v1/${ref.table}?id=in.(${ref.ids.join(',')})&company_id=eq.${companyId}`, {
      method: 'PATCH', headers: { ...hdr(r), Prefer: 'return=minimal' }, body: JSON.stringify({ [ref.column]: ref.table === 'jobs' ? String(keep.id) : keep.id }),
    })
    if (!res.ok) return { ok: false, error: `Could not move ${ref.noun}s: ${res.status} ${await res.text()}` }
  }
  const fill = p.fill || {}
  if (Object.keys(fill).length) { const res = await patchRow(r, 'leads', companyId, keep.id, fill); if (!res.ok) return { ok: false, error: res.error } }
  const del = await fetch(`${r.url}/rest/v1/leads?id=eq.${dup.id}&company_id=eq.${companyId}`, { method: 'DELETE', headers: { ...hdr(r), Prefer: 'return=minimal' } })
  if (!del.ok) return { ok: false, error: `Moved everything, but could not remove the copy: ${del.status} ${await del.text()}` }
  return { ok: true, before: null, after: prop.after_value }
}

/** Put the copy back, id and all, and move its children home. */
export async function rollbackLeadMerge(r: Rest, companyId: number, prop: any): Promise<{ ok: true; restored: any } | { ok: false; error: string }> {
  const p = prop.payload || {}
  const [keep] = await readRecordList(r, `leads?select=id&company_id=eq.${companyId}&id=eq.${p.keep_id}&limit=1`)
  if (!keep) return { ok: false, error: 'The merged lead no longer exists, so there is nothing to split back out.' }
  const [already] = await readRecordList(r, `leads?select=id&company_id=eq.${companyId}&id=eq.${p.dup_id}&limit=1`)
  if (already) return { ok: false, error: `Lead #${p.dup_id} is already back.` }
  const row = { ...(p.dup_row || {}), company_id: companyId, id: p.dup_id }
  const ins = await fetch(`${r.url}/rest/v1/leads`, { method: 'POST', headers: { ...hdr(r), Prefer: 'return=minimal' }, body: JSON.stringify(row) })
  if (!ins.ok) return { ok: false, error: `Could not put the copy back: ${ins.status} ${await ins.text()}` }
  for (const ref of p.refs || []) {
    const res = await fetch(`${r.url}/rest/v1/${ref.table}?id=in.(${ref.ids.join(',')})&company_id=eq.${companyId}`, {
      method: 'PATCH', headers: { ...hdr(r), Prefer: 'return=minimal' }, body: JSON.stringify({ [ref.column]: ref.table === 'jobs' ? String(p.dup_id) : p.dup_id }),
    })
    if (!res.ok) return { ok: false, error: `Put the copy back, but could not move ${ref.noun}s home: ${res.status} ${await res.text()}` }
  }
  const before = p.kept_before || {}
  if (Object.keys(before).length) { const res = await patchRow(r, 'leads', companyId, p.keep_id, before); if (!res.ok) return { ok: false, error: res.error } }
  return { ok: true, restored: `lead #${p.dup_id} restored` }
}
