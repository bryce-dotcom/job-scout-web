import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import useSmartBack from '../lib/useSmartBack'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { toast } from '../lib/toast'
import { ArrowLeft, Save, Plus, Trash2, Send, Package, FileText, X, Briefcase } from 'lucide-react'
import { useIsMobile } from '../hooks/useIsMobile'
import { PO_STATUS_LABELS, computePoTotals, formatCurrency } from '../lib/poUtils'

const defaultTheme = {
  bg: '#f7f5ef', bgCard: '#ffffff', bgCardHover: '#eef2eb',
  border: '#d6cdb8', text: '#2c3530', textSecondary: '#4d5a52',
  textMuted: '#7d8a7f', accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)'
}

export default function PurchaseOrderDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const goBack = useSmartBack('/purchase-orders')
  const isMobile = useIsMobile()
  const companyId = useStore((s) => s.companyId)
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  const [po, setPo] = useState(null)
  const [lines, setLines] = useState([])
  const [vendors, setVendors] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Header form (locked to po row except when editing)
  const [vendorId, setVendorId] = useState('')
  const [expectedDate, setExpectedDate] = useState('')
  const [tax, setTax] = useState('')
  const [shipping, setShipping] = useState('')
  const [notes, setNotes] = useState('')
  const [internalNotes, setInternalNotes] = useState('')

  // New-line draft
  const [draft, setDraft] = useState({ product_id: '', description: '', quantity: 1, unit_cost: 0 })
  const [productPickerOpen, setProductPickerOpen] = useState(false)

  useEffect(() => {
    if (!companyId) { navigate('/'); return }
    fetchAll()
  }, [companyId, id])

  const fetchAll = async () => {
    setLoading(true)
    const [poRes, linesRes, vRes, pRes] = await Promise.all([
      supabase.from('purchase_orders')
        .select('*, vendor:vendors(id, name, email, billing_address, default_payment_terms), job:jobs(id, job_id, job_title, job_address)')
        .eq('id', id).eq('company_id', companyId).maybeSingle(),
      supabase.from('purchase_order_lines').select('*').eq('po_id', id).order('sort_order').order('id'),
      supabase.from('vendors').select('id, name').eq('company_id', companyId).eq('active', true).order('name'),
      supabase.from('products_services')
        .select('id, item_id, name, cost, unit_price, vendor_sku, default_vendor_id')
        .eq('company_id', companyId).eq('active', true).order('name').limit(2000),
    ])
    const poRow = poRes.data
    if (!poRow) { setLoading(false); return }
    setPo(poRow)
    setLines(linesRes.data || [])
    setVendors(vRes.data || [])
    setProducts(pRes.data || [])
    setVendorId(String(poRow.vendor_id || ''))
    setExpectedDate(poRow.expected_delivery_date || '')
    setTax(poRow.tax || '')
    setShipping(poRow.shipping || '')
    setNotes(poRow.notes || '')
    setInternalNotes(poRow.internal_notes || '')
    setLoading(false)
  }

  const isEditable = po && (po.status === 'draft')
  const status = po ? (PO_STATUS_LABELS[po.status] || PO_STATUS_LABELS.draft) : null

  const totals = useMemo(() => computePoTotals(lines, tax, shipping), [lines, tax, shipping])

  // Persist header changes (vendor / dates / tax / shipping / notes)
  const saveHeader = async (extra = {}) => {
    setSaving(true)
    const t = computePoTotals(lines, tax, shipping)
    const { error } = await supabase
      .from('purchase_orders')
      .update({
        vendor_id: parseInt(vendorId) || po.vendor_id,
        expected_delivery_date: expectedDate || null,
        tax: t.tax, shipping: t.shipping,
        subtotal: t.subtotal, total: t.total,
        notes: notes || null,
        internal_notes: internalNotes || null,
        ...extra,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
    if (error) toast.error('Save failed: ' + error.message)
    else {
      toast.success('Saved')
      await fetchAll()
    }
    setSaving(false)
  }

  // Add a new line to this PO from a product pick OR a custom row.
  const addLineFromProduct = async (product) => {
    if (!product) return
    setProductPickerOpen(false)
    const unitCost = parseFloat(product.cost) || 0
    const qty = 1
    const { error } = await supabase
      .from('purchase_order_lines')
      .insert({
        company_id: companyId,
        po_id: parseInt(id),
        product_id: product.id,
        description: product.vendor_sku ? `${product.name} (${product.vendor_sku})` : product.name,
        quantity_ordered: qty,
        quantity_received: 0,
        unit_cost: unitCost,
        line_total: qty * unitCost,
        sort_order: lines.length,
      })
    if (error) toast.error('Failed to add line: ' + error.message)
    else {
      await fetchAll()
      // Recompute totals on the PO row after adding
      await refreshTotals()
    }
  }

  const addCustomLine = async () => {
    if (!draft.description.trim()) {
      toast.error('Description is required for a custom line')
      return
    }
    const qty = parseFloat(draft.quantity) || 0
    const cost = parseFloat(draft.unit_cost) || 0
    const { error } = await supabase
      .from('purchase_order_lines')
      .insert({
        company_id: companyId,
        po_id: parseInt(id),
        product_id: null,
        description: draft.description.trim(),
        quantity_ordered: qty,
        quantity_received: 0,
        unit_cost: cost,
        line_total: qty * cost,
        sort_order: lines.length,
      })
    if (error) toast.error('Failed to add line: ' + error.message)
    else {
      setDraft({ product_id: '', description: '', quantity: 1, unit_cost: 0 })
      await fetchAll()
      await refreshTotals()
    }
  }

  const updateLineField = async (lineId, field, value) => {
    const line = lines.find(l => l.id === lineId); if (!line) return
    const patched = { ...line, [field]: value }
    const qty = parseFloat(patched.quantity_ordered) || 0
    const cost = parseFloat(patched.unit_cost) || 0
    patched.line_total = Math.round(qty * cost * 100) / 100
    setLines(prev => prev.map(l => l.id === lineId ? patched : l))
    // Debounced save would be nicer; for now persist on every change.
    await supabase.from('purchase_order_lines').update({
      [field]: value,
      line_total: patched.line_total,
      updated_at: new Date().toISOString(),
    }).eq('id', lineId)
    await refreshTotals()
  }

  const deleteLine = async (lineId) => {
    if (!confirm('Remove this line?')) return
    await supabase.from('purchase_order_lines').delete().eq('id', lineId)
    await fetchAll()
    await refreshTotals()
  }

  // After any line change, recompute and persist header totals so the
  // list view and totals card stay in sync without a manual save.
  const refreshTotals = async () => {
    const { data: fresh } = await supabase
      .from('purchase_order_lines').select('quantity_ordered, unit_cost, line_total').eq('po_id', id)
    const t = computePoTotals(fresh || [], tax, shipping)
    await supabase.from('purchase_orders').update({
      subtotal: t.subtotal, total: t.total, updated_at: new Date().toISOString(),
    }).eq('id', id)
    setPo(p => p ? { ...p, subtotal: t.subtotal, total: t.total } : p)
  }

  // Cancel a PO (soft — keeps the row + audit trail)
  const cancelPo = async () => {
    if (!confirm('Cancel this PO? It will move to the Cancelled status.')) return
    await supabase.from('purchase_orders').update({
      status: 'cancelled', closed_at: new Date().toISOString(),
    }).eq('id', id)
    toast.success('PO cancelled')
    await fetchAll()
  }

  if (loading) return <div style={{ padding: 24, color: theme.textMuted }}>Loading PO…</div>
  if (!po) return (
    <div style={{ padding: 24 }}>
      <p style={{ color: '#dc2626', marginBottom: 16 }}>PO not found.</p>
      <button onClick={() => navigate('/purchase-orders')} style={{
        color: theme.accent, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer',
      }}>← Back to Purchase Orders</button>
    </div>
  )

  return (
    <div style={{ padding: isMobile ? 16 : 24 }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        marginBottom: 20, flexWrap: 'wrap',
      }}>
        <button
          onClick={goBack}
          style={{
            padding: 10, backgroundColor: theme.bgCard,
            border: `1px solid ${theme.border}`, borderRadius: 8,
            cursor: 'pointer', color: theme.textSecondary,
          }}
        >
          <ArrowLeft size={20} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 12, color: theme.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, margin: 0 }}>
            Purchase Order
          </p>
          <h1 style={{ fontSize: isMobile ? 22 : 26, fontWeight: 700, color: theme.text, margin: 0, fontFamily: 'monospace' }}>
            {po.po_number}
          </h1>
        </div>
        <span style={{
          padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600,
          backgroundColor: status.bg, color: status.color,
        }}>
          {status.label}
        </span>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) 320px',
        gap: 20,
      }}>
        {/* Main column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Vendor + ship-to + dates card */}
          <div style={{
            backgroundColor: theme.bgCard,
            border: `1px solid ${theme.border}`, borderRadius: 12,
            padding: 18,
          }}>
            <div style={{
              display: 'grid', gap: 14,
              gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
            }}>
              <div>
                <Label theme={theme}>Vendor</Label>
                {isEditable ? (
                  <select
                    value={vendorId}
                    onChange={(e) => setVendorId(e.target.value)}
                    onBlur={() => saveHeader()}
                    style={selectStyle(theme)}
                  >
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                ) : (
                  <p style={readonlyText(theme)}>{po.vendor?.name || '—'}</p>
                )}
              </div>
              <div>
                <Label theme={theme}>Expected delivery</Label>
                {isEditable ? (
                  <input
                    type="date"
                    value={expectedDate || ''}
                    onChange={(e) => setExpectedDate(e.target.value)}
                    onBlur={() => saveHeader()}
                    style={selectStyle(theme)}
                  />
                ) : (
                  <p style={readonlyText(theme)}>{po.expected_delivery_date || '—'}</p>
                )}
              </div>
            </div>

            {po.vendor?.billing_address && (
              <div style={{ marginTop: 14, fontSize: 12, color: theme.textMuted, whiteSpace: 'pre-wrap' }}>
                <strong style={{ color: theme.textSecondary, marginRight: 6 }}>Bill to:</strong>
                {po.vendor.billing_address}
              </div>
            )}
            {po.vendor?.default_payment_terms && (
              <div style={{ marginTop: 6, fontSize: 12, color: theme.textMuted }}>
                <strong style={{ color: theme.textSecondary, marginRight: 6 }}>Terms:</strong>
                {po.vendor.default_payment_terms}
              </div>
            )}
            {po.job && (
              <div style={{
                marginTop: 14, padding: '10px 12px',
                backgroundColor: theme.bg, borderRadius: 8,
                display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
              }}>
                <Briefcase size={14} style={{ color: theme.accent }} />
                <span style={{ color: theme.textSecondary }}>For job:</span>
                <button
                  onClick={() => navigate(`/jobs/${po.job.id}`)}
                  style={{ color: theme.accent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                >
                  {po.job.job_id} — {po.job.job_title}
                </button>
              </div>
            )}
          </div>

          {/* Line items */}
          <div style={{
            backgroundColor: theme.bgCard,
            border: `1px solid ${theme.border}`, borderRadius: 12,
            padding: 18,
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              marginBottom: 14,
            }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: theme.text, margin: 0 }}>
                Line Items
              </h3>
              {isEditable && (
                <button
                  onClick={() => setProductPickerOpen(true)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', backgroundColor: theme.accentBg,
                    color: theme.accent, border: 'none', borderRadius: 6,
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  <Plus size={14} />
                  Add from Catalog
                </button>
              )}
            </div>

            {lines.length === 0 ? (
              <p style={{ color: theme.textMuted, fontSize: 13, fontStyle: 'italic', margin: 0 }}>
                No lines yet. {isEditable && 'Use Add from Catalog or the custom-line row below.'}
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Column header */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 90px 110px 110px 36px',
                  gap: 8, fontSize: 11, fontWeight: 600,
                  color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5,
                  padding: '0 4px',
                }}>
                  <span>Description</span>
                  <span style={{ textAlign: 'right' }}>Qty</span>
                  <span style={{ textAlign: 'right' }}>Unit Cost</span>
                  <span style={{ textAlign: 'right' }}>Total</span>
                  <span />
                </div>
                {lines.map(line => (
                  <div key={line.id} style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 90px 110px 110px 36px',
                    gap: 8, alignItems: 'center',
                    padding: '8px 4px',
                    borderTop: `1px solid ${theme.border}`,
                  }}>
                    {isEditable ? (
                      <input
                        type="text" value={line.description || ''}
                        onChange={(e) => setLines(prev => prev.map(l => l.id === line.id ? { ...l, description: e.target.value } : l))}
                        onBlur={(e) => updateLineField(line.id, 'description', e.target.value)}
                        style={inlineInput(theme)}
                      />
                    ) : (
                      <span style={{ fontSize: 13, color: theme.text }}>{line.description}</span>
                    )}
                    {isEditable ? (
                      <input
                        type="number" step="0.01" value={line.quantity_ordered}
                        onChange={(e) => setLines(prev => prev.map(l => l.id === line.id ? { ...l, quantity_ordered: e.target.value } : l))}
                        onBlur={(e) => updateLineField(line.id, 'quantity_ordered', parseFloat(e.target.value) || 0)}
                        style={{ ...inlineInput(theme), textAlign: 'right' }}
                      />
                    ) : (
                      <span style={{ fontSize: 13, textAlign: 'right' }}>{line.quantity_ordered}</span>
                    )}
                    {isEditable ? (
                      <input
                        type="number" step="0.01" value={line.unit_cost}
                        onChange={(e) => setLines(prev => prev.map(l => l.id === line.id ? { ...l, unit_cost: e.target.value } : l))}
                        onBlur={(e) => updateLineField(line.id, 'unit_cost', parseFloat(e.target.value) || 0)}
                        style={{ ...inlineInput(theme), textAlign: 'right' }}
                      />
                    ) : (
                      <span style={{ fontSize: 13, textAlign: 'right' }}>{formatCurrency(line.unit_cost)}</span>
                    )}
                    <span style={{ fontSize: 13, fontWeight: 600, textAlign: 'right', color: theme.text }}>
                      {formatCurrency(line.line_total)}
                    </span>
                    {isEditable && (
                      <button
                        onClick={() => deleteLine(line.id)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: theme.textMuted, padding: 4,
                        }}
                        title="Remove line"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Custom line entry */}
            {isEditable && (
              <div style={{
                marginTop: 14, paddingTop: 14, borderTop: `1px dashed ${theme.border}`,
                display: 'grid', gridTemplateColumns: '1fr 90px 110px auto', gap: 8, alignItems: 'center',
              }}>
                <input
                  type="text" placeholder="Custom line description (no product)"
                  value={draft.description}
                  onChange={(e) => setDraft(d => ({ ...d, description: e.target.value }))}
                  style={inlineInput(theme)}
                />
                <input
                  type="number" placeholder="Qty" step="0.01" value={draft.quantity}
                  onChange={(e) => setDraft(d => ({ ...d, quantity: e.target.value }))}
                  style={{ ...inlineInput(theme), textAlign: 'right' }}
                />
                <input
                  type="number" placeholder="Cost" step="0.01" value={draft.unit_cost}
                  onChange={(e) => setDraft(d => ({ ...d, unit_cost: e.target.value }))}
                  style={{ ...inlineInput(theme), textAlign: 'right' }}
                />
                <button
                  onClick={addCustomLine}
                  style={{
                    padding: '6px 12px', backgroundColor: theme.accent, color: '#fff',
                    border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  Add
                </button>
              </div>
            )}
          </div>

          {/* Notes */}
          <div style={{
            backgroundColor: theme.bgCard,
            border: `1px solid ${theme.border}`, borderRadius: 12,
            padding: 18, display: 'flex', flexDirection: 'column', gap: 12,
          }}>
            <div>
              <Label theme={theme}>Notes (visible on the PO sent to vendor)</Label>
              {isEditable ? (
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onBlur={() => saveHeader()}
                  rows={3}
                  style={textareaStyle(theme)}
                />
              ) : (
                <p style={readonlyText(theme)}>{notes || '—'}</p>
              )}
            </div>
            <div>
              <Label theme={theme}>Internal notes (NOT shown to vendor)</Label>
              {isEditable ? (
                <textarea
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  onBlur={() => saveHeader()}
                  rows={3}
                  style={textareaStyle(theme)}
                />
              ) : (
                <p style={readonlyText(theme)}>{internalNotes || '—'}</p>
              )}
            </div>
          </div>
        </div>

        {/* Sidebar — totals + actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{
            backgroundColor: theme.bgCard,
            border: `1px solid ${theme.border}`, borderRadius: 12,
            padding: 18,
          }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: theme.text, margin: '0 0 14px' }}>
              Totals
            </h3>
            <Row label="Subtotal" value={formatCurrency(totals.subtotal)} theme={theme} />
            <Row label="Tax" theme={theme} valueNode={
              isEditable
                ? <input type="number" step="0.01" value={tax} onChange={(e) => setTax(e.target.value)} onBlur={() => saveHeader()}
                    style={{ ...inlineInput(theme), width: 80, textAlign: 'right' }} />
                : formatCurrency(totals.tax)
            } />
            <Row label="Shipping" theme={theme} valueNode={
              isEditable
                ? <input type="number" step="0.01" value={shipping} onChange={(e) => setShipping(e.target.value)} onBlur={() => saveHeader()}
                    style={{ ...inlineInput(theme), width: 80, textAlign: 'right' }} />
                : formatCurrency(totals.shipping)
            } />
            <div style={{
              marginTop: 10, paddingTop: 10, borderTop: `1px solid ${theme.border}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: theme.text }}>Total</span>
              <span style={{ fontSize: 20, fontWeight: 700, color: theme.accent }}>
                {formatCurrency(totals.total)}
              </span>
            </div>
          </div>

          <div style={{
            backgroundColor: theme.bgCard,
            border: `1px solid ${theme.border}`, borderRadius: 12,
            padding: 18,
          }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: theme.text, margin: '0 0 14px' }}>
              Actions
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {po.status === 'draft' && (
                <button
                  disabled
                  style={actionBtn(theme.accent, '#fff', { disabled: true })}
                  title="PDF + email goes live in Phase 1C"
                >
                  <Send size={16} /> Send to Vendor (1C)
                </button>
              )}
              {po.status === 'sent' && (
                <button
                  disabled
                  style={actionBtn('#16a34a', '#fff', { disabled: true })}
                  title="Receive shipment goes live in Phase 1D"
                >
                  <Package size={16} /> Receive Shipment (1D)
                </button>
              )}
              {po.status !== 'cancelled' && po.status !== 'closed' && (
                <button
                  onClick={cancelPo}
                  disabled={saving}
                  style={actionBtn('rgba(220,38,38,0.10)', '#dc2626')}
                >
                  <X size={16} /> Cancel PO
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Product picker modal */}
      {productPickerOpen && (
        <ProductPicker
          products={products}
          theme={theme}
          onPick={addLineFromProduct}
          onClose={() => setProductPickerOpen(false)}
          defaultVendorId={po.vendor_id}
        />
      )}
    </div>
  )
}

function ProductPicker({ products, theme, onPick, onClose, defaultVendorId }) {
  const [q, setQ] = useState('')
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase()
    let list = products
    // Prefer products from this vendor at the top
    list = [...list].sort((a, b) => {
      const aMatch = String(a.default_vendor_id) === String(defaultVendorId) ? -1 : 0
      const bMatch = String(b.default_vendor_id) === String(defaultVendorId) ? -1 : 0
      return aMatch - bMatch
    })
    if (!term) return list.slice(0, 100)
    return list.filter(p =>
      [p.name, p.item_id, p.vendor_sku].filter(Boolean).some(s => String(s).toLowerCase().includes(term))
    ).slice(0, 200)
  }, [products, q, defaultVendorId])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: theme.bgCard, borderRadius: 12,
          border: `1px solid ${theme.border}`, padding: 18,
          width: '100%', maxWidth: 560, maxHeight: '80vh',
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, color: theme.text, margin: 0 }}>Add from Catalog</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted }}>
            <X size={20} />
          </button>
        </div>
        <input
          type="text" autoFocus placeholder="Search by name, item ID, vendor SKU…"
          value={q} onChange={(e) => setQ(e.target.value)}
          style={{
            width: '100%', padding: '10px 12px',
            border: `1px solid ${theme.border}`, borderRadius: 8,
            backgroundColor: theme.bg, color: theme.text, fontSize: 14, outline: 'none',
            marginBottom: 10,
          }}
        />
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {filtered.map(p => {
            const isPreferred = String(p.default_vendor_id) === String(defaultVendorId)
            return (
              <button
                key={p.id}
                onClick={() => onPick(p)}
                style={{
                  width: '100%', textAlign: 'left',
                  padding: '8px 10px', borderRadius: 8,
                  backgroundColor: 'transparent', border: 'none', cursor: 'pointer',
                  borderBottom: `1px solid ${theme.border}`,
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.bgCardHover}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>
                    {p.name}
                    {isPreferred && (
                      <span style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 8, fontSize: 9, fontWeight: 700, backgroundColor: 'rgba(34,197,94,0.15)', color: '#16a34a' }}>
                        VENDOR
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: theme.textMuted }}>
                    {p.item_id} {p.vendor_sku ? `· SKU ${p.vendor_sku}` : ''}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: theme.textSecondary, whiteSpace: 'nowrap' }}>
                  cost {formatCurrency(p.cost)}
                </div>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const Label = ({ children, theme }) => (
  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: theme.textSecondary, marginBottom: 6 }}>
    {children}
  </label>
)
const Row = ({ label, value, valueNode, theme }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, marginBottom: 6 }}>
    <span style={{ color: theme.textSecondary }}>{label}</span>
    {valueNode || <span style={{ fontWeight: 500, color: theme.text }}>{value}</span>}
  </div>
)
const selectStyle = (theme) => ({
  width: '100%', padding: '8px 10px',
  border: `1px solid ${theme.border}`, borderRadius: 6,
  backgroundColor: theme.bgCard, color: theme.text, fontSize: 13, outline: 'none',
})
const inlineInput = (theme) => ({
  padding: '6px 8px', border: `1px solid ${theme.border}`, borderRadius: 6,
  backgroundColor: theme.bg, color: theme.text, fontSize: 13, outline: 'none', width: '100%',
})
const textareaStyle = (theme) => ({
  width: '100%', padding: '8px 10px',
  border: `1px solid ${theme.border}`, borderRadius: 6,
  backgroundColor: theme.bgCard, color: theme.text, fontSize: 13, outline: 'none', resize: 'vertical',
  fontFamily: 'inherit',
})
const readonlyText = (theme) => ({ fontSize: 14, color: theme.text, margin: 0, whiteSpace: 'pre-wrap' })
const actionBtn = (bg, color, opts = {}) => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '10px 14px', backgroundColor: bg, color, border: 'none', borderRadius: 8,
  fontSize: 13, fontWeight: 600, cursor: opts.disabled ? 'not-allowed' : 'pointer',
  opacity: opts.disabled ? 0.5 : 1,
})
