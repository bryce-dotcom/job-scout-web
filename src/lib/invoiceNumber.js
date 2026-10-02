// The one place an invoice number is minted.
//
// Christopher (7d03fcec): "Having a simple number instead of a complicated
// alphabetical one would make communicating with clients their invoice numbers
// easier." He was reading INV-MUOH7H6Y — a base-36 Date.now() — down the phone.
//
// It was built inline in EIGHT places (Invoices, JobDetail ×4, FieldScout,
// PMJobSetter, and _shared/estimateConvert), which is why they all had to be
// found before any of them could change. Numbers now come from the database:
// next_invoice_number(company_id) does one atomic UPDATE ... RETURNING, so two
// people invoicing at the same moment cannot be handed the same number. The
// browser cannot do that for itself, and invoices.invoice_id has no unique
// index to catch it if it gets it wrong (it cannot have one — a customer
// invoice and its paired utility invoice share a number on purpose).
//
// Existing numbers are untouched. Nothing was backfilled.

const PREFIX = 'INV'
const DEPOSIT_PREFIX = 'INV-DEP'

/** The legacy shape, kept ONLY as a fallback — see nextInvoiceNumber. */
export function timestampInvoiceNumber({ deposit = false } = {}) {
  return `${deposit ? DEPOSIT_PREFIX : PREFIX}-${Date.now().toString(36).toUpperCase()}`
}

/** Format an allocated sequence number. Deposits keep their marker so the type
 *  is still readable at a glance, and share the one sequence so they can never
 *  collide with a normal invoice. */
export function formatInvoiceNumber(n, { deposit = false } = {}) {
  return `${deposit ? DEPOSIT_PREFIX : PREFIX}-${n}`
}

/**
 * The next invoice number for this company, e.g. 'INV-1001'.
 *
 * Falls back to the old timestamp shape if the allocation fails for any reason.
 * That is deliberate: a numbering hiccup must never be the thing that stops
 * someone invoicing a customer. An ugly number is recoverable; a blocked
 * invoice in the field is not.
 */
export async function nextInvoiceNumber(supabase, companyId, { deposit = false } = {}) {
  try {
    const { data, error } = await supabase.rpc('next_invoice_number', { p_company_id: companyId })
    const n = Number(data)
    if (error || !Number.isFinite(n) || n <= 0) throw error || new Error('no number returned')
    return formatInvoiceNumber(n, { deposit })
  } catch (e) {
    console.warn('[invoiceNumber] sequence unavailable, falling back to timestamp:', e?.message || e)
    return timestampInvoiceNumber({ deposit })
  }
}
