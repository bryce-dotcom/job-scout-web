// EMPLOYEE IDENTITY, edge side (2026-10-15).
//
// SSN, DOB, home address, bank and EIN live in public.employee_identity, not
// on employees (employees is readable by the whole company). These functions
// run as the service role, so RLS does not stop them, but they must still
// READ the new table: the employees columns are emptied by the follow-up
// migration and dropped a release later.
//
// Twin of src/lib/employeeIdentity.js; keep IDENTITY_FIELDS identical
// (src/lib/employeeIdentity.test.js reads this file and pins it).
//
// Unlike the browser helper these THROW: a W-2, a 1099 or an onboarding PDF
// rendered without the SSN or address is a wrong document, not a degraded one.

export const IDENTITY_FIELDS = [
  'ssn_last4', 'ssn_encrypted', 'date_of_birth',
  'home_address', 'home_city', 'home_state', 'home_zip',
  'dd_account_encrypted', 'dd_routing_encrypted', 'dd_account_last4', 'dd_account_type',
  'w9_ein_encrypted', 'w9_ein_last4',
] as const;

const IDENTITY_SET = new Set<string>(IDENTITY_FIELDS);

/** Split one update object into its employees part and its identity part. */
export function splitIdentity(update: Record<string, unknown>) {
  const employee: Record<string, unknown> = {};
  const identity: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(update || {})) {
    if (IDENTITY_SET.has(k)) identity[k] = v; else employee[k] = v;
  }
  return { employee, identity, hasIdentity: Object.keys(identity).length > 0 };
}

/** employee_id → identity row, for the given employee ids. Throws on error. */
// deno-lint-ignore no-explicit-any
export async function loadIdentity(sb: any, ids: Array<number | null | undefined>): Promise<Map<number, Record<string, unknown>>> {
  const list = [...new Set(ids.filter((id): id is number => id != null))];
  const map = new Map<number, Record<string, unknown>>();
  if (!list.length) return map;
  for (let i = 0; i < list.length; i += 200) {
    const { data, error } = await sb.from('employee_identity')
      .select(['employee_id', ...IDENTITY_FIELDS].join(', '))
      .in('employee_id', list.slice(i, i + 200));
    if (error) throw new Error('employee_identity load failed: ' + error.message);
    for (const r of data || []) map.set(r.employee_id, r);
  }
  return map;
}

/**
 * Lay identity over employees rows (each needs `id`). The identity row is the
 * only source; the rows' own legacy identity columns are dropped.
 */
// deno-lint-ignore no-explicit-any
export async function withIdentity<T extends { id: number }>(sb: any, rows: T[] | null | undefined): Promise<Array<T & Record<string, any>>> {
  const list = rows || [];
  const map = await loadIdentity(sb, list.map((r) => r?.id));
  return list.map((row) => {
    // deno-lint-ignore no-explicit-any
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(row)) if (!IDENTITY_SET.has(k)) out[k] = v;
    const ident = map.get(row.id);
    if (ident) for (const k of IDENTITY_FIELDS) if (k in ident) out[k] = ident[k];
    return out as T & Record<string, any>;
  });
}

/** Upsert identity fields for one employee. Only present keys are written. Throws on error. */
// deno-lint-ignore no-explicit-any
export async function saveIdentity(sb: any, employeeId: number, companyId: number, fields: Record<string, unknown>) {
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields || {})) if (IDENTITY_SET.has(k)) patch[k] = v;
  if (!Object.keys(patch).length) return;
  const { error } = await sb.from('employee_identity')
    .upsert({ employee_id: employeeId, company_id: companyId, ...patch }, { onConflict: 'employee_id' });
  if (error) throw new Error('employee_identity save failed: ' + error.message);
}
