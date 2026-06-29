import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import { Plus, Search, FileText, Building2, Briefcase } from 'lucide-react'
import { useIsMobile } from '../hooks/useIsMobile'
import PageHeader from '../components/PageHeader'
import { PO_STATUS_LABELS, generatePoNumber, formatCurrency } from '../lib/poUtils'

const defaultTheme = {
  bg: '#f7f5ef', bgCard: '#ffffff', bgCardHover: '#eef2eb',
  border: '#d6cdb8', text: '#2c3530', textSecondary: '#4d5a52',
  textMuted: '#7d8a7f', accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)'
}

const STATUS_FILTERS = [
  { id: 'all',              label: 'All' },
  { id: 'draft',            label: 'Draft' },
  { id: 'sent',             label: 'Sent' },
  { id: 'partial_received', label: 'Partial' },
  { id: 'received',         label: 'Received' },
  { id: 'closed',           label: 'Closed' },
]

export default function PurchaseOrders() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const companyId = useStore((s) => s.companyId)
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  const [pos, setPos] = useState([])
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [vendorFilter, setVendorFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!companyId) { navigate('/'); return }
    fetchData()
  }, [companyId])

  const fetchData = async () => {
    setLoading(true)
    const [poRes, vRes] = await Promise.all([
      supabase.from('purchase_orders')
        .select('*, vendor:vendors(id, name), job:jobs(id, job_id, job_title)')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(500),
      supabase.from('vendors').select('id, name').eq('company_id', companyId)
        .eq('active', true).order('name'),
    ])
    setPos(poRes.data || [])
    setVendors(vRes.data || [])
    setLoading(false)
  }

  // Create a blank draft PO + go straight to detail page. Vendor picker
  // happens on the detail page so user can also add lines in one place.
  const createDraftPo = async () => {
    setCreating(true)
    try {
      if (!vendors.length) {
        toast.error('Add a vendor first — go to Vendors and create one.')
        setCreating(false); return
      }
      const poNumber = await generatePoNumber(companyId)
      const { data, error } = await supabase
        .from('purchase_orders')
        .insert({
          company_id: companyId,
          po_number: poNumber,
          vendor_id: vendors[0].id,  // default to first vendor — user can change
          status: 'draft',
          subtotal: 0, tax: 0, shipping: 0, total: 0,
        })
        .select().single()
      if (error) throw error
      toast.success(`Draft ${poNumber} created`)
      navigate(`/purchase-orders/${data.id}`)
    } catch (err) {
      toast.error('Could not create draft PO: ' + err.message)
    }
    setCreating(false)
  }

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return (pos || []).filter(p => {
      if (statusFilter !== 'all' && p.status !== statusFilter) return false
      if (vendorFilter !== 'all' && String(p.vendor_id) !== String(vendorFilter)) return false
      if (!term) return true
      return [p.po_number, p.vendor?.name, p.job?.job_id, p.job?.job_title, p.notes]
        .filter(Boolean).some(s => String(s).toLowerCase().includes(term))
    })
  }, [pos, statusFilter, vendorFilter, searchTerm])

  // Group the POs by job — a bundle splits into one PO per vendor, so a job
  // usually has several POs; showing each job in its own box keeps them
  // together instead of scattered through a flat date-sorted list.
  const groupedByJob = useMemo(() => {
    const map = new Map()
    for (const po of filtered) {
      const key = po.job?.id ?? 'none'
      if (!map.has(key)) map.set(key, { job: po.job || null, pos: [], total: 0, latest: 0 })
      const g = map.get(key)
      g.pos.push(po)
      g.total += Number(po.total) || 0
      const t = new Date(po.created_at).getTime()
      if (t > g.latest) g.latest = t
    }
    // Most-recently-active jobs first; no-job bucket last.
    return [...map.values()].sort((a, b) => {
      if (!a.job) return 1
      if (!b.job) return -1
      return b.latest - a.latest
    })
  }, [filtered])

  if (loading) {
    return <div style={{ padding: 24, color: theme.textMuted }}>Loading purchase orders…</div>
  }

  return (
    <div style={{ padding: isMobile ? '16px' : '24px' }}>
      <PageHeader
        title="Purchase Orders"
        subtitle="Orders sent to vendors for parts and materials"
        icon={FileText}
      />

      {/* Status pills */}
      <div style={{
        display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap',
      }}>
        {STATUS_FILTERS.map(s => {
          const count = s.id === 'all'
            ? pos.length
            : pos.filter(p => p.status === s.id).length
          const active = statusFilter === s.id
          return (
            <button
              key={s.id}
              onClick={() => setStatusFilter(s.id)}
              style={{
                padding: '6px 12px', borderRadius: 16,
                backgroundColor: active ? theme.accent : theme.bgCard,
                color: active ? '#fff' : theme.textSecondary,
                border: `1px solid ${active ? theme.accent : theme.border}`,
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {s.label} {count > 0 && <span style={{ opacity: 0.75 }}>· {count}</span>}
            </button>
          )
        })}
      </div>

      {/* Toolbar */}
      <div style={{
        display: 'flex', gap: 12, flexWrap: 'wrap',
        alignItems: 'center', marginBottom: 16,
      }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
          <Search size={16} style={{
            position: 'absolute', left: 12, top: '50%',
            transform: 'translateY(-50%)', color: theme.textMuted,
          }} />
          <input
            type="text"
            placeholder="Search PO #, vendor, job…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%', padding: '10px 12px 10px 36px',
              border: `1px solid ${theme.border}`, borderRadius: 8,
              backgroundColor: theme.bgCard, color: theme.text, fontSize: 14,
              outline: 'none',
            }}
          />
        </div>
        <select
          value={vendorFilter}
          onChange={(e) => setVendorFilter(e.target.value)}
          style={{
            padding: '10px 12px', borderRadius: 8,
            border: `1px solid ${theme.border}`,
            backgroundColor: theme.bgCard, color: theme.text, fontSize: 14,
          }}
        >
          <option value="all">All vendors</option>
          {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
        <button
          onClick={createDraftPo}
          disabled={creating}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '10px 16px', backgroundColor: theme.accent,
            color: '#fff', border: 'none', borderRadius: 8,
            fontSize: 14, fontWeight: 600,
            cursor: creating ? 'not-allowed' : 'pointer',
            opacity: creating ? 0.6 : 1,
          }}
        >
          <Plus size={16} />
          {creating ? 'Creating…' : 'New PO'}
        </button>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div style={{
          padding: 32, textAlign: 'center',
          backgroundColor: theme.bgCard,
          border: `1px dashed ${theme.border}`, borderRadius: 12,
          color: theme.textMuted,
        }}>
          {pos.length === 0
            ? 'No purchase orders yet. Click "New PO" to create your first one.'
            : 'No POs match the current filters.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {groupedByJob.map(group => {
            const j = group.job
            return (
              <div key={j?.id ?? 'none'} style={{
                backgroundColor: theme.bgCard,
                border: `1px solid ${theme.border}`, borderRadius: 12,
                overflow: 'hidden',
              }}>
                {/* Job header — the box title */}
                <div
                  onClick={() => j && navigate(`/jobs/${j.id}`)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 8, padding: '12px 16px',
                    backgroundColor: theme.bgCardHover,
                    borderBottom: `1px solid ${theme.border}`,
                    cursor: j ? 'pointer' : 'default',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <Briefcase size={15} style={{ color: theme.accent, flexShrink: 0 }} />
                    <span style={{ fontSize: 14, fontWeight: 700, color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {j ? (j.job_title || j.job_id) : 'No job assigned'}
                    </span>
                    {j?.job_id && (
                      <span style={{ fontSize: 11, color: theme.textMuted, fontFamily: 'monospace', flexShrink: 0 }}>{j.job_id}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: theme.textMuted, fontWeight: 600, flexShrink: 0, whiteSpace: 'nowrap' }}>
                    {group.pos.length} PO{group.pos.length !== 1 ? 's' : ''} · {formatCurrency(group.total)}
                  </div>
                </div>
                {/* PO rows for this job */}
                {group.pos.map((po, i) => {
                  const status = PO_STATUS_LABELS[po.status] || PO_STATUS_LABELS.draft
                  return (
                    <div
                      key={po.id}
                      onClick={() => navigate(`/purchase-orders/${po.id}`)}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: isMobile ? '1fr' : 'auto 1fr auto auto auto',
                        gap: 12, alignItems: 'center',
                        padding: '12px 16px',
                        borderTop: i > 0 ? `1px solid ${theme.border}` : 'none',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.bgCardHover}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <div style={{ fontFamily: 'monospace', fontSize: 13, fontWeight: 600, color: theme.text, minWidth: 110 }}>
                        {po.po_number}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: theme.text, minWidth: 0 }}>
                        <Building2 size={13} style={{ color: theme.textMuted, flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {po.vendor?.name || '(no vendor)'}
                        </span>
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: theme.text, textAlign: 'right', minWidth: 90 }}>
                        {formatCurrency(po.total)}
                      </div>
                      <div style={{ minWidth: 80, textAlign: 'right' }}>
                        <span style={{ padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600, backgroundColor: status.bg, color: status.color }}>
                          {status.label}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: theme.textMuted, minWidth: 80, textAlign: 'right' }}>
                        {new Date(po.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
