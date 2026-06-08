// Parts tab for the Job detail page. Shows parts_status, lists job_lines
// with their stock state, and exposes the three core actions:
//   - Allocate from Stock (no PO needed; reserve already-on-hand stock)
//   - Generate PO         (create a draft PO with the missing-stock lines)
//   - Consume on Complete (decrement inventory by allocated qty)
//
// All operations route through src/lib/poReceive.js + a few inline
// helpers so the inventory + parts_status state machine stays in one
// place. Idempotent — clicking Allocate twice doesn't double-allocate.

import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import { Package, Truck, CheckCircle, AlertCircle, Plus, ShoppingCart } from 'lucide-react'
import { recomputeJobPartsStatus } from '../lib/poReceive'
import { generatePoNumber, expandProductForPO } from '../lib/poUtils'

const PARTS_STATUS_LABELS = {
  not_needed:        { label: 'No Parts',          color: '#7d8a7f', bg: 'rgba(125,138,127,0.12)' },
  in_stock:          { label: 'In Stock',          color: '#16a34a', bg: 'rgba(34,197,94,0.12)' },
  needs_order:       { label: 'Needs Order',       color: '#ea580c', bg: 'rgba(234,88,12,0.12)' },
  ordered:           { label: 'On Order',          color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  partial_received:  { label: 'Partial Received',  color: '#a16207', bg: 'rgba(234,179,8,0.15)' },
  received:          { label: 'Received',          color: '#16a34a', bg: 'rgba(34,197,94,0.15)' },
  allocated:         { label: 'Allocated',         color: '#7c3aed', bg: 'rgba(124,58,237,0.12)' },
  consumed:          { label: 'Consumed',          color: '#7d8a7f', bg: 'rgba(125,138,127,0.20)' },
}

export default function JobPartsTab({ job, theme, companyId, onChange }) {
  const navigate = useNavigate()
  const [lines, setLines] = useState([])
  const [stockMap, setStockMap] = useState({}) // product_id → { quantity, allocated_qty }
  const [poLineMap, setPoLineMap] = useState({}) // po_line_id → { po_id, po_number, status }
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)

  useEffect(() => {
    if (job?.id) fetchAll()
  }, [job?.id])

  const fetchAll = async () => {
    setLoading(true)
    // 1) job_lines for this job (with current allocated/consumed/po_line_id)
    const { data: jl } = await supabase
      .from('job_lines')
      .select('id, item_id, item_name, description, quantity, allocated_qty, consumed_qty, po_line_id, item:products_services(id, name, default_vendor_id)')
      .eq('job_id', job.id)
      .order('id')
    const safeLines = (jl || []).filter(l => l.item_id) // only parts-bearing lines
    setLines(safeLines)

    // 2) Inventory levels for the items referenced
    const productIds = [...new Set(safeLines.map(l => l.item_id).filter(Boolean))]
    if (productIds.length > 0) {
      const { data: inv } = await supabase
        .from('inventory')
        .select('product_id, quantity, allocated_qty')
        .eq('company_id', companyId)
        .in('product_id', productIds)
      const m = {}
      for (const r of inv || []) m[r.product_id] = r
      setStockMap(m)
    } else {
      setStockMap({})
    }

    // 3) Status of any linked PO lines (so we can show "On PO-2026-0014" badges)
    const poLineIds = [...new Set(safeLines.map(l => l.po_line_id).filter(Boolean))]
    if (poLineIds.length > 0) {
      const { data: pl } = await supabase
        .from('purchase_order_lines')
        .select('id, po_id, purchase_orders(id, po_number, status)')
        .in('id', poLineIds)
      const m = {}
      for (const r of pl || []) m[r.id] = { po_id: r.po_id, ...r.purchase_orders }
      setPoLineMap(m)
    } else {
      setPoLineMap({})
    }
    setLoading(false)
  }

  // ── Actions ─────────────────────────────────────────────────────────

  // Allocate from on-hand stock (no PO needed). Caps at min(need, available).
  const allocateFromStock = async () => {
    setWorking(true)
    try {
      let allocatedCount = 0
      for (const line of lines) {
        const need = (parseFloat(line.quantity) || 0) - (parseFloat(line.allocated_qty) || 0)
        if (need <= 0) continue
        const inv = stockMap[line.item_id]
        if (!inv) continue
        const free = Math.max(0, (parseFloat(inv.quantity) || 0) - (parseFloat(inv.allocated_qty) || 0))
        const give = Math.min(need, free)
        if (give <= 0) continue
        // bump both line + inventory.allocated_qty
        await supabase.from('job_lines').update({
          allocated_qty: (parseFloat(line.allocated_qty) || 0) + give,
          updated_at: new Date().toISOString(),
        }).eq('id', line.id)
        await supabase.from('inventory').update({
          allocated_qty: (parseFloat(inv.allocated_qty) || 0) + give,
          last_updated: new Date().toISOString(),
        }).eq('product_id', line.item_id).eq('company_id', companyId)
        allocatedCount += give
      }
      if (allocatedCount > 0) {
        await recomputeJobPartsStatus(job.id)
        toast.success(`Allocated ${allocatedCount} unit${allocatedCount === 1 ? '' : 's'} from stock`)
      } else {
        toast.info('Nothing additional to allocate — either fully allocated or no available stock')
      }
      await fetchAll()
      onChange?.()
    } catch (err) {
      toast.error('Allocation failed: ' + err.message)
    }
    setWorking(false)
  }

  // Generate a draft PO for any line items that don't have enough stock + aren't already on a PO.
  // Groups by default_vendor_id; for products with no vendor mapping, falls back to a single PO
  // using the first available vendor with a note (user can re-vendor in PO detail).
  const generatePoForJob = async () => {
    setWorking(true)
    try {
      // Build the missing list
      const missing = []
      for (const line of lines) {
        if (line.po_line_id) continue  // already on a PO
        const need = (parseFloat(line.quantity) || 0) - (parseFloat(line.allocated_qty) || 0)
        if (need <= 0) continue
        const inv = stockMap[line.item_id]
        const free = inv ? Math.max(0, (parseFloat(inv.quantity) || 0) - (parseFloat(inv.allocated_qty) || 0)) : 0
        const toOrder = Math.max(0, need - free)
        if (toOrder <= 0) continue
        missing.push({ line, toOrder })
      }
      if (missing.length === 0) {
        toast.info('All parts already allocated, on order, or in stock.')
        setWorking(false); return
      }

      // Group by vendor — products with no vendor go into a "no-vendor" bucket
      // that uses the first active vendor as a placeholder.
      const { data: vendors } = await supabase
        .from('vendors').select('id, name').eq('company_id', companyId).eq('active', true).order('name')
      if (!vendors || vendors.length === 0) {
        toast.error('No active vendors yet — create one in /vendors first.')
        setWorking(false); return
      }
      const placeholderVendor = vendors[0]
      const groups = new Map()
      for (const m of missing) {
        const vId = m.line.item?.default_vendor_id || placeholderVendor.id
        if (!groups.has(vId)) groups.set(vId, [])
        groups.get(vId).push(m)
      }

      // Create one PO per vendor
      let createdPos = []
      for (const [vendorId, items] of groups.entries()) {
        const poNumber = await generatePoNumber(companyId)
        const { data: po, error } = await supabase
          .from('purchase_orders')
          .insert({
            company_id: companyId,
            po_number: poNumber,
            vendor_id: vendorId,
            job_id: job.id,
            status: 'draft',
          })
          .select().single()
        if (error) throw error

        // Insert lines + back-link via purchase_order_line_jobs.
        // Bundles (cost=null) are expanded into per-component lines so the
        // vendor receives a list of actual parts to pick, not an abstract name.
        let subtotal = 0
        let sortOrder = 0
        for (const { line, toOrder } of items) {
          // expandProductForPO handles direct-cost, bundle, and no-cost cases
          const orderItems = await expandProductForPO(line.item_id, toOrder, companyId)
          let firstPoLineId = null   // first PO line for this job_line → used for job_line.po_line_id

          for (const oi of orderItems) {
            const lineTotal = oi.unitCost * oi.quantity
            subtotal += lineTotal
            const { data: poLine } = await supabase
              .from('purchase_order_lines')
              .insert({
                company_id: companyId,
                po_id: po.id,
                product_id: oi.productId,
                description: oi.description,
                quantity_ordered: oi.quantity,
                quantity_received: 0,
                unit_cost: oi.unitCost,
                line_total: lineTotal,
                sort_order: sortOrder++,
              })
              .select().single()

            // Back-link so receiving fans qty out to this job_line
            await supabase.from('purchase_order_line_jobs').insert({
              company_id: companyId,
              po_line_id: poLine.id,
              job_line_id: line.id,
              job_id: job.id,
              quantity: oi.quantity,
            })

            if (!firstPoLineId) firstPoLineId = poLine.id
          }

          // Tag the job_line with the first PO line ID so it shows as "on order"
          if (firstPoLineId) {
            await supabase.from('job_lines').update({
              po_line_id: firstPoLineId, updated_at: new Date().toISOString(),
            }).eq('id', line.id)
          }
        }
        // Update PO totals
        await supabase.from('purchase_orders').update({
          subtotal, total: subtotal, updated_at: new Date().toISOString(),
        }).eq('id', po.id)
        createdPos.push(po)
      }

      await recomputeJobPartsStatus(job.id)
      await fetchAll(); onChange?.()
      if (createdPos.length === 1) {
        toast.success(`PO ${createdPos[0].po_number} created`)
        navigate(`/purchase-orders/${createdPos[0].id}`)
      } else {
        toast.success(`${createdPos.length} draft POs created`)
        navigate(`/purchase-orders?status=draft`)
      }
    } catch (err) {
      toast.error('PO generation failed: ' + err.message)
    }
    setWorking(false)
  }

  // Consume allocated parts on job completion. Decrements both
  // inventory.quantity AND inventory.allocated_qty by the consumed amount,
  // and sets job_lines.consumed_qty = allocated_qty.
  const consumeAllocated = async () => {
    if (!confirm('Mark all allocated parts as consumed on this job? This decrements inventory and should only be done when the job is actually complete.')) return
    setWorking(true)
    try {
      let consumedCount = 0
      for (const line of lines) {
        const alloc = parseFloat(line.allocated_qty) || 0
        if (alloc <= 0) continue
        await supabase.from('job_lines').update({
          consumed_qty: alloc,
          updated_at: new Date().toISOString(),
        }).eq('id', line.id)
        // Decrement inventory by the consumed amount
        const inv = stockMap[line.item_id]
        if (inv) {
          await supabase.from('inventory').update({
            quantity: Math.max(0, (parseFloat(inv.quantity) || 0) - alloc),
            allocated_qty: Math.max(0, (parseFloat(inv.allocated_qty) || 0) - alloc),
            last_updated: new Date().toISOString(),
          }).eq('product_id', line.item_id).eq('company_id', companyId)
        }
        consumedCount += alloc
      }
      if (consumedCount > 0) {
        await recomputeJobPartsStatus(job.id)
        toast.success(`Consumed ${consumedCount} unit${consumedCount === 1 ? '' : 's'} from inventory`)
      }
      await fetchAll(); onChange?.()
    } catch (err) {
      toast.error('Consume failed: ' + err.message)
    }
    setWorking(false)
  }

  if (loading) return <div style={{ color: theme.textMuted, fontSize: 13 }}>Loading parts…</div>

  if (lines.length === 0) {
    return (
      <div style={{ color: theme.textMuted, fontSize: 13, fontStyle: 'italic', padding: '8px 0' }}>
        No parts on this job. Add line items with products from the catalog and they'll appear here.
      </div>
    )
  }

  const statusInfo = PARTS_STATUS_LABELS[job.parts_status || 'not_needed'] || PARTS_STATUS_LABELS.not_needed
  const totalNeed = lines.reduce((s, l) => s + (parseFloat(l.quantity) || 0), 0)
  const totalAlloc = lines.reduce((s, l) => s + (parseFloat(l.allocated_qty) || 0), 0)
  const totalCons = lines.reduce((s, l) => s + (parseFloat(l.consumed_qty) || 0), 0)
  const hasUnallocated = lines.some(l => (parseFloat(l.allocated_qty) || 0) < (parseFloat(l.quantity) || 0))
  const hasUnordered = lines.some(l => {
    const need = (parseFloat(l.quantity) || 0) - (parseFloat(l.allocated_qty) || 0)
    if (need <= 0) return false
    if (l.po_line_id) return false
    const inv = stockMap[l.item_id]
    const free = inv ? Math.max(0, (parseFloat(inv.quantity) || 0) - (parseFloat(inv.allocated_qty) || 0)) : 0
    return free < need
  })
  const allAllocated = totalAlloc >= totalNeed - 0.001
  const allConsumed = totalCons >= totalNeed - 0.001

  return (
    <div>
      {/* Status header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 14, flexWrap: 'wrap', gap: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Package size={18} style={{ color: theme.accent }} />
          <h3 style={{ fontSize: 15, fontWeight: 600, color: theme.text, margin: 0 }}>
            Parts
          </h3>
          <span style={{
            padding: '4px 12px', borderRadius: 12, fontSize: 11, fontWeight: 700,
            backgroundColor: statusInfo.bg, color: statusInfo.color,
            textTransform: 'uppercase', letterSpacing: 0.5,
          }}>
            {statusInfo.label}
          </span>
        </div>
        <div style={{ fontSize: 11, color: theme.textMuted }}>
          {totalAlloc} / {totalNeed} allocated · {totalCons} consumed
        </div>
      </div>

      {/* Line items */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
        {lines.map(line => {
          const need = parseFloat(line.quantity) || 0
          const alloc = parseFloat(line.allocated_qty) || 0
          const cons = parseFloat(line.consumed_qty) || 0
          const inv = stockMap[line.item_id]
          const free = inv ? Math.max(0, (parseFloat(inv.quantity) || 0) - (parseFloat(inv.allocated_qty) || 0)) : 0
          const poLink = line.po_line_id ? poLineMap[line.po_line_id] : null

          let badge
          if (cons >= need - 0.001 && need > 0) badge = { text: '✓ Consumed', color: '#7d8a7f', bg: 'rgba(125,138,127,0.15)' }
          else if (alloc >= need - 0.001) badge = { text: '✓ Allocated', color: '#7c3aed', bg: 'rgba(124,58,237,0.12)' }
          else if (poLink) badge = { text: `On ${poLink.po_number}`, color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' }
          else if (free >= (need - alloc)) badge = { text: 'In stock', color: '#16a34a', bg: 'rgba(34,197,94,0.12)' }
          else badge = { text: 'Need to order', color: '#ea580c', bg: 'rgba(234,88,12,0.12)' }

          return (
            <div key={line.id} style={{
              display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 12,
              padding: '10px 12px', alignItems: 'center',
              backgroundColor: theme.bg, borderRadius: 8,
              border: `1px solid ${theme.border}`,
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>
                  {line.item?.name || line.item_name || line.description || 'Item'}
                </div>
                <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 2 }}>
                  Need {need} · Allocated {alloc}{cons > 0 ? ` · Consumed ${cons}` : ''}
                  {inv && ` · Stock: ${free} free / ${inv.quantity} total`}
                </div>
                {poLink && (
                  <button
                    onClick={(e) => { e.stopPropagation(); navigate(`/purchase-orders/${poLink.po_id}`) }}
                    style={{
                      marginTop: 4, padding: '2px 0', background: 'none', border: 'none',
                      cursor: 'pointer', color: theme.accent, fontSize: 11, fontWeight: 600,
                    }}
                  >
                    View PO →
                  </button>
                )}
              </div>
              <span style={{
                padding: '3px 10px', borderRadius: 10, fontSize: 11, fontWeight: 600,
                backgroundColor: badge.bg, color: badge.color, whiteSpace: 'nowrap',
              }}>
                {badge.text}
              </span>
            </div>
          )
        })}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {hasUnallocated && (
          <button
            onClick={allocateFromStock}
            disabled={working}
            style={actionBtn('rgba(124,58,237,0.10)', '#7c3aed', { disabled: working })}
            title="Reserve on-hand stock for this job. Pulls from inventory free pool."
          >
            <Truck size={14} /> Allocate from Stock
          </button>
        )}
        {hasUnordered && (
          <button
            onClick={generatePoForJob}
            disabled={working}
            style={actionBtn(theme.accent, '#fff', { disabled: working })}
            title="Create one draft PO per vendor for parts not in stock"
          >
            <ShoppingCart size={14} /> Generate PO
          </button>
        )}
        {allAllocated && !allConsumed && (
          <button
            onClick={consumeAllocated}
            disabled={working}
            style={actionBtn('rgba(22,163,74,0.10)', '#16a34a', { disabled: working })}
            title="Mark allocated parts as consumed. Decrements inventory. Do this when the job is actually complete."
          >
            <CheckCircle size={14} /> Mark Parts Consumed
          </button>
        )}
        {!hasUnallocated && !hasUnordered && !allAllocated && (
          <div style={{
            padding: '8px 12px', backgroundColor: theme.bg,
            border: `1px solid ${theme.border}`, borderRadius: 6,
            fontSize: 12, color: theme.textMuted,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <AlertCircle size={13} />
            Waiting on shipment for some lines — receive on the PO detail page.
          </div>
        )}
      </div>
    </div>
  )
}

const actionBtn = (bg, color, opts = {}) => ({
  display: 'flex', alignItems: 'center', gap: 6,
  padding: '8px 14px', backgroundColor: bg, color, border: 'none', borderRadius: 6,
  fontSize: 12, fontWeight: 600,
  cursor: opts.disabled ? 'not-allowed' : 'pointer',
  opacity: opts.disabled ? 0.6 : 1,
})
