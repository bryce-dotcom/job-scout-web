// Aggregation helper for the Procurement Queue.
//
// Derives the order queue directly from job_line state — does NOT rely
// on jobs.parts_status, which can go stale when lines are added without
// going through a PO action. This makes the queue self-consistent with
// reality at all times.
//
// Active jobs = any status except Archived/Cancelled/Completed/Verified*
// (* completed jobs with leftover unordered lines are excluded on purpose
//    — if a job is done, don't order more parts for it).

import { supabase } from './supabase'

const EXCLUDED_STATUSES = ['Archived', 'Cancelled', 'Completed', 'Complete', 'Verified', 'Verified Complete']

// Returns:
// {
//   jobs: [{ id, job_id, job_title, customer_name, start_date }, ...],
//   groups: [{
//     vendor: { id, name } | null,
//     items: [{
//       product: { id, name, item_id, cost, vendor_sku, default_vendor_id },
//       totalNeed: number,
//       totalAvailable: number,
//       toOrder: number,
//       jobContributions: [{ jobLineId, jobId, jobLabel, jobName, qty }, ...]
//     }, ...]
//   }, ...]
// }
export async function aggregateNeedsOrder(companyId) {
  // 1) All job_lines with a product that are not yet on a PO
  const { data: candidates } = await supabase
    .from('job_lines')
    .select('id, job_id, item_id, item_name, description, quantity, allocated_qty, po_line_id')
    .not('item_id', 'is', null)
    .is('po_line_id', null)

  const unfulfilled = (candidates || []).filter(l => {
    const need = (parseFloat(l.quantity) || 0) - (parseFloat(l.allocated_qty) || 0)
    return need > 0
  })
  if (unfulfilled.length === 0) return { jobs: [], groups: [] }

  // 2) Fetch the jobs those lines belong to, filtering out terminal statuses
  const jobIds = [...new Set(unfulfilled.map(l => l.job_id))]
  const { data: jobRows } = await supabase
    .from('jobs')
    .select('id, job_id, job_title, customer_name, start_date, status, parts_status')
    .in('id', jobIds)
    .eq('parts_status', 'needs_order')
    .not('status', 'in', `(${EXCLUDED_STATUSES.map(s => `"${s}"`).join(',')})`)
    .order('start_date', { ascending: true, nullsLast: true })

  if (!jobRows || jobRows.length === 0) return { jobs: [], groups: [] }

  const jobMap = new Map(jobRows.map(j => [j.id, j]))

  // Keep only lines whose job is still active
  const activeLines = unfulfilled.filter(l => jobMap.has(l.job_id))
  if (activeLines.length === 0) return { jobs: jobRows, groups: [] }

  // 3) Product + vendor info for all referenced products
  const productIds = [...new Set(activeLines.map(l => l.item_id))]
  const { data: products } = await supabase
    .from('products_services')
    .select('id, item_id, name, cost, vendor_sku, default_vendor_id, vendor:vendors(id, name)')
    .in('id', productIds)
  const productMap = new Map((products || []).map(p => [p.id, p]))

  // 4) Inventory levels
  const { data: inv } = await supabase
    .from('inventory')
    .select('product_id, quantity, allocated_qty')
    .eq('company_id', companyId)
    .in('product_id', productIds)
  const invMap = new Map((inv || []).map(r => [
    r.product_id,
    Math.max(0, (parseFloat(r.quantity) || 0) - (parseFloat(r.allocated_qty) || 0)),
  ]))

  // 5) Group lines by product, accumulate need + job contributions
  const byProduct = new Map()
  for (const l of activeLines) {
    if (!byProduct.has(l.item_id)) {
      const product = productMap.get(l.item_id)
      byProduct.set(l.item_id, {
        product: product ? {
          id: product.id, name: product.name, item_id: product.item_id,
          cost: parseFloat(product.cost) || 0,
          vendor_sku: product.vendor_sku,
          default_vendor_id: product.default_vendor_id,
          vendor: product.vendor || null,
        } : {
          id: l.item_id, name: l.item_name || l.description || `Item ${l.item_id}`,
          cost: 0, vendor_sku: null, default_vendor_id: null, vendor: null,
        },
        totalNeed: 0,
        totalAvailable: invMap.get(l.item_id) || 0,
        toOrder: 0,
        jobContributions: [],
      })
    }
    const slot = byProduct.get(l.item_id)
    const need = (parseFloat(l.quantity) || 0) - (parseFloat(l.allocated_qty) || 0)
    slot.totalNeed += need
    const job = jobMap.get(l.job_id) || {}
    // jobName: customer name is most recognisable for procurement staff
    const jobName = job.customer_name || job.job_title || job.job_id || `Job ${l.job_id}`
    slot.jobContributions.push({
      jobLineId: l.id,
      jobId: l.job_id,
      jobLabel: `${job.job_id || ''} ${jobName}`.trim(),
      jobName,  // clean name without ID — used in the card header
      qty: need,
    })
  }
  for (const slot of byProduct.values()) {
    slot.toOrder = Math.max(0, slot.totalNeed - slot.totalAvailable)
  }

  // 6) Group by vendor
  const byVendor = new Map()
  for (const slot of byProduct.values()) {
    const key = slot.product.default_vendor_id ? String(slot.product.default_vendor_id) : 'no-vendor'
    if (!byVendor.has(key)) byVendor.set(key, { vendor: slot.product.vendor || null, items: [] })
    byVendor.get(key).items.push(slot)
  }

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

  return { jobs: jobRows, groups }
}
