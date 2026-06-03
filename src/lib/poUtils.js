// Shared helpers for the Purchase Order module.
//
// Centralizes PO-number generation, status labels, totals math so the
// list page / detail page / Procurement Queue all agree on one source.

import { supabase } from './supabase'

// ── Status display ────────────────────────────────────────────────────
export const PO_STATUS_LABELS = {
  draft:             { label: 'Draft',             color: '#7d8a7f', bg: 'rgba(125,138,127,0.15)' },
  sent:              { label: 'Sent to Vendor',    color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  partial_received:  { label: 'Partial Received',  color: '#a16207', bg: 'rgba(234,179,8,0.15)' },
  received:          { label: 'Received',          color: '#16a34a', bg: 'rgba(34,197,94,0.15)' },
  closed:            { label: 'Closed',            color: '#7d8a7f', bg: 'rgba(125,138,127,0.15)' },
  cancelled:         { label: 'Cancelled',         color: '#dc2626', bg: 'rgba(220,38,38,0.12)' },
}

// ── PO number generation ──────────────────────────────────────────────
// Format: PO-YYYY-NNNN per company. Looks up the highest existing PO
// number for the year and increments. Falls back to 0001 if none exist
// yet. Collisions are protected by the (company_id, po_number) UNIQUE
// constraint — if someone races us, retry once with the next number.
export async function generatePoNumber(companyId) {
  const year = new Date().getFullYear()
  const prefix = `PO-${year}-`
  const { data } = await supabase
    .from('purchase_orders')
    .select('po_number')
    .eq('company_id', companyId)
    .like('po_number', `${prefix}%`)
    .order('po_number', { ascending: false })
    .limit(1)
  let next = 1
  if (data && data[0]?.po_number) {
    const tail = data[0].po_number.slice(prefix.length)
    const n = parseInt(tail, 10)
    if (!isNaN(n)) next = n + 1
  }
  return `${prefix}${String(next).padStart(4, '0')}`
}

// ── Totals math ───────────────────────────────────────────────────────
// Recomputes subtotal / tax / total from a set of line rows + the PO's
// tax + shipping inputs. Returns rounded values ready to store.
export function computePoTotals(lines, taxAmount = 0, shippingAmount = 0) {
  const subtotal = (lines || []).reduce(
    (sum, l) => sum + (parseFloat(l.line_total) || (parseFloat(l.quantity_ordered) || 0) * (parseFloat(l.unit_cost) || 0)),
    0
  )
  const tax = parseFloat(taxAmount) || 0
  const shipping = parseFloat(shippingAmount) || 0
  const total = subtotal + tax + shipping
  return {
    subtotal: round2(subtotal),
    tax:      round2(tax),
    shipping: round2(shipping),
    total:    round2(total),
  }
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100
}

export function formatCurrency(amount) {
  if (amount == null || isNaN(amount)) return '$0.00'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}
