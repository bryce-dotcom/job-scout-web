// Sales tax on invoices.
//
// Company config lives in settings key 'sales_tax':
//   { enabled: bool, rate: percent, jurisdiction: 'Salt Lake County, UT',
//     apply_to: 'all' | 'materials' }
// The tax is computed once, when an invoice's lines are written
// (lib/invoiceLines writeInvoiceLines), and stored on the invoice as
// tax_rate + tax_amount. `amount` stays the pre-tax gross; the customer
// total adds tax_amount (lib/arHelpers.invoiceCustomerTotal), so every
// surface that already reads the total picks it up.

export const SALES_TAX_KEY = 'sales_tax'

const num = (v) => parseFloat(v) || 0
const r2 = (n) => Math.round(n * 100) / 100

export function parseSalesTaxConfig(value) {
  const base = { enabled: false, rate: 0, jurisdiction: '', apply_to: 'all' }
  if (!value) return base
  try {
    const v = typeof value === 'string' ? JSON.parse(value) : value
    const rate = num(v?.rate)
    return {
      enabled: !!v?.enabled && rate > 0,
      rate: rate > 0 ? Math.round(rate * 1000) / 1000 : 0,
      jurisdiction: String(v?.jurisdiction || ''),
      apply_to: v?.apply_to === 'materials' ? 'materials' : 'all',
    }
  } catch {
    return base
  }
}

export function serializeSalesTaxConfig(cfg) {
  return JSON.stringify({ enabled: !!cfg?.enabled, rate: num(cfg?.rate), jurisdiction: cfg?.jurisdiction || '', apply_to: cfg?.apply_to === 'materials' ? 'materials' : 'all' })
}

// Is this line taxable under the config? The line's own flag wins; then
// the product's; a materials-only jurisdiction skips labor lines.
export function lineIsTaxable(line, cfg, product = null) {
  if (line?.taxable === false) return false
  if (product && product.taxable === false) return false
  if (cfg?.apply_to === 'materials') {
    const kind = product?.material_or_labor || line?.material_or_labor || null
    if (kind === 'labor') return false
    if (num(line?.labor_cost) > 0 && !(num(line?.line_total ?? line?.total) > num(line?.labor_cost))) return false
  }
  return true
}

/**
 * @param lines  rows shaped like invoice_lines (line_total) or job/quote lines (total)
 * @returns { rate, taxableSubtotal, tax }
 */
export function computeSalesTax(lines, cfg, productsById = new Map()) {
  const c = cfg?.enabled ? cfg : null
  if (!c || !(c.rate > 0)) return { rate: 0, taxableSubtotal: 0, tax: 0 }
  let taxable = 0
  for (const l of lines || []) {
    const product = l?.item_id != null ? (productsById.get?.(l.item_id) || null) : null
    if (!lineIsTaxable(l, c, product)) continue
    const amt = num(l.line_total ?? l.total ?? (num(l.quantity || 1) * num(l.unit_price ?? l.price)))
    if (amt > 0) taxable += amt
  }
  return { rate: c.rate, taxableSubtotal: r2(taxable), tax: r2(taxable * c.rate / 100) }
}

export const invoiceTaxAmount = (inv) => r2(num(inv?.tax_amount))

/** Sales tax collected vs remitted over a window, from invoices and expenses. */
export function salesTaxSummary({ invoices = [], manualExpenses = [], payments = [] } = {}, inRange = () => true, basis = 'cash') {
  const paidAt = new Map()
  for (const p of payments || []) {
    if (!p.invoice_id) continue
    const d = p.date || p.created_at
    if (!paidAt.has(p.invoice_id) || String(d) > String(paidAt.get(p.invoice_id))) paidAt.set(p.invoice_id, d)
  }
  let collected = 0, invoicesWithTax = 0
  for (const inv of invoices || []) {
    const tax = invoiceTaxAmount(inv)
    if (!(tax > 0)) continue
    const when = basis === 'accrual' ? (inv.invoice_date || inv.created_at) : (inv.payment_status === 'Paid' ? (paidAt.get(inv.id) || inv.updated_at || inv.created_at) : null)
    if (!when || !inRange(when)) continue
    collected += tax; invoicesWithTax += 1
  }
  const remitted = (manualExpenses || [])
    .filter(e => inRange(e.expense_date) && /sales tax/i.test(`${e.description || ''} ${e.vendor || ''} ${e.category?.name || ''}`))
    .reduce((s, e) => s + num(e.amount), 0)
  return { collected: r2(collected), remitted: r2(remitted), owed: r2(collected - remitted), invoicesWithTax }
}
