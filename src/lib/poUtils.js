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

// ── Bundle expansion for PO creation ─────────────────────────────────
// When a product has no catalog cost it's a bundle whose price is the
// sum of its components. For PO purposes each component becomes its own
// PO line (the vendor ships the parts, not an abstract bundle name).
//
// Returns an array of "order items":
//   { productId, name, description, unitCost, quantity, vendorId }
//
// If the product has a direct cost, returns a single-element array
// (the normal case). If it has components, expands them. If it has
// neither, returns one row with unitCost=0 so the PO line is at least
// created and the buyer can fill in the price manually.
export async function expandProductForPO(productId, bundleQty, companyId) {
  if (!productId) return []

  const { data: prod } = await supabase
    .from('products_services')
    .select('id, name, cost, vendor_sku, default_vendor_id')
    .eq('id', productId)
    .maybeSingle()
  if (!prod) return []

  const directCost = parseFloat(prod.cost)

  // Case A: product has a direct catalog cost — order as-is
  if (directCost > 0) {
    const desc = prod.vendor_sku ? `${prod.name} (${prod.vendor_sku})` : prod.name
    return [{
      productId: prod.id,
      name: prod.name,
      description: desc,
      unitCost: directCost,
      quantity: bundleQty,
      vendorId: prod.default_vendor_id || null,
      isComponent: false,
      bundleParentName: null,
    }]
  }

  // Case B: no direct cost — look for bundle components
  const { data: comps } = await supabase
    .from('product_components')
    .select('quantity, component:products_services!component_product_id(id, name, cost, vendor_sku, default_vendor_id)')
    .eq('parent_product_id', prod.id)
    .eq('company_id', companyId)

  if (comps && comps.length > 0) {
    return comps.map(c => {
      const comp = c.component || {}
      const compQty = (parseFloat(c.quantity) || 1) * bundleQty
      const compCost = parseFloat(comp.cost) || 0
      const desc = comp.vendor_sku ? `${comp.name} (${comp.vendor_sku})` : comp.name
      return {
        productId: comp.id,
        name: comp.name,
        description: `${desc} [for ${prod.name}]`,
        unitCost: compCost,
        quantity: compQty,
        vendorId: comp.default_vendor_id || prod.default_vendor_id || null,
        isComponent: true,
        bundleParentName: prod.name,
      }
    })
  }

  // Case C: no cost, no components — create a $0 PO line as a placeholder
  const desc = prod.vendor_sku ? `${prod.name} (${prod.vendor_sku})` : prod.name
  return [{
    productId: prod.id,
    name: prod.name,
    description: desc,
    unitCost: 0,
    quantity: bundleQty,
    vendorId: prod.default_vendor_id || null,
    isComponent: false,
    bundleParentName: null,
  }]
}

// ───────────────────────────────────────────────────────────────────────────
// Who a purchase order is actually addressed to.
//
// Alayda, 9/10 urgency: POs going out to "Maverick Lighting", a vendor with no
// products behind it. The PO builder was doing exactly what it was told —
// grouping on products_services.default_vendor_id — and 31 products genuinely
// point at that vendor. What made it invisible is that the vendor is
// active=false, so it appears in NO picker anywhere in the app. Nobody could
// see the assignment, nobody could pick that vendor, and POs kept arriving
// under its name.
//
// (A manufacturer is not a vendor. Those products are made by MES and bought
// through a distributor; MES-made stock here is spread across three different
// vendors. Diagnosing this from the manufacturer column leads nowhere.)
//
// The sibling trap: unassigned items were falling back to `vendors[0]` — the
// alphabetically first ACTIVE vendor — so a product with no vendor silently
// became an order to whoever sorts first. Also a PO nobody chose.
//
// So both are refused rather than guessed. An order addressed to a vendor
// nobody picked is worse than no order: it is a real document, sent to a real
// company, for real money.

export const VENDOR_PROBLEM = {
  NONE: 'no_vendor',
  INACTIVE: 'inactive_vendor',
  UNKNOWN: 'unknown_vendor',
}

/** Can this item be ordered, and from whom? */
export function resolveOrderVendor(vendorId, vendorsById) {
  if (!vendorId) return { vendorId: null, problem: VENDOR_PROBLEM.NONE, vendorName: null }
  const v = vendorsById?.[vendorId]
  if (!v) return { vendorId: null, problem: VENDOR_PROBLEM.UNKNOWN, vendorName: null }
  if (v.active === false) return { vendorId: null, problem: VENDOR_PROBLEM.INACTIVE, vendorName: v.name }
  return { vendorId, problem: null, vendorName: v.name }
}

/**
 * Split order items into per-vendor groups, holding back anything that cannot
 * be addressed. `vendors` is the tenant's FULL vendor list including inactive
 * ones — the guard needs to see a deactivated vendor to name it, and every
 * picker in the app filters those out.
 *
 * Returns { groups: Map<vendorId, item[]>, blocked: [{ item, problem, vendorName }] }
 */
export function partitionByVendor(items, vendors) {
  const byId = {}
  for (const v of vendors || []) if (v && v.id != null) byId[v.id] = v

  const groups = new Map()
  const blocked = []
  for (const item of items || []) {
    const r = resolveOrderVendor(item?.vendorId, byId)
    if (r.problem) { blocked.push({ item, problem: r.problem, vendorName: r.vendorName }); continue }
    if (!groups.has(r.vendorId)) groups.set(r.vendorId, [])
    groups.get(r.vendorId).push(item)
  }
  return { groups, blocked }
}

/** One line a human can act on, naming the products and what is wrong. */
export function describeBlockedVendors(blocked) {
  if (!blocked?.length) return ''
  const byReason = new Map()
  for (const b of blocked) {
    const key = b.problem === VENDOR_PROBLEM.INACTIVE
      ? `their vendor "${b.vendorName}" is deactivated`
      : b.problem === VENDOR_PROBLEM.UNKNOWN
        ? 'their vendor no longer exists'
        : 'they have no vendor set'
    if (!byReason.has(key)) byReason.set(key, new Set())
    byReason.get(key).add(b.item?.name || b.item?.description || `product ${b.item?.productId}`)
  }
  return [...byReason.entries()]
    .map(([reason, names]) => {
      const list = [...names]
      const shown = list.slice(0, 4).join(', ')
      const more = list.length > 4 ? ` and ${list.length - 4} more` : ''
      return `${list.length} item(s) cannot be ordered because ${reason}: ${shown}${more}`
    })
    .join('\n')
}
