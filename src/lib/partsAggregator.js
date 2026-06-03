// Aggregation helper for the Procurement Queue.
//
// Reads every job in parts_status='needs_order' for a company, sums
// per-product quantities across all contributing job_lines, and groups
// the result by vendor. Used by /procurement to render the bulk-PO
// creation page.

import { supabase } from './supabase'

// Returns:
// {
//   jobs: [{ id, job_id, job_title, customer_name, start_date }, ...],
//   groups: [{
//     vendor: { id, name } | null,   // null = no default vendor on product
//     items: [{
//       product: { id, name, item_id, cost, vendor_sku, default_vendor_id },
//       totalNeed: number,                  // summed across contributing jobs
//       totalAvailable: number,             // inventory.quantity - allocated_qty
//       toOrder: number,                    // max(0, totalNeed - totalAvailable)
//       jobContributions: [{ jobLineId, jobId, jobLabel, qty }, ...]
//     }, ...]
//   }, ...]
// }
export async function aggregateNeedsOrder(companyId) {
  // 1) All jobs in needs_order status
  const { data: jobs } = await supabase
    .from('jobs')
    .select('id, job_id, job_title, customer_name, start_date, parts_status')
    .eq('company_id', companyId)
    .eq('parts_status', 'needs_order')
    .order('start_date', { ascending: true, nullsLast: true })
  if (!jobs || jobs.length === 0) return { jobs: [], groups: [] }

  const jobIds = jobs.map(j => j.id)

  // 2) job_lines for those jobs (only parts-bearing, only unfulfilled)
  const { data: jl } = await supabase
    .from('job_lines')
    .select('id, job_id, item_id, item_name, description, quantity, allocated_qty, po_line_id')
    .in('job_id', jobIds)
  const candidates = (jl || []).filter(l => {
    if (!l.item_id) return false               // labor-only
    if (l.po_line_id) return false             // already on a PO
    const need = (parseFloat(l.quantity) || 0) - (parseFloat(l.allocated_qty) || 0)
    return need > 0
  })
  if (candidates.length === 0) return { jobs, groups: [] }

  // 3) Resolve product + vendor info for each unique product
  const productIds = [...new Set(candidates.map(c => c.item_id))]
  const { data: products } = await supabase
    .from('products_services')
    .select('id, item_id, name, cost, vendor_sku, default_vendor_id, vendor:vendors(id, name)')
    .in('id', productIds)
  const productMap = new Map((products || []).map(p => [p.id, p]))

  // 4) Inventory levels for the same products
  const { data: inv } = await supabase
    .from('inventory')
    .select('product_id, quantity, allocated_qty')
    .eq('company_id', companyId)
    .in('product_id', productIds)
  const invMap = new Map((inv || []).map(r => [
    r.product_id,
    Math.max(0, (parseFloat(r.quantity) || 0) - (parseFloat(r.allocated_qty) || 0)),
  ]))

  const jobMap = new Map(jobs.map(j => [j.id, j]))

  // 5) Group lines by product, sum quantities
  const byProduct = new Map()
  for (const l of candidates) {
    if (!byProduct.has(l.item_id)) {
      const product = productMap.get(l.item_id)
      byProduct.set(l.item_id, {
        product: product ? {
          id: product.id, name: product.name, item_id: product.item_id,
          cost: parseFloat(product.cost) || 0,
          vendor_sku: product.vendor_sku,
          default_vendor_id: product.default_vendor_id,
          vendor: product.vendor || null,
        } : { id: l.item_id, name: l.item_name || l.description || `Item ${l.item_id}`, cost: 0, vendor_sku: null, default_vendor_id: null, vendor: null },
        totalNeed: 0,
        totalAvailable: invMap.get(l.item_id) || 0,
        toOrder: 0,
        jobContributions: [],
      })
    }
    const slot = byProduct.get(l.item_id)
    const need = (parseFloat(l.quantity) || 0) - (parseFloat(l.allocated_qty) || 0)
    slot.totalNeed += need
    const job = jobMap.get(l.job_id)
    slot.jobContributions.push({
      jobLineId: l.id,
      jobId: l.job_id,
      jobLabel: job ? `${job.job_id} ${job.customer_name || job.job_title || ''}`.trim() : `Job ${l.job_id}`,
      qty: need,
    })
  }
  // Compute toOrder per item
  for (const slot of byProduct.values()) {
    slot.toOrder = Math.max(0, slot.totalNeed - slot.totalAvailable)
  }

  // 6) Group by vendor
  const byVendor = new Map()  // vendorId | 'no-vendor' → { vendor, items: [] }
  for (const slot of byProduct.values()) {
    const key = slot.product.default_vendor_id ? String(slot.product.default_vendor_id) : 'no-vendor'
    if (!byVendor.has(key)) {
      byVendor.set(key, {
        vendor: slot.product.vendor || null,
        items: [],
      })
    }
    byVendor.get(key).items.push(slot)
  }

  // Sort each vendor's items by name, then sort vendors so no-vendor lands last
  const groups = []
  for (const [key, group] of byVendor.entries()) {
    group.items.sort((a, b) => a.product.name.localeCompare(b.product.name))
    groups.push({ ...group, key })
  }
  groups.sort((a, b) => {
    if (a.key === 'no-vendor') return 1
    if (b.key === 'no-vendor') return -1
    return (a.vendor?.name || '').localeCompare(b.vendor?.name || '')
  })

  return { jobs, groups }
}
