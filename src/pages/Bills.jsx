// Accounts Payable — list of vendor bills with aging buckets,
// search, vendor filter, and "Add Bill" for standalone bills (no PO).

import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import { Plus, Search, FileText, Building2, AlertCircle } from 'lucide-react'
import { useIsMobile } from '../hooks/useIsMobile'
import PageHeader from '../components/PageHeader'
import { formatCurrency } from '../lib/poUtils'

const defaultTheme = {
  bg: '#f7f5ef', bgCard: '#ffffff', bgCardHover: '#eef2eb',
  border: '#d6cdb8', text: '#2c3530', textSecondary: '#4d5a52',
  textMuted: '#7d8a7f', accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)'
}

const STATUS_LABELS = {
  open:    { label: 'Open',    color: '#3b82f6', bg: 'rgba(59,130,246,0.12)' },
  partial: { label: 'Partial', color: '#a16207', bg: 'rgba(234,179,8,0.15)' },
  paid:    { label: 'Paid',    color: '#16a34a', bg: 'rgba(34,197,94,0.12)' },
  void:    { label: 'Void',    color: '#7d8a7f', bg: 'rgba(125,138,127,0.15)' },
}

const STATUS_FILTERS = [
  { id: 'open',    label: 'Open' },
  { id: 'overdue', label: 'Overdue' },
  { id: 'partial', label: 'Partial' },
  { id: 'paid',    label: 'Paid' },
  { id: 'all',     label: 'All' },
]

function ageOf(bill, today) {
  if (!bill.due_date) return 0
  const due = new Date(bill.due_date)
  if (isNaN(due.getTime())) return 0
  return Math.floor((today - due) / 86400000)
}

function bucketize(bills, today) {
  const buckets = { current: 0, b30: 0, b60: 0, b90: 0, b90plus: 0 }
  for (const b of bills) {
    if (b.status === 'paid' || b.status === 'void') continue
    const bal = parseFloat(b.balance_due) || 0
    if (bal <= 0) continue
    const age = ageOf(b, today)
    if (age <= 0) buckets.current += bal
    else if (age <= 30) buckets.b30 += bal
    else if (age <= 60) buckets.b60 += bal
    else if (age <= 90) buckets.b90 += bal
    else buckets.b90plus += bal
  }
  return buckets
}

export default function Bills() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const companyId = useStore((s) => s.companyId)
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  const [bills, setBills] = useState([])
  const [vendors, setVendors] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('open')
  const [vendorFilter, setVendorFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)

  useEffect(() => {
    if (!companyId) { navigate('/'); return }
    fetchAll()
  }, [companyId])

  const fetchAll = async () => {
    setLoading(true)
    const [bRes, vRes] = await Promise.all([
      supabase.from('bills')
        .select('*, vendor:vendors(id, name), po:purchase_orders(id, po_number)')
        .eq('company_id', companyId)
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(500),
      supabase.from('vendors').select('id, name').eq('company_id', companyId)
        .eq('active', true).order('name'),
    ])
    setBills(bRes.data || [])
    setVendors(vRes.data || [])
    setLoading(false)
  }

  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d }, [])
  const aging = useMemo(() => bucketize(bills, today), [bills, today])

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return (bills || []).filter(b => {
      if (statusFilter === 'open' && b.status !== 'open' && b.status !== 'partial') return false
      if (statusFilter === 'overdue') {
        if (b.status === 'paid' || b.status === 'void') return false
        if (ageOf(b, today) <= 0) return false
      }
      if (statusFilter === 'partial' && b.status !== 'partial') return false
      if (statusFilter === 'paid' && b.status !== 'paid') return false
      if (vendorFilter !== 'all' && String(b.vendor_id) !== String(vendorFilter)) return false
      if (!term) return true
      return [b.bill_number, b.vendor?.name, b.po?.po_number, b.notes]
        .filter(Boolean).some(s => String(s).toLowerCase().includes(term))
    })
  }, [bills, statusFilter, vendorFilter, searchTerm, today])

  if (loading) return <div style={{ padding: 24, color: theme.textMuted }}>Loading bills…</div>

  return (
    <div style={{ padding: isMobile ? '16px' : '24px' }}>
      <PageHeader
        title="Bills"
        subtitle="Accounts Payable — bills you owe vendors"
        icon={FileText}
      />

      {/* AP Aging snapshot */}
      <div style={{
        display: 'grid', gap: 10, marginBottom: 16,
        gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(5, 1fr)',
      }}>
        <AgingCard label="Current" amount={aging.current} color="#16a34a" theme={theme} />
        <AgingCard label="1–30 days" amount={aging.b30} color="#3b82f6" theme={theme} />
        <AgingCard label="31–60 days" amount={aging.b60} color="#a16207" theme={theme} />
        <AgingCard label="61–90 days" amount={aging.b90} color="#ea580c" theme={theme} />
        <AgingCard label="90+ days" amount={aging.b90plus} color="#dc2626" theme={theme} />
      </div>

      {/* Status filter pills */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {STATUS_FILTERS.map(s => {
          let count
          if (s.id === 'open') count = bills.filter(b => b.status === 'open' || b.status === 'partial').length
          else if (s.id === 'overdue') count = bills.filter(b => b.status !== 'paid' && b.status !== 'void' && ageOf(b, today) > 0).length
          else if (s.id === 'all') count = bills.length
          else count = bills.filter(b => b.status === s.id).length
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
            placeholder="Search bill #, vendor, PO #…"
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
          onClick={() => setShowAddModal(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '10px 16px', backgroundColor: theme.accent,
            color: '#fff', border: 'none', borderRadius: 8,
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}
        >
          <Plus size={16} />
          Add Bill
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
          {bills.length === 0
            ? 'No bills yet. Bills get created when you receive a PO, or you can add one manually.'
            : 'No bills match the current filters.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(bill => {
            const status = STATUS_LABELS[bill.status] || STATUS_LABELS.open
            const age = ageOf(bill, today)
            const overdue = age > 0 && bill.status !== 'paid' && bill.status !== 'void'
            return (
              <div
                key={bill.id}
                onClick={() => navigate(`/bills/${bill.id}`)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: isMobile ? '1fr' : 'auto 1fr auto auto auto auto',
                  gap: 12, alignItems: 'center',
                  padding: '14px 16px',
                  backgroundColor: theme.bgCard,
                  border: `1px solid ${overdue ? '#dc2626' : theme.border}`,
                  borderRadius: 10, cursor: 'pointer',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.bgCardHover}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = theme.bgCard}
              >
                <div style={{
                  fontFamily: 'monospace', fontSize: 13, fontWeight: 600,
                  color: theme.text, minWidth: 120,
                }}>
                  {bill.bill_number || `Bill #${bill.id}`}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600, color: theme.text }}>
                    <Building2 size={13} style={{ color: theme.textMuted, flexShrink: 0 }} />
                    {bill.vendor?.name || '(no vendor)'}
                    {bill.po && (
                      <span style={{
                        marginLeft: 6, padding: '1px 6px', borderRadius: 8,
                        fontSize: 10, fontWeight: 600,
                        backgroundColor: theme.accentBg, color: theme.accent,
                      }}>
                        {bill.po.po_number}
                      </span>
                    )}
                  </div>
                  {bill.due_date && (
                    <div style={{ fontSize: 11, color: overdue ? '#dc2626' : theme.textMuted, marginTop: 2 }}>
                      Due {new Date(bill.due_date).toLocaleDateString()}
                      {overdue && ` · ${age} day${age === 1 ? '' : 's'} overdue`}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: 'right', minWidth: 90 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: theme.text }}>
                    {formatCurrency(bill.amount)}
                  </div>
                  {parseFloat(bill.balance_due) > 0 && parseFloat(bill.balance_due) !== parseFloat(bill.amount) && (
                    <div style={{ fontSize: 11, color: '#a16207' }}>
                      {formatCurrency(bill.balance_due)} due
                    </div>
                  )}
                </div>
                <div style={{ minWidth: 80, textAlign: 'right' }}>
                  <span style={{
                    padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                    backgroundColor: status.bg, color: status.color,
                  }}>
                    {status.label}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: theme.textMuted, minWidth: 80, textAlign: 'right' }}>
                  {bill.bill_date && new Date(bill.bill_date).toLocaleDateString()}
                </div>
                {overdue && <AlertCircle size={16} style={{ color: '#dc2626' }} />}
              </div>
            )
          })}
        </div>
      )}

      {showAddModal && (
        <AddBillModal
          theme={theme}
          companyId={companyId}
          vendors={vendors}
          onClose={() => setShowAddModal(false)}
          onCreated={(billId) => {
            setShowAddModal(false)
            navigate(`/bills/${billId}`)
          }}
        />
      )}
    </div>
  )
}

function AgingCard({ label, amount, color, theme }) {
  return (
    <div style={{
      padding: '12px 14px', borderRadius: 10,
      backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`,
    }}>
      <div style={{ fontSize: 10, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: amount > 0 ? color : theme.text, marginTop: 4 }}>
        {formatCurrency(amount)}
      </div>
    </div>
  )
}

function AddBillModal({ theme, companyId, vendors, onClose, onCreated }) {
  const [form, setForm] = useState({
    vendor_id: vendors[0]?.id || '',
    bill_number: '',
    amount: '',
    bill_date: new Date().toISOString().slice(0, 10),
    due_date: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)

  const save = async () => {
    if (!form.vendor_id) { toast.error('Pick a vendor'); return }
    const amt = parseFloat(form.amount) || 0
    if (amt <= 0) { toast.error('Amount must be > 0'); return }
    setSaving(true)
    const { data, error } = await supabase
      .from('bills')
      .insert({
        company_id: companyId,
        vendor_id: parseInt(form.vendor_id),
        bill_number: form.bill_number || null,
        amount: amt,
        balance_due: amt,
        bill_date: form.bill_date || new Date().toISOString().slice(0, 10),
        due_date: form.due_date || null,
        status: 'open',
        notes: form.notes || null,
      })
      .select().single()
    if (error) {
      toast.error('Save failed: ' + error.message)
    } else {
      toast.success(`Bill ${data.bill_number || '#' + data.id} created`)
      onCreated(data.id)
    }
    setSaving(false)
  }

  return (
    <div
      onClick={() => !saving && onClose()}
      style={{
        position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 16,
      }}
    >
      <div onClick={(e) => e.stopPropagation()} style={{
        backgroundColor: theme.bgCard, borderRadius: 12,
        border: `1px solid ${theme.border}`, padding: 22,
        width: '100%', maxWidth: 480,
      }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, color: theme.text, margin: '0 0 16px' }}>
          New Bill
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Field theme={theme} label="Vendor *">
            <select
              value={form.vendor_id}
              onChange={(e) => setForm(f => ({ ...f, vendor_id: e.target.value }))}
              style={inputStyle(theme)}
            >
              <option value="">— Pick a vendor —</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </Field>
          <Field theme={theme} label="Bill # (vendor's invoice number)">
            <input type="text" value={form.bill_number}
              onChange={(e) => setForm(f => ({ ...f, bill_number: e.target.value }))}
              style={inputStyle(theme)} />
          </Field>
          <Field theme={theme} label="Amount *">
            <input type="number" step="0.01" value={form.amount}
              onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))}
              style={inputStyle(theme)} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field theme={theme} label="Bill date">
              <input type="date" value={form.bill_date}
                onChange={(e) => setForm(f => ({ ...f, bill_date: e.target.value }))}
                style={inputStyle(theme)} />
            </Field>
            <Field theme={theme} label="Due date">
              <input type="date" value={form.due_date}
                onChange={(e) => setForm(f => ({ ...f, due_date: e.target.value }))}
                style={inputStyle(theme)} />
            </Field>
          </div>
          <Field theme={theme} label="Notes">
            <textarea value={form.notes} rows={2}
              onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
              style={{ ...inputStyle(theme), resize: 'vertical', fontFamily: 'inherit' }} />
          </Field>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button onClick={onClose} disabled={saving} style={{
            flex: 1, padding: 12, border: `1px solid ${theme.border}`,
            backgroundColor: 'transparent', color: theme.text, borderRadius: 8, fontSize: 14,
            cursor: saving ? 'not-allowed' : 'pointer',
          }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{
            flex: 1, padding: 12, backgroundColor: theme.accent, color: '#fff',
            border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.6 : 1,
          }}>{saving ? 'Saving…' : 'Create Bill'}</button>
        </div>
      </div>
    </div>
  )
}

const Field = ({ label, children, theme }) => (
  <div>
    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: theme.textSecondary, marginBottom: 6 }}>
      {label}
    </label>
    {children}
  </div>
)
const inputStyle = (theme) => ({
  width: '100%', padding: '10px 12px',
  border: `1px solid ${theme.border}`, borderRadius: 8,
  backgroundColor: theme.bgCard, color: theme.text, fontSize: 14, outline: 'none',
})
