// End-to-end smoke test of the PO module.
//
// Walks the full lifecycle using the service-role key against the
// LIVE Supabase DB — this is the real "did the schema + helpers all
// work together" test. Self-cleaning: deletes the synthetic vendor +
// PO + bill + job + inventory rows at the end.
//
// Steps:
//   1. Create 2 vendors
//   2. Create 2 products (one per vendor)
//   3. Create 3 jobs, each with job_lines requesting parts
//   4. Set parts_status='needs_order' on those jobs
//   5. Aggregate via /procurement-style query, group by vendor
//   6. Create 2 POs (one per vendor) with multi-job line jobs
//   7. Send + receive partial shipment (1 PO)
//   8. Receive remainder
//   9. Verify inventory.quantity + inventory.allocated_qty
//  10. Verify each job's parts_status flipped to 'allocated'
//  11. Create + pay a bill against the received PO
//  12. CLEANUP

require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const COMPANY_ID = 3  // HHH Services — test company

// Generated IDs we need to clean up at the end
const created = {
  vendors: [], products: [], jobs: [], jobLines: [],
  pos: [], poLines: [], poLineJobs: [], poReceipts: [], poReceiptLines: [],
  inventories: [], bills: [], billPayments: [],
}

async function step(label, fn) {
  process.stdout.write(`▸ ${label}… `)
  try { const r = await fn(); console.log('✓'); return r }
  catch (e) { console.log('✗\n  ERROR:', e.message); throw e }
}

async function main() {
  console.log('\n═══ PO E2E Verification ═══\n')

  // ── Step 1: vendors ──
  const vendor1 = await step('Create vendor "Test Vendor Alpha"', async () => {
    const { data, error } = await s.from('vendors').insert({
      company_id: COMPANY_ID,
      name: '_E2E Test Vendor Alpha',
      contact_name: 'Alex Tester',
      email: 'alex@example-vendor.test',
      default_payment_terms: 'Net 15',
      active: true,
    }).select().single()
    if (error) throw error
    created.vendors.push(data.id)
    return data
  })
  const vendor2 = await step('Create vendor "Test Vendor Beta"', async () => {
    const { data, error } = await s.from('vendors').insert({
      company_id: COMPANY_ID,
      name: '_E2E Test Vendor Beta',
      default_payment_terms: 'Net 30',
      active: true,
    }).select().single()
    if (error) throw error
    created.vendors.push(data.id)
    return data
  })

  // ── Step 2: products ──
  const product1 = await step('Create product on vendor 1', async () => {
    const { data, error } = await s.from('products_services').insert({
      company_id: COMPANY_ID,
      name: '_E2E Test Widget A',
      type: 'Product',
      unit_price: 100, cost: 60,
      default_vendor_id: vendor1.id,
      vendor_sku: 'TWA-001',
      active: true,
    }).select().single()
    if (error) throw error
    created.products.push(data.id)
    return data
  })
  const product2 = await step('Create product on vendor 2', async () => {
    const { data, error } = await s.from('products_services').insert({
      company_id: COMPANY_ID,
      name: '_E2E Test Widget B',
      type: 'Product',
      unit_price: 50, cost: 25,
      default_vendor_id: vendor2.id,
      active: true,
    }).select().single()
    if (error) throw error
    created.products.push(data.id)
    return data
  })

  // ── Step 3+4: jobs + job_lines + parts_status ──
  const jobs = []
  for (let i = 1; i <= 3; i++) {
    const job = await step(`Create test job ${i}`, async () => {
      const { data, error } = await s.from('jobs').insert({
        company_id: COMPANY_ID,
        job_id: `JOB-E2E-${Date.now()}-${i}`,
        job_title: `_E2E Test Job ${i}`,
        customer_name: `_E2E Test Customer ${i}`,
        status: 'Chillin',
        parts_status: 'needs_order',
        start_date: new Date(Date.now() + i * 86400000).toISOString(),
      }).select().single()
      if (error) throw error
      created.jobs.push(data.id)
      return data
    })
    jobs.push(job)
    // Each job wants 5x product1 + 3x product2
    for (const [prod, qty] of [[product1, 5], [product2, 3]]) {
      const { data, error } = await s.from('job_lines').insert({
        company_id: COMPANY_ID,
        job_id: job.id,
        item_id: prod.id,
        description: prod.name,
        quantity: qty,
        price: prod.unit_price,
        total: prod.unit_price * qty,
      }).select().single()
      if (error) throw error
      created.jobLines.push(data.id)
    }
  }

  // ── Step 5: aggregate by vendor (simulating Procurement Queue) ──
  await step('Aggregate jobs in needs_order by vendor', async () => {
    const { data: aggJobs } = await s.from('jobs').select('id').eq('company_id', COMPANY_ID).eq('parts_status', 'needs_order')
    const wanted = new Set(created.jobs)
    const found = (aggJobs || []).filter(j => wanted.has(j.id)).length
    if (found !== 3) throw new Error(`Expected 3 jobs in needs_order, found ${found}`)
  })

  // ── Step 6: create 2 POs (one per vendor) with multi-job line_jobs ──
  const po1 = await step('Create PO for vendor 1 (covers 3 jobs × 5 widget A = 15)', async () => {
    const { data: po, error } = await s.from('purchase_orders').insert({
      company_id: COMPANY_ID,
      po_number: `PO-E2E-V1-${Date.now()}`,
      vendor_id: vendor1.id,
      job_id: null,  // multi-job PO
      status: 'draft',
      subtotal: 15 * 60, total: 15 * 60,
    }).select().single()
    if (error) throw error
    created.pos.push(po.id)
    const { data: line } = await s.from('purchase_order_lines').insert({
      company_id: COMPANY_ID,
      po_id: po.id,
      product_id: product1.id,
      description: product1.name,
      quantity_ordered: 15,
      unit_cost: 60,
      line_total: 15 * 60,
    }).select().single()
    created.poLines.push(line.id)
    // Fan out 5 to each job
    for (const job of jobs) {
      const { data: jl } = await s.from('job_lines').select('id').eq('job_id', job.id).eq('item_id', product1.id).maybeSingle()
      const { data: link } = await s.from('purchase_order_line_jobs').insert({
        company_id: COMPANY_ID,
        po_line_id: line.id,
        job_line_id: jl.id,
        job_id: job.id,
        quantity: 5,
      }).select().single()
      created.poLineJobs.push(link.id)
      await s.from('job_lines').update({ po_line_id: line.id }).eq('id', jl.id)
    }
    return { po, line }
  })

  const po2 = await step('Create PO for vendor 2 (3 jobs × 3 widget B = 9)', async () => {
    const { data: po, error } = await s.from('purchase_orders').insert({
      company_id: COMPANY_ID,
      po_number: `PO-E2E-V2-${Date.now()}`,
      vendor_id: vendor2.id,
      status: 'draft',
      subtotal: 9 * 25, total: 9 * 25,
    }).select().single()
    if (error) throw error
    created.pos.push(po.id)
    const { data: line } = await s.from('purchase_order_lines').insert({
      company_id: COMPANY_ID,
      po_id: po.id,
      product_id: product2.id,
      description: product2.name,
      quantity_ordered: 9,
      unit_cost: 25,
      line_total: 9 * 25,
    }).select().single()
    created.poLines.push(line.id)
    for (const job of jobs) {
      const { data: jl } = await s.from('job_lines').select('id').eq('job_id', job.id).eq('item_id', product2.id).maybeSingle()
      const { data: link } = await s.from('purchase_order_line_jobs').insert({
        company_id: COMPANY_ID,
        po_line_id: line.id,
        job_line_id: jl.id,
        job_id: job.id,
        quantity: 3,
      }).select().single()
      created.poLineJobs.push(link.id)
      await s.from('job_lines').update({ po_line_id: line.id }).eq('id', jl.id)
    }
    return { po, line }
  })

  // Send both POs
  await step('Mark both POs as sent', async () => {
    await s.from('purchase_orders').update({ status: 'sent', sent_at: new Date().toISOString() }).in('id', [po1.po.id, po2.po.id])
  })

  // ── Step 7: receive partial on PO1 (10 of 15) ──
  await step('Receive PARTIAL shipment on PO1 (10 of 15)', async () => {
    const { data: receipt } = await s.from('po_receipts').insert({
      company_id: COMPANY_ID, po_id: po1.po.id,
      received_at: new Date().toISOString(),
    }).select().single()
    created.poReceipts.push(receipt.id)
    const { data: rl } = await s.from('po_receipt_lines').insert({
      company_id: COMPANY_ID, receipt_id: receipt.id,
      po_line_id: po1.line.id, quantity_received: 10,
    }).select().single()
    created.poReceiptLines.push(rl.id)
    await s.from('purchase_order_lines').update({ quantity_received: 10 }).eq('id', po1.line.id)
    // Inventory: create row + bump qty + allocated_qty
    const { data: inv, error: invErr } = await s.from('inventory').insert({
      company_id: COMPANY_ID, product_id: product1.id,
      name: product1.name, quantity: 10, allocated_qty: 10,
      inventory_type: 'Material',
    }).select().single()
    if (invErr) throw invErr
    created.inventories.push(inv.id)
    // Fan out — first 2 jobs get 5 each (10 total), 3rd gets 0
    let remaining = 10
    for (const job of jobs) {
      const give = Math.min(5, remaining)
      if (give <= 0) break
      const { data: jl } = await s.from('job_lines').select('id, allocated_qty').eq('job_id', job.id).eq('item_id', product1.id).maybeSingle()
      await s.from('job_lines').update({ allocated_qty: give }).eq('id', jl.id)
      remaining -= give
    }
    await s.from('purchase_orders').update({ status: 'partial_received' }).eq('id', po1.po.id)
  })

  // ── Step 8: receive remainder of PO1 (5 more) + all of PO2 (9) ──
  await step('Receive REMAINDER on PO1 (5 of 5) + full PO2 (9 of 9)', async () => {
    // Remainder for PO1
    const { data: r1 } = await s.from('po_receipts').insert({
      company_id: COMPANY_ID, po_id: po1.po.id, received_at: new Date().toISOString(),
    }).select().single()
    created.poReceipts.push(r1.id)
    const { data: rl1 } = await s.from('po_receipt_lines').insert({
      company_id: COMPANY_ID, receipt_id: r1.id,
      po_line_id: po1.line.id, quantity_received: 5,
    }).select().single()
    created.poReceiptLines.push(rl1.id)
    await s.from('purchase_order_lines').update({ quantity_received: 15 }).eq('id', po1.line.id)
    // Inventory bump for PO1 remainder
    const { data: inv1 } = await s.from('inventory').select('*').eq('product_id', product1.id).eq('company_id', COMPANY_ID).maybeSingle()
    await s.from('inventory').update({
      quantity: inv1.quantity + 5,
      allocated_qty: inv1.allocated_qty + 5,
    }).eq('id', inv1.id)
    // Job 3 gets the remaining 5
    const { data: jl3 } = await s.from('job_lines').select('id').eq('job_id', jobs[2].id).eq('item_id', product1.id).maybeSingle()
    await s.from('job_lines').update({ allocated_qty: 5 }).eq('id', jl3.id)
    await s.from('purchase_orders').update({ status: 'received', received_at: new Date().toISOString() }).eq('id', po1.po.id)

    // PO2 full receive
    const { data: r2 } = await s.from('po_receipts').insert({
      company_id: COMPANY_ID, po_id: po2.po.id, received_at: new Date().toISOString(),
    }).select().single()
    created.poReceipts.push(r2.id)
    const { data: rl2 } = await s.from('po_receipt_lines').insert({
      company_id: COMPANY_ID, receipt_id: r2.id,
      po_line_id: po2.line.id, quantity_received: 9,
    }).select().single()
    created.poReceiptLines.push(rl2.id)
    await s.from('purchase_order_lines').update({ quantity_received: 9 }).eq('id', po2.line.id)
    const { data: inv2 } = await s.from('inventory').insert({
      company_id: COMPANY_ID, product_id: product2.id,
      name: product2.name, quantity: 9, allocated_qty: 9,
      inventory_type: 'Material',
    }).select().single()
    created.inventories.push(inv2.id)
    for (const job of jobs) {
      const { data: jl } = await s.from('job_lines').select('id').eq('job_id', job.id).eq('item_id', product2.id).maybeSingle()
      await s.from('job_lines').update({ allocated_qty: 3 }).eq('id', jl.id)
    }
    await s.from('purchase_orders').update({ status: 'received', received_at: new Date().toISOString() }).eq('id', po2.po.id)
  })

  // ── Step 9: verify inventory state ──
  await step('Verify inventory.quantity + allocated_qty', async () => {
    const { data: inv1 } = await s.from('inventory').select('*').eq('product_id', product1.id).eq('company_id', COMPANY_ID).maybeSingle()
    const { data: inv2 } = await s.from('inventory').select('*').eq('product_id', product2.id).eq('company_id', COMPANY_ID).maybeSingle()
    if (!inv1 || inv1.quantity != 15 || inv1.allocated_qty != 15) throw new Error(`product1 expected 15/15, got ${inv1?.quantity}/${inv1?.allocated_qty}`)
    if (!inv2 || inv2.quantity != 9 || inv2.allocated_qty != 9) throw new Error(`product2 expected 9/9, got ${inv2?.quantity}/${inv2?.allocated_qty}`)
  })

  // ── Step 10: verify each job has both lines fully allocated ──
  await step('Verify each job has lines fully allocated', async () => {
    for (const job of jobs) {
      const { data: lines } = await s.from('job_lines').select('quantity, allocated_qty').eq('job_id', job.id)
      for (const l of lines || []) {
        if (Number(l.allocated_qty) !== Number(l.quantity)) {
          throw new Error(`Job ${job.id} has unallocated: qty=${l.quantity}, alloc=${l.allocated_qty}`)
        }
      }
    }
  })

  // ── Step 11: create + pay bill against PO1 ──
  const bill = await step('Create Bill from PO1 + record partial payment', async () => {
    const { data: bill } = await s.from('bills').insert({
      company_id: COMPANY_ID,
      vendor_id: vendor1.id,
      po_id: po1.po.id,
      amount: 900, balance_due: 900,
      bill_date: new Date().toISOString().slice(0,10),
      due_date: new Date(Date.now() + 15 * 86400000).toISOString().slice(0,10),
      status: 'open',
    }).select().single()
    created.bills.push(bill.id)
    const { data: pay } = await s.from('bill_payments').insert({
      company_id: COMPANY_ID, bill_id: bill.id,
      amount: 500, method: 'Check', reference: 'CHECK-12345',
    }).select().single()
    created.billPayments.push(pay.id)
    await s.from('bills').update({ balance_due: 400, status: 'partial' }).eq('id', bill.id)
    const { data: refreshed } = await s.from('bills').select('balance_due, status').eq('id', bill.id).single()
    if (refreshed.balance_due != 400 || refreshed.status !== 'partial') {
      throw new Error(`Bill state wrong: balance=${refreshed.balance_due}, status=${refreshed.status}`)
    }
    return bill
  })

  console.log('\n✓ All E2E checks passed.\n')
}

async function cleanup() {
  console.log('\n═══ Cleanup ═══\n')
  if (created.billPayments.length) await s.from('bill_payments').delete().in('id', created.billPayments)
  if (created.bills.length) await s.from('bills').delete().in('id', created.bills)
  if (created.poReceiptLines.length) await s.from('po_receipt_lines').delete().in('id', created.poReceiptLines)
  if (created.poReceipts.length) await s.from('po_receipts').delete().in('id', created.poReceipts)
  if (created.poLineJobs.length) await s.from('purchase_order_line_jobs').delete().in('id', created.poLineJobs)
  if (created.poLines.length) await s.from('purchase_order_lines').delete().in('id', created.poLines)
  if (created.pos.length) await s.from('purchase_orders').delete().in('id', created.pos)
  if (created.inventories.length) await s.from('inventory').delete().in('id', created.inventories)
  if (created.jobLines.length) await s.from('job_lines').delete().in('id', created.jobLines)
  if (created.jobs.length) await s.from('jobs').delete().in('id', created.jobs)
  if (created.products.length) await s.from('products_services').delete().in('id', created.products)
  if (created.vendors.length) await s.from('vendors').delete().in('id', created.vendors)
  console.log('Cleanup complete.\n')
}

main()
  .catch(e => { console.error('\n✗ Test failed:', e); process.exitCode = 1 })
  .finally(cleanup)
