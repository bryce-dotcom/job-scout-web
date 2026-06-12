// Procurement Queue — aggregates parts needs across all jobs in
// parts_status='needs_order', groups by vendor, and creates one
// PO per selected vendor with purchase_order_line_jobs back-links
// so receiving fans the qty out to each contributing job.

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import { ShoppingCart, Building2, ChevronDown, ChevronRight, RefreshCw, Briefcase, AlertCircle } from 'lucide-react'
import { useIsMobile } from '../hooks/useIsMobile'
import PageHeader from '../components/PageHeader'
import { aggregateNeedsOrder } from '../lib/partsAggregator'
import { generatePoNumber, formatCurrency, expandProductForPO } from '../lib/poUtils'
import { recomputeJobPartsStatus } from '../lib/poReceive'

const defaultTheme = {
  bg: '#f7f5ef', bgCard: '#ffffff', bgCardHover: '#eef2eb',
  border: '#d6cdb8', text: '#2c3530', textSecondary: '#4d5a52',
  textMuted: '#7d8a7f', accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)'
}

export default function Procurement() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const companyId = useStore((s) => s.companyId)
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  const [data, setData] = useState({ jobs: [], groups: [] })
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [vendors, setVendors] = useState([])

  // Selection state — Map(productId → boolean) and Map(noVendorProductId → vendorId override)
  const [selected, setSelected] = useState({})
  const [vendorOverride, setVendorOverride] = useState({}) // productId → vendor_id chosen inline
  const [expandedGroups, setExpandedGroups] = useState(new Set())

  useEffect(() => {
    if (!companyId) { navigate('/'); return }
    fetchAll()
  }, [companyId])

  const fetchAll = async () => {
    setLoading(true)
    const [aggResult, vRes] = await Promise.all([
      aggregateNeedsOrder(companyId),
      supabase.from('vendors').select('id, name').eq('company_id', companyId).eq('active', true).order('name'),
    ])
    setData(aggResult)
    setVendors(vRes.data || [])
    // Default: all items selected, all groups expanded
    const sel = {}
    const expanded = new Set()
    for (const g of aggResult.groups) {
      expanded.add(g.key)
      for (const item of g.items) {
        if (item.toOrder > 0) sel[item.product.id] = true
      }
    }
    setSelected(sel)
    setExpandedGroups(expanded)
    setVendorOverride({})
    setLoading(false)
  }

  const toggleProduct = (productId) => {
    setSelected(prev => ({ ...prev, [productId]: !prev[productId] }))
  }

  const toggleGroup = (key) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  const toggleAllInGroup = (group) => {
    const allSelected = group.items.filter(i => i.toOrder > 0).every(i => selected[i.product.id])
    setSelected(prev => {
      const next = { ...prev }
      for (const item of group.items) {
        if (item.toOrder > 0) next[item.product.id] = !allSelected
      }
      return next
    })
  }

  // Save inline vendor pick back to products_services so we don't have to ask again
  const setProductVendor = async (productId, vendorId) => {
    setVendorOverride(prev => ({ ...prev, [productId]: vendorId }))
    if (vendorId) {
      await supabase.from('products_services').update({
        default_vendor_id: parseInt(vendorId),
        updated_at: new Date().toISOString(),
      }).eq('id', productId)
    }
  }

  // Effective vendor for an item: explicit override → product default → null
  const resolveVendor = (item) => {
    const ov = vendorOverride[item.product.id]
    if (ov) return parseInt(ov)
    return item.product.default_vendor_id || null
  }

  // Selection summary for the action bar
  const summary = (() => {
    let selectedItems = 0
    let totalCost = 0
    const vendorsHit = new Set()
    const missingVendor = []
    for (const g of data.groups) {
      for (const item of g.items) {
        if (!selected[item.product.id] || item.toOrder <= 0) continue
        selectedItems++
        totalCost += item.toOrder * item.product.cost
        const v = resolveVendor(item)
        if (!v) missingVendor.push(item.product.name)
        else vendorsHit.add(v)
      }
    }
    return { selectedItems, totalCost, vendorsHit, missingVendor }
  })()

  const createPos = async () => {
    if (summary.missingVendor.length > 0) {
      toast.error(`Pick a vendor for: ${summary.missingVendor.slice(0, 3).join(', ')}${summary.missingVendor.length > 3 ? ` and ${summary.missingVendor.length - 3} more` : ''}`)
      return
    }
    if (summary.selectedItems === 0) {
      toast.error('Select at least one item to order.')
      return
    }
    setCreating(true)
    try {
      // Expand ALL selected products into per-component order items first,
      // then group by each component's own vendor. Bundle components that
      // ship from a different vendor (e.g. extended warranty from the
      // manufacturer) will land on a separate PO automatically.
      const allOrderItems = []
      for (const g of data.groups) {
        for (const item of g.items) {
          if (!selected[item.product.id] || item.toOrder <= 0) continue
          const resolvedVendorId = resolveVendor(item)
          const orderItems = await expandProductForPO(item.product.id, item.toOrder, companyId)
          const totalContrib = item.jobContributions.reduce((s, c) => s + c.qty, 0)
          for (const oi of orderItems) {
            allOrderItems.push({ oi, item, totalContrib, resolvedVendorId })
          }
        }
      }

      // Group expanded items by effective vendor (component vendor takes
      // priority over the parent product's resolved vendor)
      const byVendor = new Map()
      for (const entry of allOrderItems) {
        const vId = entry.oi.vendorId || entry.resolvedVendorId
        if (!byVendor.has(vId)) byVendor.set(vId, [])
        byVendor.get(vId).push(entry)
      }

      const createdPos = []
      const touchedJobs = new Set()
      // Only set po_line_id on each job_line once (first PO line wins)
      const taggedJobLines = new Set()

      for (const [vendorId, entries] of byVendor.entries()) {
        const poNumber = await generatePoNumber(companyId)
        const { data: po, error: poErr } = await supabase
          .from('purchase_orders')
          .insert({
            company_id: companyId,
            po_number: poNumber,
            vendor_id: vendorId,
            job_id: null,
            status: 'draft',
            notes: `Aggregated from Procurement Queue · ${entries.length} line${entries.length === 1 ? '' : 's'} across multiple jobs`,
          })
          .select().single()
        if (poErr) throw poErr

        let subtotal = 0
        let sortOrder = 0

        for (const { oi, item, totalContrib } of entries) {
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

          // Fan the PO line out to each contributing job_line, pro-rated
          if (totalContrib > 0) {
            let remaining = oi.quantity
            const fanout = item.jobContributions.map((c, idx) => {
              const isLast = idx === item.jobContributions.length - 1
              const share = isLast ? remaining : Math.round((c.qty / totalContrib) * oi.quantity * 100) / 100
              remaining -= share
              return { ...c, share }
            })
            for (const c of fanout) {
              if (c.share <= 0) continue
              await supabase.from('purchase_order_line_jobs').insert({
                company_id: companyId,
                po_line_id: poLine.id,
                job_line_id: c.jobLineId,
                job_id: c.jobId,
                quantity: c.share,
              })
              if (!taggedJobLines.has(c.jobLineId)) {
                taggedJobLines.add(c.jobLineId)
                await supabase.from('job_lines').update({
                  po_line_id: poLine.id, updated_at: new Date().toISOString(),
                }).eq('id', c.jobLineId)
              }
              touchedJobs.add(c.jobId)
            }
          }
        }

        await supabase.from('purchase_orders').update({
          subtotal, total: subtotal, updated_at: new Date().toISOString(),
        }).eq('id', po.id)

        createdPos.push(po)
      }

      // Recompute parts_status on every touched job (most will flip to 'ordered')
      for (const jobId of touchedJobs) {
        await recomputeJobPartsStatus(jobId)
      }

      toast.success(`${createdPos.length} draft PO${createdPos.length === 1 ? '' : 's'} created`)
      if (createdPos.length === 1) {
        navigate(`/purchase-orders/${createdPos[0].id}`)
      } else {
        navigate('/purchase-orders?status=draft')
      }
    } catch (err) {
      toast.error('PO creation failed: ' + err.message)
    }
    setCreating(false)
  }

  if (loading) {
    return <div style={{ padding: 24, color: theme.textMuted }}>Loading procurement queue…</div>
  }

  return (
    <div style={{ padding: isMobile ? '16px' : '24px' }}>
      <PageHeader
        title="Procurement Queue"
        subtitle="Jobs needing parts — batch them into vendor POs"
        icon={ShoppingCart}
      />

      {/* Summary row */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        padding: '14px 18px', borderRadius: 12,
        backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`,
        marginBottom: 16,
      }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: theme.text }}>{data.jobs.length}</div>
          <div style={{ fontSize: 11, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Jobs need parts
          </div>
        </div>
        <div style={{ width: 1, alignSelf: 'stretch', backgroundColor: theme.border }} />
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: theme.text }}>{data.groups.filter(g => g.key !== 'no-vendor').length}</div>
          <div style={{ fontSize: 11, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Vendors involved
          </div>
        </div>
        <div style={{ width: 1, alignSelf: 'stretch', backgroundColor: theme.border }} />
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: theme.accent }}>
            {formatCurrency(data.groups.flatMap(g => g.items).reduce((s, i) => s + i.toOrder * i.product.cost, 0))}
          </div>
          <div style={{ fontSize: 11, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Est. total to order
          </div>
        </div>
        <button onClick={fetchAll} style={{
          marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 12px', backgroundColor: 'transparent',
          border: `1px solid ${theme.border}`, borderRadius: 6,
          color: theme.textSecondary, fontSize: 12, fontWeight: 500, cursor: 'pointer',
        }}>
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Groups */}
      {data.groups.length === 0 ? (
        <div style={{
          padding: 40, textAlign: 'center',
          backgroundColor: theme.bgCard,
          border: `1px dashed ${theme.border}`, borderRadius: 12,
          color: theme.textMuted,
        }}>
          <ShoppingCart size={32} style={{ opacity: 0.4, marginBottom: 12 }} />
          <p style={{ fontSize: 14, margin: '0 0 4px' }}>Nothing needs ordering right now.</p>
          <p style={{ fontSize: 12 }}>Jobs land here automatically when their parts_status flips to "needs_order".</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 80 }}>
          {data.groups.map(group => {
            const expanded = expandedGroups.has(group.key)
            const isNoVendor = group.key === 'no-vendor'
            const groupTotal = group.items.reduce((s, i) => s + i.toOrder * i.product.cost, 0)
            const allSelected = group.items.filter(i => i.toOrder > 0).every(i => selected[i.product.id])
            return (
              <div key={group.key} style={{
                backgroundColor: theme.bgCard,
                border: `1px solid ${isNoVendor ? '#ea580c' : theme.border}`,
                borderRadius: 12, overflow: 'hidden',
              }}>
                <button
                  onClick={() => toggleGroup(group.key)}
                  style={{
                    width: '100%', textAlign: 'left',
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '14px 18px', background: 'none', border: 'none', cursor: 'pointer',
                    borderBottom: expanded ? `1px solid ${theme.border}` : 'none',
                  }}
                >
                  {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  <Building2 size={16} style={{ color: isNoVendor ? '#ea580c' : theme.accent }} />
                  <span style={{ fontSize: 15, fontWeight: 700, color: theme.text }}>
                    {isNoVendor ? 'No-vendor parts' : group.vendor?.name || 'Unknown vendor'}
                  </span>
                  {isNoVendor && (
                    <span style={{
                      padding: '2px 8px', borderRadius: 8, fontSize: 10, fontWeight: 700,
                      backgroundColor: 'rgba(234,88,12,0.12)', color: '#ea580c',
                    }}>
                      PICK A VENDOR
                    </span>
                  )}
                  <span style={{ fontSize: 12, color: theme.textMuted, marginLeft: 'auto' }}>
                    {group.items.length} item{group.items.length === 1 ? '' : 's'} · {formatCurrency(groupTotal)}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleAllInGroup(group) }}
                    style={{
                      padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                      backgroundColor: 'transparent', border: `1px solid ${theme.border}`,
                      color: theme.textSecondary, cursor: 'pointer',
                    }}
                  >
                    {allSelected ? 'Deselect all' : 'Select all'}
                  </button>
                </button>

                {expanded && (
                  <div style={{ padding: '0 18px 14px' }}>
                    {group.items.map(item => {
                      const isSel = !!selected[item.product.id]
                      const cost = item.toOrder * item.product.cost
                      const inStock = item.toOrder === 0
                      return (
                        <div key={item.product.id} style={{
                          padding: '10px 0', borderTop: `1px solid ${theme.border}`,
                          display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 12,
                          alignItems: 'start', opacity: inStock ? 0.55 : 1,
                        }}>
                          <input
                            type="checkbox"
                            checked={isSel}
                            disabled={inStock}
                            onChange={() => toggleProduct(item.product.id)}
                            style={{ marginTop: 4, cursor: inStock ? 'not-allowed' : 'pointer' }}
                          />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>
                              {item.product.name}
                              {item.product.vendor_sku && (
                                <span style={{ marginLeft: 8, fontSize: 11, color: theme.textMuted, fontWeight: 400 }}>
                                  · SKU {item.product.vendor_sku}
                                </span>
                              )}
                              {inStock && (
                                <span style={{
                                  marginLeft: 8, padding: '1px 8px', borderRadius: 8,
                                  fontSize: 10, fontWeight: 700,
                                  backgroundColor: 'rgba(34,197,94,0.15)', color: '#16a34a',
                                }}>
                                  ✓ IN STOCK
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 4 }}>
                              Need {item.totalNeed} · Stock {item.totalAvailable} ·
                              {' '}<strong style={{ color: inStock ? '#16a34a' : '#ea580c' }}>
                                Order {item.toOrder}
                              </strong>
                            </div>
                            {/* Per-job breakdown — name front and centre */}
                            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                              {item.jobContributions.map(c => (
                                <button
                                  key={c.jobLineId}
                                  onClick={() => navigate(`/jobs/${c.jobId}`)}
                                  style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
                                    background: 'none', border: `1px solid ${theme.border}`,
                                    textAlign: 'left', width: '100%',
                                  }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                                    <Briefcase size={12} style={{ flexShrink: 0, color: theme.accent }} />
                                    <span style={{ fontSize: 13, fontWeight: 600, color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                      {c.jobName}
                                    </span>
                                    <span style={{ fontSize: 11, color: theme.textMuted, flexShrink: 0 }}>
                                      {c.jobLabel !== c.jobName ? c.jobLabel.split(' ')[0] : ''}
                                    </span>
                                  </div>
                                  <span style={{
                                    flexShrink: 0, marginLeft: 8,
                                    padding: '2px 8px', borderRadius: 10,
                                    fontSize: 11, fontWeight: 700,
                                    backgroundColor: theme.accentBg, color: theme.accent,
                                  }}>
                                    qty {c.qty}
                                  </span>
                                </button>
                              ))}
                            </div>
                            {/* Inline vendor picker for no-vendor items */}
                            {isNoVendor && (
                              <div style={{ marginTop: 8 }}>
                                <select
                                  value={vendorOverride[item.product.id] || ''}
                                  onChange={(e) => setProductVendor(item.product.id, e.target.value)}
                                  style={{
                                    padding: '6px 10px', borderRadius: 6,
                                    border: `1px solid ${theme.border}`, fontSize: 12,
                                    backgroundColor: theme.bg, color: theme.text,
                                  }}
                                >
                                  <option value="">— Pick a vendor —</option>
                                  {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                                </select>
                                <span style={{ marginLeft: 8, fontSize: 10, color: theme.textMuted }}>
                                  Saves to product so you don't have to pick again
                                </span>
                              </div>
                            )}
                          </div>
                          <div style={{ textAlign: 'right', minWidth: 100 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>
                              {formatCurrency(cost)}
                            </div>
                            <div style={{ fontSize: 11, color: theme.textMuted }}>
                              @ {formatCurrency(item.product.cost)}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Sticky action bar */}
      {data.groups.length > 0 && (
        <div style={{
          position: 'fixed', bottom: 0, left: 0, right: 0,
          padding: '14px 24px',
          backgroundColor: theme.bgCard,
          borderTop: `1px solid ${theme.border}`,
          display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
          zIndex: 100,
          boxShadow: '0 -4px 12px rgba(0,0,0,0.06)',
        }}>
          <div style={{ fontSize: 13, color: theme.textSecondary }}>
            <strong style={{ color: theme.text }}>{summary.selectedItems}</strong> item{summary.selectedItems === 1 ? '' : 's'} selected
            {' · '}
            <strong style={{ color: theme.text }}>{summary.vendorsHit.size}</strong> PO{summary.vendorsHit.size === 1 ? '' : 's'} to create
            {' · '}
            <strong style={{ color: theme.accent }}>{formatCurrency(summary.totalCost)}</strong>
          </div>
          {summary.missingVendor.length > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 10px', borderRadius: 6,
              backgroundColor: 'rgba(234,88,12,0.12)', color: '#ea580c',
              fontSize: 12, fontWeight: 600,
            }}>
              <AlertCircle size={13} />
              {summary.missingVendor.length} item{summary.missingVendor.length === 1 ? '' : 's'} need a vendor pick
            </div>
          )}
          <button
            onClick={createPos}
            disabled={creating || summary.selectedItems === 0 || summary.missingVendor.length > 0}
            style={{
              marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8,
              padding: '12px 20px', backgroundColor: theme.accent, color: '#fff',
              border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700,
              cursor: (creating || summary.selectedItems === 0 || summary.missingVendor.length > 0) ? 'not-allowed' : 'pointer',
              opacity: (creating || summary.selectedItems === 0 || summary.missingVendor.length > 0) ? 0.5 : 1,
            }}
          >
            <ShoppingCart size={16} />
            {creating ? 'Creating…' : `Create ${summary.vendorsHit.size} Draft PO${summary.vendorsHit.size === 1 ? '' : 's'}`}
          </button>
        </div>
      )}
    </div>
  )
}
