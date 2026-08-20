// Drafting and applying a Tier-B record change. Split from arnieRecords.ts so
// the target registry and the lookup rules stay readable on their own.

import type { Rest } from './arnieConfig.ts'
import type { Caller } from './auth.ts'
import { readRecordList, patchRow } from './arnieRest.ts'
import {
  RECORD_TARGETS, activeJobId, computeAfter, describeAfter, resolveEntity, valuesInUse,
} from './arnieRecords.ts'

export interface RecordPreview {
  kind: 'record'
  label: string
  entity: string
  field: string
  before: string
  after: string
}

export type RecordProposeResult =
  | { proposal: any; preview: RecordPreview }
  | { needs_choice: { id: number; label: string }[]; message: string }
  | { error: string }

/** May this caller change this target, on this row? */
export async function mayChange(
  r: Rest, caller: Caller, targetKey: string, rowId: number | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const target = RECORD_TARGETS[targetKey]
  if (!target) return { ok: false, error: 'Not a change Arnie can make.' }
  if (caller.companyId == null) return { ok: false, error: 'No company on this login.' }
  if (caller.level >= target.minLevel) return { ok: true }
  if (target.allowOnActiveJob && rowId != null) {
    const active = await activeJobId(r, caller.companyId, caller.employeeId)
    if (active != null && Number(active) === Number(rowId)) return { ok: true }
    return { ok: false, error: `You can add a note to the job you're clocked into. For any other ${target.label}, ask a manager.` }
  }
  return { ok: false, error: `Changing a ${target.label} is above your access level. Ask a manager.` }
}

export async function proposeRecordChange(
  r: Rest,
  caller: Caller,
  input: { target: string; record_query?: string; record_id?: number; value: string },
): Promise<RecordProposeResult> {
  const companyId = caller.companyId
  if (companyId == null) return { error: 'No company on this login.' }
  const target = RECORD_TARGETS[input.target]
  if (!target) return { error: `"${input.target}" isn't something Arnie can change.` }

  const value = String(input.value ?? '').trim()
  if (!value) return { error: `Nothing to set — tell me the new ${target.label}.` }

  // Locate the row FIRST: permission on a note depends on which job it is.
  const found = await resolveEntity(r, companyId, target, input.record_query || '', input.record_id)
  if ('error' in found) return { error: found.error }
  if ('candidates' in found) {
    return {
      needs_choice: found.candidates,
      message: 'More than one record matches. Ask the user which one, then call again with record_id.',
    }
  }
  const row = found.row

  const allowed = await mayChange(r, caller, input.target, row.id)
  if (!allowed.ok) return { error: allowed.error }

  if (target.isDate && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { error: `Give me the date as YYYY-MM-DD — I got "${value}".` }
  }

  // Free-text status columns: only values this company already uses. Without
  // this, "mark it done" writes "Done" into a system whose jobs are
  // "Completed", and it silently drops out of every filter and report.
  if (target.validateAgainstExisting) {
    const inUse = await valuesInUse(r, companyId, target)
    const match = inUse.find((v) => v.toLowerCase() === value.toLowerCase())
    if (!match) {
      return { error: `"${value}" isn't a ${target.label} this company uses. The ones in use are: ${inUse.join(', ')}.` }
    }
    // Adopt the stored casing rather than the model's.
    input.value = match
  }

  const finalValue = target.validateAgainstExisting ? String(input.value) : value
  const before = row[target.field]
  const after = computeAfter(target, before, finalValue)
  if (String(before ?? '') === String(after)) {
    return { error: `Nothing to do — that ${target.label} is already "${finalValue}".` }
  }

  const entity = target.labelOf(row)
  const summary = target.mode === 'append'
    ? `Added a note to ${entity}.`
    : `Set ${target.label} on ${entity} to "${finalValue}".`

  const insert = await fetch(`${r.url}/rest/v1/arnie_proposals`, {
    method: 'POST',
    headers: {
      apikey: r.key, Authorization: `Bearer ${r.key}`,
      'Content-Type': 'application/json', Prefer: 'return=representation',
    },
    body: JSON.stringify({
      company_id: companyId,
      created_by: caller.email,
      request_text: input.record_query || `record #${row.id}`,
      target: input.target,
      action: target.mode,
      payload: {
        entity_table: target.table, entity_id: row.id, entity_label: entity,
        field: target.field, value: finalValue,
      },
      summary,
      before_value: before ?? null,
      after_value: after,
      status: 'pending',
    }),
  })
  if (!insert.ok) return { error: `Couldn't save that proposal: ${await insert.text()}` }

  return {
    proposal: (await insert.json())?.[0],
    preview: {
      kind: 'record',
      label: target.label,
      entity,
      field: target.field,
      before: before == null || before === '' ? '(empty)' : String(before),
      after: describeAfter(target, before, finalValue),
    },
  }
}

/**
 * Apply an approved record proposal.
 * Re-reads the row and refuses if the field moved since the draft — the same
 * rule the config path uses, for the same reason: an approval is consent to a
 * specific change, not a standing licence to overwrite whatever is there now.
 */
export async function applyRecordProposal(
  r: Rest, companyId: number, prop: any,
): Promise<{ ok: true; before: any; after: any } | { ok: false; error: string; stale?: boolean }> {
  const target = RECORD_TARGETS[prop.target]
  if (!target) return { ok: false, error: 'Unknown record target.' }
  const { entity_id: id, field } = prop.payload || {}
  if (!id || !field) return { ok: false, error: 'That proposal is missing its record.' }

  const rows = await readRecordList(r, `${target.table}?select=id,${field}&company_id=eq.${companyId}&id=eq.${id}&limit=1`)
  if (!rows.length) return { ok: false, error: 'That record no longer exists.' }

  const current = rows[0][field]
  if (String(current ?? '') !== String(prop.before_value ?? '')) {
    return { ok: false, stale: true, error: `That ${target.label} changed since I drafted this — it's "${current}" now. Ask me again and I'll redraft it.` }
  }

  const res = await patchRow(r, target.table, companyId, id, { [field]: prop.after_value })
  if (!res.ok) return { ok: false, error: res.error }
  return { ok: true, before: prop.before_value, after: prop.after_value }
}

/** Put the field back to what it was before the change was applied. */
export async function rollbackRecordProposal(
  r: Rest, companyId: number, prop: any,
): Promise<{ ok: true; restored: any } | { ok: false; error: string }> {
  const target = RECORD_TARGETS[prop.target]
  if (!target) return { ok: false, error: 'Unknown record target.' }
  const { entity_id: id, field } = prop.payload || {}
  if (!id || !field) return { ok: false, error: 'That proposal is missing its record.' }
  const res = await patchRow(r, target.table, companyId, id, { [field]: prop.before_value })
  if (!res.ok) return { ok: false, error: res.error }
  return { ok: true, restored: prop.before_value }
}
