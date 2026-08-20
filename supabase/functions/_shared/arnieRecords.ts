// Tier B — Arnie proposes a change to ONE FIELD of ONE ROW.
//
// Tier A (arnieConfig.ts) let him reshape the taxonomy lists in `settings`.
// This widens the same rail to real records — a job's status, a lead's stage,
// a note, a scheduled date — without widening the trust model:
//
//   • The model never names a row id. It describes the record in words and
//     THIS code does the lookup. That is the whole safety story: a model
//     handed 7,000 job ids will eventually pick a plausible wrong one, and a
//     valid change to the wrong job is indistinguishable from a correct one
//     on the approval card.
//   • An ambiguous description returns CANDIDATES, never a guess. Arnie has
//     to go back and ask which one.
//   • Free-text status fields are validated against the values the company
//     actually uses, so "Done" cannot quietly appear next to "Completed".
//   • Nothing is written until a human approves. Apply re-reads the row and
//     refuses if it moved since the draft.
//
// No schema change was needed: `target` names the action, and the existing
// payload / before_value / after_value columns carry the rest.

import { readRecordList } from './arnieRest.ts'
import type { Rest } from './arnieConfig.ts'

export interface RecordTarget {
  label: string          // "job status" — used in copy
  table: string
  field: string
  mode: 'set' | 'append'
  /** Minimum access level (see _shared/auth.ts): 2 = manager, 3 = admin. */
  minLevel: number
  /** Columns searched when locating the record from a description. */
  searchCols: string[]
  /** Columns fetched so the card can name the record a human recognises. */
  selectCols: string
  /** Human label for a resolved row. */
  labelOf: (row: Record<string, any>) => string
  /** Free-text field that must match a value already in use. */
  validateAgainstExisting?: boolean
  /** Reject anything that is not a plain ISO date. */
  isDate?: boolean
  /**
   * Field writes normally need minLevel. A tech clocked into a job is the
   * exception worth carving out: they are the person who knows what happened
   * on it, and making them find a manager to record a note is how notes stop
   * getting written. Only ever relaxes to the job they are actually on.
   */
  allowOnActiveJob?: boolean
}

const jobLabel = (r: Record<string, any>) =>
  [r.job_id, r.job_title || r.customer_name || r.business_name].filter(Boolean).join(' — ') || `Job #${r.id}`
const leadLabel = (r: Record<string, any>) =>
  [r.lead_id, r.business_name || r.customer_name].filter(Boolean).join(' — ') || `Lead #${r.id}`

const JOB_SELECT = 'id,job_id,job_title,customer_name,business_name,status,notes,start_date,address'
const LEAD_SELECT = 'id,lead_id,customer_name,business_name,status,notes,address'
const JOB_SEARCH = ['job_id', 'job_title', 'customer_name', 'business_name', 'address']
const LEAD_SEARCH = ['lead_id', 'customer_name', 'business_name', 'address']

export const RECORD_TARGETS: Record<string, RecordTarget> = {
  job_status: {
    label: 'job status', table: 'jobs', field: 'status', mode: 'set', minLevel: 2,
    searchCols: JOB_SEARCH, selectCols: JOB_SELECT, labelOf: jobLabel, validateAgainstExisting: true,
  },
  job_note: {
    label: 'job note', table: 'jobs', field: 'notes', mode: 'append', minLevel: 2,
    searchCols: JOB_SEARCH, selectCols: JOB_SELECT, labelOf: jobLabel, allowOnActiveJob: true,
  },
  job_schedule: {
    label: 'job start date', table: 'jobs', field: 'start_date', mode: 'set', minLevel: 2,
    searchCols: JOB_SEARCH, selectCols: JOB_SELECT, labelOf: jobLabel, isDate: true,
  },
  lead_status: {
    label: 'lead status', table: 'leads', field: 'status', mode: 'set', minLevel: 2,
    searchCols: LEAD_SEARCH, selectCols: LEAD_SELECT, labelOf: leadLabel, validateAgainstExisting: true,
  },
  lead_note: {
    label: 'lead note', table: 'leads', field: 'notes', mode: 'append', minLevel: 2,
    searchCols: LEAD_SEARCH, selectCols: LEAD_SELECT, labelOf: leadLabel,
  },
}

export const isRecordTarget = (t: string): boolean => Object.hasOwn(RECORD_TARGETS, t)

export function recordTargetsSentence(): string {
  return Object.entries(RECORD_TARGETS).map(([k, t]) => `${k} (${t.label})`).join(', ')
}

/** Which job is this employee clocked into right now, if any? */
export async function activeJobId(r: Rest, companyId: number, employeeId: number | null): Promise<number | null> {
  if (!employeeId) return null
  const rows = await readRecordList(r,
    `time_clock?select=job_id&company_id=eq.${companyId}&employee_id=eq.${employeeId}&clock_out=is.null&order=id.desc&limit=1`)
  return rows?.[0]?.job_id ?? null
}

export interface ResolvedEntity { row: Record<string, any> }
export interface AmbiguousEntity { candidates: { id: number; label: string }[] }

/**
 * Find the one record the description refers to.
 * Returns candidates rather than choosing when the description fits several,
 * and an error when it fits none. It never picks "the only one available".
 */
export async function resolveEntity(
  r: Rest, companyId: number, target: RecordTarget, query: string, recordId?: number,
): Promise<ResolvedEntity | AmbiguousEntity | { error: string }> {
  if (recordId) {
    const rows = await readRecordList(r,
      `${target.table}?select=${target.selectCols}&company_id=eq.${companyId}&id=eq.${recordId}&limit=1`)
    if (!rows?.length) return { error: `There's no ${target.table.replace(/s$/, '')} #${recordId} in this company.` }
    return { row: rows[0] }
  }

  const q = String(query || '').trim()
  // A description this thin ("the job", "it") cannot identify a row, and the
  // search would happily return the first of thousands.
  if (q.length < 3) return { error: 'Tell me which record — a name, address or number I can match on.' }

  const term = q.replace(/[*,()]/g, ' ').trim()
  const or = target.searchCols.map((c) => `${c}.ilike.*${term}*`).join(',')
  let rows = await readRecordList(r,
    `${target.table}?select=${target.selectCols}&company_id=eq.${companyId}&or=(${or})&order=id.desc&limit=7`)

  // Whole-phrase matching is strict; retry on the most distinctive word so
  // "the Drinkle insurance job" still finds "WY Drinkle Ins Agency".
  if (!rows?.length) {
    const word = term.split(/\s+/).filter((w) => w.length >= 4).sort((a, b) => b.length - a.length)[0]
    if (word) {
      const or2 = target.searchCols.map((c) => `${c}.ilike.*${word}*`).join(',')
      rows = await readRecordList(r,
        `${target.table}?select=${target.selectCols}&company_id=eq.${companyId}&or=(${or2})&order=id.desc&limit=7`)
    }
  }

  if (!rows?.length) return { error: `I couldn't find anything matching "${q}".` }
  if (rows.length > 1) {
    return { candidates: rows.slice(0, 6).map((x: any) => ({ id: x.id, label: target.labelOf(x) })) }
  }
  return { row: rows[0] }
}

/** Values this company actually uses in a free-text field. */
export async function valuesInUse(r: Rest, companyId: number, target: RecordTarget): Promise<string[]> {
  const seen = new Set<string>()
  for (let from = 0; from < 20000; from += 1000) {
    const rows = await readRecordList(r,
      `${target.table}?select=${target.field}&company_id=eq.${companyId}&order=id&offset=${from}&limit=1000`)
    if (!rows?.length) break
    for (const x of rows) { const v = x?.[target.field]; if (v) seen.add(String(v)) }
    if (rows.length < 1000) break
  }
  return [...seen].sort()
}

/**
 * The value to store, and the value to show as "after".
 * Appending never overwrites — a note is added to what is already there,
 * because losing an existing note to record a new one is not a trade anyone
 * would accept, and the approval card cannot show what it does not know.
 */
export function computeAfter(target: RecordTarget, before: any, value: string): string {
  if (target.mode !== 'append') return value
  const prior = String(before ?? '').trim()
  return prior ? `${prior}\n${value}` : value
}

export function describeAfter(target: RecordTarget, before: any, value: string): string {
  if (target.mode !== 'append') return value
  const prior = String(before ?? '').trim()
  return prior ? `…existing note kept, plus: "${value}"` : `"${value}"`
}
