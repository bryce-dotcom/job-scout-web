// What Dougie read on a receipt → the columns an expenses row takes. ONE rule
// for the phone (src/lib/receiptReader.js re-exports it) and for the server's
// re-read of receipts the phone lost (receipt-reread), so the two cannot fill
// a row differently.

export type ExpenseCategory = { name: string; type?: string; default_tax_category?: string | null }

const num = (v: unknown): number | null => { const n = parseFloat(v as string); return Number.isFinite(n) ? n : null }

/** Pure: what Dougie read → the fields an expenses row takes. */
export function expenseFieldsFromReceipt(extracted: any, categories: ExpenseCategory[] = []): Record<string, any> {
  if (!extracted) return {}
  const cat = extracted.category
    ? (categories.find(c => c.name === extracted.category) || categories.find(c => c.name.toLowerCase() === String(extracted.category).toLowerCase()))
    : null
  const amount = num(extracted.amount)
  const out: Record<string, any> = {}
  if (extracted.business_name) out.merchant = String(extracted.business_name).trim()
  if (amount != null && amount > 0) out.amount = Math.round(amount * 100) / 100
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(extracted.date || ''))) out.date = extracted.date
  if (extracted.description) out.description = String(extracted.description).trim()
  if (extracted.receipt_number) out.receipt = String(extracted.receipt_number).trim()
  if (cat) {
    out.category = cat.name
    if (cat.default_tax_category) out.tax_category = cat.default_tax_category
  }
  if (Array.isArray(extracted.line_items) && extracted.line_items.length) {
    out.line_items = extracted.line_items
      .filter((li: any) => li && (li.description || li.amount != null))
      .slice(0, 25)
      .map((li: any) => ({ description: String(li.description || '').trim(), quantity: num(li.quantity), amount: num(li.amount) }))
  }
  if (extracted.job_hint) out.job_hint = String(extracted.job_hint).trim()
  return out
}

// The words a row carries when nothing was read: the job page and Field Scout
// write the first, the pre-2026-10-04 flow wrote the second.
export const UNREAD_DESCRIPTION = 'Receipt — Dougie could not read it, add the amount'
const PLACEHOLDER = /^Receipt( capture|\s*—\s*Dougie could not read it)/i

/**
 * Pure: the patch a later read makes to a receipt row still at $0. Only what
 * is still missing — a person's typing is never overwritten. A row that was
 * never read at all (its description is the placeholder) also takes the
 * receipt's own date and words: the date it carries is only the day the
 * photo was uploaded. {} when the read found no amount — nothing to fix yet.
 */
export function rereadPatch(row: any, fields: Record<string, any>): Record<string, any> {
  if (!(fields?.amount > 0)) return {}
  const unread = PLACEHOLDER.test(String(row?.description || '').trim()) || !String(row?.description || '').trim()
  const out: Record<string, any> = { amount: fields.amount }
  if (fields.merchant && !row?.merchant) out.merchant = fields.merchant
  if (fields.merchant && !row?.vendor) out.vendor = fields.merchant
  if (fields.receipt && !row?.receipt) out.receipt = fields.receipt
  if (fields.date && unread) out.date = fields.date
  if (fields.description && unread) out.description = fields.description
  if (fields.category && (!row?.category || unread)) out.category = fields.category
  if (fields.tax_category && !row?.tax_category) out.tax_category = fields.tax_category
  return out
}
