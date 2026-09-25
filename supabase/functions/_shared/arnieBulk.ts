// Tier B, plural — one approval that changes the same field on many rows.
//
// This exists because the single-record path, honestly applied, is unusable
// for the work people actually have. Ten products carry a manufacturer with a
// trailing space; twenty-two say "Maverick Lighting" where the rest say "MES".
// Ten approvals to fix ten spaces is not a feature anyone uses — they go and
// do it by hand, and the catalogue stays wrong.
//
// The blast radius is obviously larger, so the safety rules are stricter than
// the single-record path, not looser:
//
//   • The model supplies a FILTER, never a list of rows. The server resolves
//     it. There is no path where a made-up id becomes a write.
//   • The filter is exact-match on one column. No ranges, no LIKE, no OR —
//     nothing where a small mistake quietly widens the set.
//   • The preview lists EVERY affected row, not a count. "This changes 34
//     products" is not something a human can meaningfully approve.
//   • A hard ceiling. Past it, Arnie has to narrow the request instead.
//   • Apply re-reads every row and refuses if ANY of them moved since the
//     draft — partially-stale approval is not consent.

import type { Rest } from './arnieConfig.ts'
import type { Caller } from './auth.ts'
import { readRecordList, patchRow } from './arnieRest.ts'

/** Past this, a human is rubber-stamping rather than reviewing. */
export const BULK_MAX = 200

export interface BulkTarget {
  label: string           // "manufacturer" — used in copy
  /** What one row IS, for copy: "product", "expense". */
  noun: string
  /** Where these rows live, for the refusal a non-admin sees: "the catalogue". */
  scope: string
  table: string
  field: string
  /** Columns a filter may match on. Deliberately short. */
  filterable: string[]
  /**
   * Columns where the filter matches a WORD inside the value instead of the
   * whole of it. Exact match is the default and stays the default: it is what
   * makes "twenty-two say Maverick Lighting" safe to fix.
   *
   * Expenses needed the exception. A book of them does not carry a tidy
   * vendor column — on the tenant that asked for this, 47 of 60 rows have
   * vendor null and the merchant's name lives in free text ("FUEL - CHEVRON
   * #2214"). Exact match cannot express "the Chevron ones" there, and a
   * capability nobody can use is the thing that leaves every expense filed
   * under Materials, which is exactly what we found.
   *
   * The control is not the operator, it is the card: every affected row is
   * listed with its date and amount, the ceiling still applies, and apply
   * still refuses if any one of them moved.
   */
  containsFilters?: string[]
  /**
   * The columns behind the pseudo-field "text": one word, matched across all
   * of them at once.
   *
   * "The Chevron ones" is not a column. On the book that asked for this, one
   * Chevron charge carries vendor 'Chevron' and description 'gas', another
   * carries description 'FUEL - CHEVRON #2214' and no vendor at all. Filtering
   * a single column finds one of the three and quietly leaves the rest —
   * which reads as success and is worse than a refusal.
   */
  textFilters?: string[]
  minLevel: number
  selectCols: string
  labelOf: (row: Record<string, any>) => string
  /** Coerce/validate the incoming value; return null to reject. */
  coerce?: (v: string) => string | number | boolean | null
}

const productLabel = (r: Record<string, any>) =>
  [r.item_id, r.name].filter(Boolean).join(' — ') || `Product #${r.id}`
const PRODUCT_SELECT = 'id,item_id,name,manufacturer,product_category,type,unit_price,cost,active'
const PRODUCT_FILTERS = ['manufacturer', 'product_category', 'type', 'name']

const bool = (v: string) => {
  const t = String(v).trim().toLowerCase()
  if (['true', 'yes', 'active', '1'].includes(t)) return true
  if (['false', 'no', 'inactive', '0'].includes(t)) return false
  return null
}

const money = (n: unknown) => '$' + (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const day = (v: unknown) => String(v ?? '').slice(0, 10)
/** Everything a person needs to judge one line: when, who, how much, what it says. */
const expenseLabel = (r: Record<string, any>) =>
  [day(r.date), r.vendor || r.merchant || null, money(r.amount), r.description || null]
    .filter(Boolean).join(' · ')

/** The Expenses page's list, exactly (src/lib/schema.js EXPENSE_CATEGORIES). */
const EXPENSE_CATEGORIES = [
  'Cost of Sale', 'Materials', 'Labor', 'Equipment Rental', 'Permits', 'Travel', 'Fuel',
  'Meals', 'Subcontractor', 'Office Supplies', 'Marketing', 'Insurance', 'Utilities', 'Other',
]
/** Only a category the page offers. A typo must not invent a fifteenth category nobody can filter by. */
const expenseCategory = (v: string) => EXPENSE_CATEGORIES.find((c) => c.toLowerCase() === String(v).trim().toLowerCase()) ?? null

export const BULK_TARGETS: Record<string, BulkTarget> = {
  product_manufacturer: {
    label: 'manufacturer', noun: 'product', scope: 'the catalogue', table: 'products_services', field: 'manufacturer',
    filterable: PRODUCT_FILTERS, minLevel: 3, selectCols: PRODUCT_SELECT, labelOf: productLabel,
  },
  product_category: {
    label: 'category', noun: 'product', scope: 'the catalogue', table: 'products_services', field: 'product_category',
    filterable: PRODUCT_FILTERS, minLevel: 3, selectCols: PRODUCT_SELECT, labelOf: productLabel,
  },
  product_active: {
    // The safe stand-in for "delete". Products are referenced by quote_lines,
    // job_lines, invoice_lines and purchase_order_lines — deleting one orphans
    // historical documents. Deactivating removes it from every picker, keeps
    // the history intact, and is reversible by the same rollback everything
    // else uses.
    label: 'active flag', noun: 'product', scope: 'the catalogue', table: 'products_services', field: 'active',
    filterable: PRODUCT_FILTERS, minLevel: 3, selectCols: PRODUCT_SELECT, labelOf: productLabel,
    coerce: bool,
  },

  // Re-filing the books. Every one of the first tenant's expenses was filed
  // "Materials" — McDonald's and Domino's included — because fixing them one
  // at a time is work nobody does.
  expense_category: {
    label: 'expense category', noun: 'expense', scope: 'the books',
    table: 'expenses', field: 'category', minLevel: 3,
    filterable: ['text', 'vendor', 'merchant', 'description', 'category', 'business_unit'],
    containsFilters: ['vendor', 'merchant', 'description'],
    textFilters: ['vendor', 'merchant', 'description'],
    selectCols: 'id,expense_id,date,amount,vendor,merchant,description,category,job_id,status',
    labelOf: expenseLabel,
    coerce: expenseCategory,
  },
}

export const isBulkTarget = (t: string) => Object.hasOwn(BULK_TARGETS, t)
export const bulkTargetsSentence = () =>
  Object.entries(BULK_TARGETS).map(([k, t]) => `${k} (${t.label})`).join(', ')

export interface BulkPreview {
  kind: 'bulk'
  label: string
  field: string
  filter: string
  after: string
  rows: { id: number; label: string; before: string }[]
}

export type BulkProposeResult =
  | { proposal: any; preview: BulkPreview }
  | { error: string }

export async function proposeBulkChange(
  r: Rest,
  caller: Caller,
  input: { target: string; filter_field: string; filter_value: string; value: string },
): Promise<BulkProposeResult> {
  const companyId = caller.companyId
  if (companyId == null) return { error: 'No company on this login.' }
  const target = BULK_TARGETS[input.target]
  if (!target) return { error: `"${input.target}" isn't something Arnie can change in bulk.` }
  if (caller.level < target.minLevel) {
    return { error: `Changing ${target.label} across ${target.scope} needs admin access.` }
  }

  const field = String(input.filter_field || '').trim()
  if (!target.filterable.includes(field)) {
    return { error: `I can only match on ${target.filterable.join(', ')} — not "${field}".` }
  }
  const filterValue = String(input.filter_value ?? '')
  const raw = String(input.value ?? '').trim()
  if (!raw) return { error: `Tell me what to set the ${target.label} to.` }
  const value = target.coerce ? target.coerce(raw) : raw
  if (value === null) return { error: `"${raw}" isn't a valid ${target.label}.` }

  // Exact match, including whitespace — that is the whole point when the
  // problem being fixed IS the whitespace.
  const params = new URLSearchParams({
    select: target.selectCols,
    company_id: `eq.${companyId}`,
    order: 'id',
  })
  // "text" = the word anywhere in the columns the target nominates; a named
  // column = a word inside that one where the target allows it; everything
  // else = the whole value, whitespace and all.
  const word = filterValue.replace(/[*,()]/g, ' ').trim()
  const acrossText = field === 'text' && !!(target.textFilters || []).length
  const byWord = acrossText || ((target.containsFilters || []).includes(field) && filterValue !== '')
  if (acrossText) {
    if (!word) return { error: `Tell me the word to look for — "the Chevron ones" means chevron.` }
    params.append('or', `(${target.textFilters!.map((c) => `${c}.ilike.*${word}*`).join(',')})`)
  } else if (byWord) params.append(field, `ilike.*${word}*`)
  else params.append(field, filterValue === '' ? 'is.null' : `eq.${filterValue}`)
  const rows = await readRecordList(r, `${target.table}?${params}&limit=${BULK_MAX + 1}`)

  if (!rows.length) {
    if (acrossText) return { error: `No ${target.noun} mentions ${JSON.stringify(word)} — not in the ${target.textFilters!.join(', ')}.` }
    return { error: byWord ? `No ${target.noun} has ${JSON.stringify(filterValue)} anywhere in its ${field}.` : `Nothing has ${field} exactly ${JSON.stringify(filterValue)}. Run a grouped query first to see the real values.` }
  }
  if (rows.length > BULK_MAX) {
    return { error: `That matches more than ${BULK_MAX} rows. Narrow it down — I won't put a change that big behind one button.` }
  }

  const changing = rows.filter((x: any) => String(x[target.field] ?? '') !== String(value))
  if (!changing.length) {
    return { error: `Nothing to do — all ${rows.length} already have that ${target.label}.` }
  }

  const after = String(value)
  const previewRows = changing.map((x: any) => ({
    id: x.id,
    label: target.labelOf(x),
    before: x[target.field] == null || x[target.field] === '' ? '(empty)' : String(x[target.field]),
  }))
  const where = acrossText ? `anything says ${JSON.stringify(word)}` : `${field} ${byWord ? 'contains' : 'is'} ${JSON.stringify(filterValue)}`
  const summary = `Set ${target.label} to "${after}" on ${changing.length} ${changing.length === 1 ? target.noun : target.noun + 's'} where ${where}.`

  const insert = await fetch(`${r.url}/rest/v1/arnie_proposals`, {
    method: 'POST',
    headers: {
      apikey: r.key, Authorization: `Bearer ${r.key}`,
      'Content-Type': 'application/json', Prefer: 'return=representation',
    },
    body: JSON.stringify({
      company_id: companyId,
      created_by: caller.email,
      request_text: `${field}=${JSON.stringify(filterValue)} -> ${after}`,
      target: input.target,
      action: 'bulk_set',
      payload: {
        entity_table: target.table, field: target.field, value,
        filter_field: field, filter_value: filterValue,
        // Every row is pinned at draft time. Apply does NOT re-run the filter:
        // if the data shifted, the approval should fail, not silently cover a
        // different set of rows than the one that was shown.
        entity_ids: changing.map((x: any) => x.id),
      },
      summary,
      before_value: changing.map((x: any) => ({ id: x.id, before: x[target.field] ?? null })),
      after_value: after,
      status: 'pending',
    }),
  })
  if (!insert.ok) return { error: `Couldn't save that proposal: ${await insert.text()}` }

  return {
    proposal: (await insert.json())?.[0],
    preview: {
      kind: 'bulk',
      label: target.label,
      field: target.field,
      filter: acrossText ? `mentions ${JSON.stringify(word)}` : `${field} ${byWord ? 'contains' : '='} ${JSON.stringify(filterValue)}`,
      after,
      rows: previewRows,
    },
  }
}

export async function applyBulkProposal(
  r: Rest, companyId: number, prop: any,
): Promise<{ ok: true; changed: number } | { ok: false; error: string; stale?: boolean }> {
  const target = BULK_TARGETS[prop.target]
  if (!target) return { ok: false, error: 'Unknown bulk target.' }
  const { entity_ids: ids, field, value } = prop.payload || {}
  if (!Array.isArray(ids) || !ids.length || !field) {
    return { ok: false, error: 'That proposal is missing its rows.' }
  }

  const before: Record<string, any> = {}
  for (const b of prop.before_value || []) before[String(b.id)] = b.before

  // Re-read the exact rows that were shown and confirm none moved. A bulk
  // approval is consent to a specific list in a specific state; if any one of
  // them changed, the whole thing is refused rather than partly applied.
  const rows = await readRecordList(r,
    `${target.table}?select=id,${field}&company_id=eq.${companyId}&id=in.(${ids.join(',')})`)
  if (rows.length !== ids.length) {
    return { ok: false, stale: true, error: `${ids.length - rows.length} of those rows are gone. Ask me to redraft it.` }
  }
  for (const row of rows) {
    if (String(row[field] ?? '') !== String(before[String(row.id)] ?? '')) {
      return { ok: false, stale: true, error: `One ${target.noun} (#${row.id}) changed since I drafted this, so I stopped. Nothing was written — ask me again and I'll redraft it.` }
    }
  }

  for (const id of ids) {
    const res = await patchRow(r, target.table, companyId, id, { [field]: value })
    if (!res.ok) return { ok: false, error: `Stopped partway: #${id} failed (${res.error}). Roll this back.` }
  }
  return { ok: true, changed: ids.length }
}

export async function rollbackBulkProposal(
  r: Rest, companyId: number, prop: any,
): Promise<{ ok: true; restored: number } | { ok: false; error: string }> {
  const target = BULK_TARGETS[prop.target]
  if (!target) return { ok: false, error: 'Unknown bulk target.' }
  const { field } = prop.payload || {}
  const before = prop.before_value || []
  if (!field || !Array.isArray(before)) return { ok: false, error: 'That proposal is missing its previous values.' }
  for (const b of before) {
    const res = await patchRow(r, target.table, companyId, b.id, { [field]: b.before })
    if (!res.ok) return { ok: false, error: `Restore stopped at #${b.id}: ${res.error}` }
  }
  return { ok: true, restored: before.length }
}
