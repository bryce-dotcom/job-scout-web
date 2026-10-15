// EMPLOYEE IDENTITY — SSN, DOB, home address, bank, EIN (2026-10-15)
//
// These live in public.employee_identity, NOT on employees. employees is the
// roster everybody in the company reads (sign-in, pickers, the store), and its
// RLS is company-level only, so with the fields on it any signed-in employee
// could pull every coworker's SSN last four, DOB, home address and bank last
// four from the REST API. employee_identity is readable and writable only by
// the employee themself, a payroll admin of their company, or a platform
// developer (public.can_see_employee_private, the same rule as the decrypt
// RPCs and OnboardingPanel). Someone outside that rule gets NO row back, not an
// error, so an absent row means "not yours to see", and a save must never send
// identity fields it did not load (that would blank them).
//
// One list, one split, one merge: Employees, Payroll, Payroll Inbox, Payroll
// setup, My Pay, paystubs and the store all go through here. Its twin for the
// edge functions is supabase/functions/_shared/employeeIdentity.ts; keep the
// two field lists identical (employeeIdentity.test.js pins it).
//
// No supabase import: every call takes the client, so the pure parts test
// without a network.

export const IDENTITY_FIELDS = Object.freeze([
  'ssn_last4', 'ssn_encrypted', 'date_of_birth',
  'home_address', 'home_city', 'home_state', 'home_zip',
  'dd_account_encrypted', 'dd_routing_encrypted', 'dd_account_last4', 'dd_account_type',
  'w9_ein_encrypted', 'w9_ein_last4',
])

const IDENTITY_SET = new Set(IDENTITY_FIELDS)

/** Copy of an employees row with every identity field removed. */
export function stripIdentity(row) {
  if (!row || typeof row !== 'object') return row
  const out = {}
  for (const k of Object.keys(row)) if (!IDENTITY_SET.has(k)) out[k] = row[k]
  return out
}

/**
 * Split a write payload into what goes to employees and what goes to
 * employee_identity. Only keys PRESENT in the payload land in `identity` (a
 * key left out means "leave it alone", the same as an omitted column), and
 * `hasIdentity` says whether any identity key was present at all.
 */
export function splitIdentity(payload) {
  const employee = {}
  const identity = {}
  let hasIdentity = false
  for (const k of Object.keys(payload || {})) {
    if (IDENTITY_SET.has(k)) { identity[k] = payload[k]; hasIdentity = true }
    else employee[k] = payload[k]
  }
  return { employee, identity, hasIdentity }
}

/** True when an identity patch carries any real value (not null / '' / undefined). */
export function identityHasValues(identity) {
  return Object.keys(identity || {}).some(k => IDENTITY_SET.has(k) && identity[k] != null && identity[k] !== '')
}

/**
 * Whether a save may write identity, and whether it must refuse.
 *   new hire                 → write if anything was entered
 *   someone whose row loaded → write (the form round-trips the real values)
 *   someone whose row didn't → never write (the form holds blanks that would
 *                              wipe the real values); refuse if the user typed
 *                              something, so it is not silently dropped
 */
export function identitySavePlan({ isNew, employeeId, loadedIds, identity }) {
  const typed = identityHasValues(identity)
  if (isNew) return { write: typed, refuse: false }
  const loaded = !!loadedIds && (loadedIds instanceof Set ? loadedIds.has(employeeId) : loadedIds.includes?.(employeeId))
  if (loaded) return { write: true, refuse: false }
  return { write: false, refuse: typed }
}

/**
 * Lay identity rows over employees rows. The identity row is the ONLY source:
 * an employees row's own identity columns (legacy, nulled by the follow-up
 * migration) are always dropped, so a coworker you may not see comes back
 * without them even while the legacy columns still hold values.
 * `identityById` is a Map or plain object keyed by employee id.
 */
export function mergeIdentity(rows, identityById) {
  const get = (id) => identityById instanceof Map ? identityById.get(id) : identityById?.[id]
  return (rows || []).map((row) => {
    if (!row) return row
    const base = stripIdentity(row)
    const ident = get(row.id)
    if (!ident) return base
    for (const k of IDENTITY_FIELDS) if (k in ident) base[k] = ident[k]
    return base
  })
}

/** Same as mergeIdentity for one row. */
export function mergeIdentityOne(row, identityRow) {
  if (!row) return row
  return mergeIdentity([row], identityRow ? { [row.id]: identityRow } : {})[0]
}

const SELECT = ['employee_id', ...IDENTITY_FIELDS].join(', ')

/**
 * Identity rows the caller may see, as a Map employee_id → row.
 * Pass `{ companyId }` for a whole company or `{ ids }` for specific people.
 * Resolves `{ map, error }`; never throws, so a caller decides whether a
 * failure blocks it (a W-2 must; a status dot need not).
 */
export async function fetchIdentityMap(sb, { companyId, ids } = {}) {
  const map = new Map()
  try {
    let q = sb.from('employee_identity').select(SELECT)
    if (ids) {
      const list = [...new Set(ids.filter(id => id != null))]
      if (!list.length) return { map, error: null }
      q = q.in('employee_id', list)
    } else if (companyId != null) {
      q = q.eq('company_id', companyId)
    } else {
      return { map, error: new Error('fetchIdentityMap needs companyId or ids') }
    }
    const { data, error } = await q
    if (error) return { map, error }
    for (const r of data || []) map.set(r.employee_id, r)
    return { map, error: null }
  } catch (error) {
    return { map, error }
  }
}

/** One person's identity row (or null: none, or not yours to see). */
export async function fetchIdentity(sb, employeeId) {
  const { map, error } = await fetchIdentityMap(sb, { ids: [employeeId] })
  return { data: map.get(employeeId) || null, error }
}

/**
 * Write identity fields for one employee. Upsert, so it works whether or not
 * the row exists yet; company_id is re-stamped from employees by a trigger.
 * Only keys present in `fields` are written. Resolves `{ error }`.
 */
export async function saveIdentity(sb, employeeId, companyId, fields) {
  const patch = {}
  for (const k of Object.keys(fields || {})) if (IDENTITY_SET.has(k)) patch[k] = fields[k]
  if (!employeeId) return { error: new Error('saveIdentity needs an employee id') }
  if (!Object.keys(patch).length) return { error: null }
  const { error } = await sb.from('employee_identity')
    .upsert({ employee_id: employeeId, company_id: companyId, ...patch }, { onConflict: 'employee_id' })
  return { error: error || null }
}
