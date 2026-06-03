// Receiving logic for the PO module.
//
// One central place that:
//   1. Distributes received qty across the job_lines a PO line was
//      intended to fulfill (oldest-scheduled-job first by default)
//   2. Increments inventory.quantity AND inventory.allocated_qty by
//      the received amount (parts arrive AND are immediately
//      reserved for the jobs that ordered them — the office hasn't
//      done any work yet, but the parts are spoken for)
//   3. Updates job_lines.allocated_qty for each receiving job
//   4. Recomputes the PO status (received vs partial_received)
//   5. Recomputes each linked job's parts_status
//
// All operations run sequentially against Supabase via the service
// role isn't an option here (client side), so we batch + best-effort.
// Failure mid-way is partially-recoverable because:
//   - po_receipts + po_receipt_lines rows are the source of truth
//     for "what arrived" — they'd be the first thing written
//   - if later increments fail, re-running receive against the same
//     PO line WOULD double-count, so the UI guards via the
//     quantity_received column on po_lines (we always cap at
//     remaining unreceived qty).

import { supabase } from './supabase'

// Returns { receiptId, perJobDistribution }
//
// items: [{
//   poLine: { id, product_id, quantity_ordered, quantity_received },
//   receivedQty: number,            // how much arrived for this line
//   distribution: [                 // optional explicit per-job split
//     { jobLineId, jobId, qty }     // if omitted, auto-distribute
//   ],
// }]
export async function receiveShipment({ companyId, po, items, packingSlip, notes, receivedBy }) {
  // 1) Create the receipt header
  const { data: receipt, error: rErr } = await supabase
    .from('po_receipts')
    .insert({
      company_id: companyId,
      po_id: po.id,
      received_at: new Date().toISOString(),
      received_by: receivedBy || null,
      packing_slip_number: packingSlip || null,
      notes: notes || null,
    })
    .select().single()
  if (rErr) throw new Error('Could not create receipt: ' + rErr.message)

  const distributionLog = []

  for (const item of items) {
    if (!item.receivedQty || item.receivedQty <= 0) continue
    const poLine = item.poLine

    // 2) Per-line: po_receipt_lines row, increment po_lines.quantity_received
    await supabase.from('po_receipt_lines').insert({
      company_id: companyId,
      receipt_id: receipt.id,
      po_line_id: poLine.id,
      quantity_received: item.receivedQty,
    })
    await supabase.from('purchase_order_lines').update({
      quantity_received: (parseFloat(poLine.quantity_received) || 0) + item.receivedQty,
      updated_at: new Date().toISOString(),
    }).eq('id', poLine.id)

    // 3) Increment inventory.quantity AND allocated_qty for the product.
    //    If no inventory row exists for this product yet, create one.
    if (poLine.product_id) {
      const { data: invRow } = await supabase
        .from('inventory')
        .select('id, quantity, allocated_qty')
        .eq('company_id', companyId)
        .eq('product_id', poLine.product_id)
        .maybeSingle()
      if (invRow) {
        await supabase.from('inventory').update({
          quantity: (parseFloat(invRow.quantity) || 0) + item.receivedQty,
          allocated_qty: (parseFloat(invRow.allocated_qty) || 0) + item.receivedQty,
          last_updated: new Date().toISOString(),
        }).eq('id', invRow.id)
      } else {
        // Fetch the product's name so the new inventory row is labeled
        const { data: prod } = await supabase
          .from('products_services')
          .select('name, item_id')
          .eq('id', poLine.product_id).maybeSingle()
        await supabase.from('inventory').insert({
          company_id: companyId,
          product_id: poLine.product_id,
          item_id: prod?.item_id || null,
          name: prod?.name || 'Received item',
          quantity: item.receivedQty,
          allocated_qty: item.receivedQty,
          inventory_type: 'Material',
        })
      }
    }

    // 4) Distribute receivedQty across linked job_lines
    const dist = item.distribution || (await autoDistribute(poLine.id, item.receivedQty))
    for (const d of dist) {
      if (!d.qty || d.qty <= 0) continue
      const { data: jl } = await supabase
        .from('job_lines').select('id, allocated_qty').eq('id', d.jobLineId).maybeSingle()
      if (jl) {
        await supabase.from('job_lines').update({
          allocated_qty: (parseFloat(jl.allocated_qty) || 0) + d.qty,
          updated_at: new Date().toISOString(),
        }).eq('id', jl.id)
        distributionLog.push({ jobId: d.jobId, jobLineId: d.jobLineId, qty: d.qty, poLineId: poLine.id })
      }
    }
  }

  // 5) PO status: compare total ordered vs received across all lines
  const { data: freshLines } = await supabase
    .from('purchase_order_lines')
    .select('quantity_ordered, quantity_received')
    .eq('po_id', po.id)
  const totalOrdered = (freshLines || []).reduce((s, l) => s + (parseFloat(l.quantity_ordered) || 0), 0)
  const totalReceived = (freshLines || []).reduce((s, l) => s + (parseFloat(l.quantity_received) || 0), 0)
  const newStatus = totalReceived >= totalOrdered - 0.001 ? 'received' : 'partial_received'
  await supabase.from('purchase_orders').update({
    status: newStatus,
    received_at: newStatus === 'received' ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq('id', po.id)

  // 6) Recompute parts_status for each affected job
  const touchedJobIds = [...new Set(distributionLog.map(d => d.jobId))]
  for (const jobId of touchedJobIds) {
    await recomputeJobPartsStatus(jobId)
  }

  return { receiptId: receipt.id, distribution: distributionLog, newStatus }
}

// Auto-distribute received qty across job_lines linked to this PO line.
// Default policy: oldest-scheduled-job first (start_date asc, nulls last),
// then by job id. Each job_line gets up to its requested qty until the
// received pool is exhausted.
export async function autoDistribute(poLineId, receivedQty) {
  const { data: links } = await supabase
    .from('purchase_order_line_jobs')
    .select('id, job_line_id, job_id, quantity, job_lines(allocated_qty, quantity), jobs(start_date)')
    .eq('po_line_id', poLineId)
  if (!links || links.length === 0) return []

  // Sort by job.start_date asc, nulls last
  const sorted = [...links].sort((a, b) => {
    const ad = a.jobs?.start_date
    const bd = b.jobs?.start_date
    if (!ad && !bd) return a.job_id - b.job_id
    if (!ad) return 1
    if (!bd) return -1
    return new Date(ad) - new Date(bd)
  })

  let remaining = receivedQty
  const out = []
  for (const link of sorted) {
    if (remaining <= 0) break
    // How much does this job still need? (requested - already allocated)
    const requested = parseFloat(link.quantity) || 0
    const alreadyAllocated = parseFloat(link.job_lines?.allocated_qty) || 0
    const needed = Math.max(0, requested - alreadyAllocated)
    const give = Math.min(needed, remaining)
    if (give > 0) {
      out.push({ jobLineId: link.job_line_id, jobId: link.job_id, qty: give })
      remaining -= give
    }
  }
  return out
}

// Recompute jobs.parts_status from its job_lines + PO links state.
//   - if no parts on this job → 'not_needed'
//   - all job_lines fully consumed → 'consumed'
//   - all job_lines fully allocated → 'allocated'
//   - some lines on order (po_line_id set, less than requested allocated) → 'ordered' or 'partial_received'
//   - some lines need more than what's allocated → 'needs_order' (if no PO exists yet)
export async function recomputeJobPartsStatus(jobId) {
  const { data: jl } = await supabase
    .from('job_lines')
    .select('id, quantity, allocated_qty, consumed_qty, po_line_id, item_id')
    .eq('job_id', jobId)
  if (!jl || jl.length === 0) {
    await supabase.from('jobs').update({ parts_status: 'not_needed' }).eq('id', jobId)
    return 'not_needed'
  }

  // Only consider lines that reference a product (item_id) — labor-only
  // lines don't move parts status.
  const partsLines = jl.filter(l => l.item_id)
  if (partsLines.length === 0) {
    await supabase.from('jobs').update({ parts_status: 'not_needed' }).eq('id', jobId)
    return 'not_needed'
  }

  let totalRequested = 0
  let totalAllocated = 0
  let totalConsumed = 0
  let anyOnOrder = false
  let anyShort = false

  // Pre-fetch which po_lines exist for these and their receive state
  const poLineIds = partsLines.map(l => l.po_line_id).filter(Boolean)
  let poLineState = {}
  if (poLineIds.length > 0) {
    const { data: pls } = await supabase
      .from('purchase_order_lines')
      .select('id, quantity_ordered, quantity_received, po_id, purchase_orders(status)')
      .in('id', poLineIds)
    for (const pl of pls || []) {
      poLineState[pl.id] = pl
    }
  }

  for (const line of partsLines) {
    const qty = parseFloat(line.quantity) || 0
    const alloc = parseFloat(line.allocated_qty) || 0
    const cons = parseFloat(line.consumed_qty) || 0
    totalRequested += qty
    totalAllocated += alloc
    totalConsumed += cons
    if (line.po_line_id) {
      const pl = poLineState[line.po_line_id]
      if (pl && pl.purchase_orders?.status === 'sent') anyOnOrder = true
      if (pl && pl.purchase_orders?.status === 'partial_received') anyOnOrder = true
    }
    if (alloc < qty) {
      // Need more parts than allocated. Either still on order, or needs ordering.
      if (!line.po_line_id) anyShort = true
    }
  }

  let next = 'not_needed'
  if (totalConsumed >= totalRequested - 0.001 && totalRequested > 0) next = 'consumed'
  else if (totalAllocated >= totalRequested - 0.001) next = 'allocated'
  else if (anyOnOrder) {
    // Anything partially received yet?
    const anyPartial = Object.values(poLineState).some(pl =>
      pl.quantity_received > 0 && pl.quantity_received < pl.quantity_ordered)
    next = anyPartial ? 'partial_received' : 'ordered'
  }
  else if (anyShort) next = 'needs_order'
  else next = 'in_stock'  // everything covered by stock already, no PO needed

  await supabase.from('jobs').update({
    parts_status: next,
    updated_at: new Date().toISOString(),
  }).eq('id', jobId)
  return next
}
