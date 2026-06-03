// Bill detail — vendor info, totals, payment history, "Record Payment"
// button. Bills can be linked to a PO (auto-created from PO receive)
// or standalone.

import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import useSmartBack from '../lib/useSmartBack'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { toast } from '../lib/toast'
import { ArrowLeft, DollarSign, Building2, FileText, X, Pencil, Trash2 } from 'lucide-react'
import { useIsMobile } from '../hooks/useIsMobile'
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

export default function BillDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const goBack = useSmartBack('/bills')
  const isMobile = useIsMobile()
  const companyId = useStore((s) => s.companyId)
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  const [bill, setBill] = useState(null)
  const [payments, setPayments] = useState([])
  const [bankAccounts, setBankAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [payOpen, setPayOpen] = useState(false)

  useEffect(() => {
    if (!companyId) { navigate('/'); return }
    fetchAll()
  }, [companyId, id])

  const fetchAll = async () => {
    setLoading(true)
    const [bRes, pRes, baRes] = await Promise.all([
      supabase.from('bills')
        .select('*, vendor:vendors(id, name, contact_name, email, phone, default_payment_terms), po:purchase_orders(id, po_number)')
        .eq('id', id).eq('company_id', companyId).maybeSingle(),
      supabase.from('bill_payments').select('*').eq('bill_id', id).order('paid_at', { ascending: false }),
      supabase.from('bank_accounts').select('id, name').eq('company_id', companyId),
    ])
    setBill(bRes.data || null)
    setPayments(pRes.data || [])
    setBankAccounts(baRes.data || [])
    setLoading(false)
  }

  const totalPaid = useMemo(
    () => (payments || []).reduce((s, p) => s + (parseFloat(p.amount) || 0), 0),
    [payments]
  )

  if (loading) return <div style={{ padding: 24, color: theme.textMuted }}>Loading bill…</div>
  if (!bill) return (
    <div style={{ padding: 24 }}>
      <p style={{ color: '#dc2626' }}>Bill not found.</p>
      <button onClick={() => navigate('/bills')} style={{
        color: theme.accent, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer',
      }}>← Back to Bills</button>
    </div>
  )

  const status = STATUS_LABELS[bill.status] || STATUS_LABELS.open

  const voidBill = async () => {
    if (!confirm('Void this bill? It will no longer count toward AP totals.')) return
    await supabase.from('bills').update({
      status: 'void', updated_at: new Date().toISOString(),
    }).eq('id', id)
    toast.success('Bill voided')
    fetchAll()
  }

  return (
    <div style={{ padding: isMobile ? 16 : 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <button onClick={goBack} style={{
          padding: 10, backgroundColor: theme.bgCard,
          border: `1px solid ${theme.border}`, borderRadius: 8,
          cursor: 'pointer', color: theme.textSecondary,
        }}>
          <ArrowLeft size={20} />
        </button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 12, color: theme.textMuted, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, margin: 0 }}>
            Bill
          </p>
          <h1 style={{ fontSize: isMobile ? 22 : 26, fontWeight: 700, color: theme.text, margin: 0, fontFamily: 'monospace' }}>
            {bill.bill_number || `Bill #${bill.id}`}
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
        {/* Main */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Vendor + dates */}
          <div style={{
            backgroundColor: theme.bgCard,
            border: `1px solid ${theme.border}`, borderRadius: 12,
            padding: 18,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Building2 size={18} style={{ color: theme.accent }} />
              <span style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>
                {bill.vendor?.name || '(no vendor)'}
              </span>
              {bill.po && (
                <button
                  onClick={() => navigate(`/purchase-orders/${bill.po.id}`)}
                  style={{
                    marginLeft: 'auto', padding: '4px 10px', borderRadius: 6,
                    backgroundColor: theme.accentBg, color: theme.accent,
                    border: 'none', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  View PO {bill.po.po_number}
                </button>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 14 }}>
              <Info theme={theme} label="Bill date" value={bill.bill_date && new Date(bill.bill_date).toLocaleDateString()} />
              <Info theme={theme} label="Due date" value={bill.due_date && new Date(bill.due_date).toLocaleDateString()} />
              <Info theme={theme} label="Terms" value={bill.vendor?.default_payment_terms} />
            </div>
            {bill.notes && (
              <div style={{ marginTop: 14, fontSize: 13, color: theme.textSecondary, whiteSpace: 'pre-wrap' }}>
                <strong style={{ color: theme.text }}>Notes:</strong> {bill.notes}
              </div>
            )}
          </div>

          {/* Payments */}
          <div style={{
            backgroundColor: theme.bgCard,
            border: `1px solid ${theme.border}`, borderRadius: 12,
            padding: 18,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: theme.text, margin: 0 }}>
                Payments ({payments.length})
              </h3>
              {bill.status !== 'paid' && bill.status !== 'void' && (
                <button
                  onClick={() => setPayOpen(true)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 14px', backgroundColor: theme.accent, color: '#fff',
                    border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  <DollarSign size={14} /> Record Payment
                </button>
              )}
            </div>
            {payments.length === 0 ? (
              <p style={{ color: theme.textMuted, fontSize: 13, fontStyle: 'italic', margin: 0 }}>
                No payments yet.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {payments.map(p => (
                  <div key={p.id} style={{
                    display: 'grid', gridTemplateColumns: '1fr auto auto auto', gap: 12,
                    padding: '10px 12px', alignItems: 'center',
                    backgroundColor: theme.bg, borderRadius: 8,
                    border: `1px solid ${theme.border}`,
                  }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>
                        {p.method}
                      </div>
                      {p.reference && (
                        <div style={{ fontSize: 11, color: theme.textMuted }}>
                          Ref: {p.reference}
                        </div>
                      )}
                      {p.notes && (
                        <div style={{ fontSize: 11, color: theme.textMuted }}>{p.notes}</div>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: theme.textMuted }}>
                      {new Date(p.paid_at).toLocaleDateString()}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#16a34a' }}>
                      {formatCurrency(p.amount)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{
            backgroundColor: theme.bgCard,
            border: `1px solid ${theme.border}`, borderRadius: 12,
            padding: 18,
          }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, color: theme.text, margin: '0 0 14px' }}>
              Totals
            </h3>
            <Row label="Bill amount" value={formatCurrency(bill.amount)} theme={theme} />
            <Row label="Paid" value={formatCurrency(totalPaid)} color="#16a34a" theme={theme} />
            <div style={{
              marginTop: 10, paddingTop: 10, borderTop: `1px solid ${theme.border}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: theme.text }}>Balance Due</span>
              <span style={{
                fontSize: 20, fontWeight: 700,
                color: parseFloat(bill.balance_due) > 0 ? '#c28b38' : '#16a34a',
              }}>
                {formatCurrency(bill.balance_due)}
              </span>
            </div>
          </div>

          {bill.status !== 'void' && (
            <div style={{
              backgroundColor: theme.bgCard,
              border: `1px solid ${theme.border}`, borderRadius: 12,
              padding: 18,
            }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, color: theme.text, margin: '0 0 14px' }}>
                Actions
              </h3>
              <button onClick={voidBill} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                width: '100%', padding: '10px 14px',
                backgroundColor: 'rgba(220,38,38,0.10)', color: '#dc2626',
                border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>
                <X size={16} /> Void Bill
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Pay modal */}
      {payOpen && (
        <PayModal
          bill={bill}
          bankAccounts={bankAccounts}
          theme={theme}
          companyId={companyId}
          onClose={() => setPayOpen(false)}
          onSaved={async () => { setPayOpen(false); await fetchAll() }}
        />
      )}
    </div>
  )
}

function PayModal({ bill, bankAccounts, theme, companyId, onClose, onSaved }) {
  const [form, setForm] = useState({
    amount: bill.balance_due,
    method: 'Check',
    paid_at: new Date().toISOString().slice(0, 10),
    reference: '',
    notes: '',
    bank_account_id: bankAccounts[0]?.id || '',
  })
  const [saving, setSaving] = useState(false)

  const save = async () => {
    const amt = parseFloat(form.amount) || 0
    if (amt <= 0) { toast.error('Enter an amount'); return }
    if (amt > parseFloat(bill.balance_due) + 0.01) {
      if (!confirm(`Payment ${formatCurrency(amt)} exceeds balance ${formatCurrency(bill.balance_due)}. Continue anyway?`)) return
    }
    setSaving(true)
    try {
      await supabase.from('bill_payments').insert({
        company_id: companyId,
        bill_id: bill.id,
        amount: amt,
        method: form.method,
        paid_at: `${form.paid_at}T12:00:00.000Z`,
        reference: form.reference || null,
        notes: form.notes || null,
        bank_account_id: form.bank_account_id ? parseInt(form.bank_account_id) : null,
      })
      // Recompute balance + status
      const newBalance = Math.max(0, parseFloat(bill.balance_due) - amt)
      const newStatus = newBalance <= 0.005 ? 'paid' : 'partial'
      await supabase.from('bills').update({
        balance_due: newBalance,
        status: newStatus,
        updated_at: new Date().toISOString(),
      }).eq('id', bill.id)
      toast.success(`Recorded ${formatCurrency(amt)} payment`)
      onSaved()
    } catch (err) {
      toast.error('Payment failed: ' + err.message)
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
        width: '100%', maxWidth: 460,
      }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, color: theme.text, margin: '0 0 4px' }}>
          Record Payment
        </h3>
        <p style={{ fontSize: 12, color: theme.textMuted, margin: '0 0 14px' }}>
          {bill.vendor?.name} · Balance {formatCurrency(bill.balance_due)}
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <PField theme={theme} label="Amount *">
              <input type="number" step="0.01" value={form.amount}
                onChange={(e) => setForm(f => ({ ...f, amount: e.target.value }))}
                style={pInput(theme)} />
            </PField>
            <PField theme={theme} label="Method">
              <select value={form.method}
                onChange={(e) => setForm(f => ({ ...f, method: e.target.value }))}
                style={pInput(theme)}>
                {['Check', 'ACH', 'Card', 'Cash', 'Wire', 'Other'].map(m => <option key={m}>{m}</option>)}
              </select>
            </PField>
          </div>
          <PField theme={theme} label="Paid date">
            <input type="date" value={form.paid_at}
              onChange={(e) => setForm(f => ({ ...f, paid_at: e.target.value }))}
              style={pInput(theme)} />
          </PField>
          <PField theme={theme} label="Reference (check #, ACH ref, etc.)">
            <input type="text" value={form.reference}
              onChange={(e) => setForm(f => ({ ...f, reference: e.target.value }))}
              style={pInput(theme)} />
          </PField>
          {bankAccounts.length > 0 && (
            <PField theme={theme} label="Bank account (optional)">
              <select value={form.bank_account_id}
                onChange={(e) => setForm(f => ({ ...f, bank_account_id: e.target.value }))}
                style={pInput(theme)}>
                <option value="">— None —</option>
                {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </PField>
          )}
          <PField theme={theme} label="Notes">
            <input type="text" value={form.notes}
              onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))}
              style={pInput(theme)} />
          </PField>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button onClick={onClose} disabled={saving} style={{
            flex: 1, padding: 12, border: `1px solid ${theme.border}`,
            backgroundColor: 'transparent', color: theme.text, borderRadius: 8, fontSize: 14,
            cursor: saving ? 'not-allowed' : 'pointer',
          }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{
            flex: 1, padding: 12, backgroundColor: '#16a34a', color: '#fff',
            border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer',
            opacity: saving ? 0.6 : 1,
          }}>{saving ? 'Saving…' : 'Save Payment'}</button>
        </div>
      </div>
    </div>
  )
}

const Info = ({ label, value, theme }) => (
  <div>
    <div style={{ fontSize: 11, color: theme.textMuted, marginBottom: 4 }}>{label}</div>
    <div style={{ fontSize: 14, fontWeight: 500, color: theme.text }}>{value || '—'}</div>
  </div>
)
const Row = ({ label, value, color, theme }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, marginBottom: 6 }}>
    <span style={{ color: theme.textSecondary }}>{label}</span>
    <span style={{ fontWeight: 500, color: color || theme.text }}>{value}</span>
  </div>
)
const PField = ({ label, children, theme }) => (
  <div>
    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: theme.textSecondary, marginBottom: 6 }}>
      {label}
    </label>
    {children}
  </div>
)
const pInput = (theme) => ({
  width: '100%', padding: '10px 12px',
  border: `1px solid ${theme.border}`, borderRadius: 8,
  backgroundColor: theme.bgCard, color: theme.text, fontSize: 14, outline: 'none',
})
