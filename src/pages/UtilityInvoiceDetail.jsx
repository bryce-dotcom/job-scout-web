import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { ArrowLeft, CheckCircle, Pencil, Trash2 } from 'lucide-react'
import { useIsMobile } from '../hooks/useIsMobile'
import { invoiceStatusColors as statusColors } from '../lib/statusColors'

const defaultTheme = {
  bg: '#f7f5ef',
  bgCard: '#ffffff',
  bgCardHover: '#eef2eb',
  border: '#d6cdb8',
  text: '#2c3530',
  textSecondary: '#4d5a52',
  textMuted: '#7d8a7f',
  accent: '#5a6349',
  accentBg: 'rgba(90,99,73,0.12)'
}

export default function UtilityInvoiceDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const companyId = useStore((state) => state.companyId)
  const fetchUtilityInvoices = useStore((state) => state.fetchUtilityInvoices)

  const [invoice, setInvoice] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({
    amount: '',
    utility_name: '',
    customer_name: '',
    notes: '',
    project_cost: '',
    incentive_amount: '',
    net_cost: ''
  })

  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchInvoiceData()
  }, [companyId, id, navigate])

  const fetchInvoiceData = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('utility_invoices')
      .select('*')
      .eq('id', id)
      .single()

    if (data) {
      setInvoice(data)
    }
    setLoading(false)
  }

  const markAsPaid = async () => {
    setSaving(true)
    await supabase.from('utility_invoices').update({
      payment_status: 'Paid',
      updated_at: new Date().toISOString()
    }).eq('id', id)
    await fetchInvoiceData()
    await fetchUtilityInvoices()
    setSaving(false)
  }

  const startEditing = () => {
    setEditForm({
      amount: invoice.amount || '',
      utility_name: invoice.utility_name || '',
      customer_name: invoice.customer_name || '',
      notes: invoice.notes || '',
      project_cost: invoice.project_cost || '',
      incentive_amount: invoice.incentive_amount || '',
      net_cost: invoice.net_cost || ''
    })
    setIsEditing(true)
  }

  const cancelEditing = () => {
    setIsEditing(false)
  }

  const saveEdits = async () => {
    setSaving(true)
    const { error } = await supabase.from('utility_invoices').update({
      amount: parseFloat(editForm.amount) || 0,
      utility_name: editForm.utility_name || null,
      customer_name: editForm.customer_name || null,
      notes: editForm.notes || null,
      project_cost: parseFloat(editForm.project_cost) || null,
      incentive_amount: parseFloat(editForm.incentive_amount) || null,
      net_cost: parseFloat(editForm.net_cost) || null,
      updated_at: new Date().toISOString()
    }).eq('id', id)

    const { toast } = await import('../lib/toast')
    if (error) {
      toast.error('Failed to save: ' + error.message)
    } else {
      toast.success('Utility incentive updated')
      setIsEditing(false)
      await fetchInvoiceData()
      await fetchUtilityInvoices()
    }
    setSaving(false)
  }

  const handleDeleteInvoice = async () => {
    if (!confirm('Are you sure you want to delete this utility incentive? This cannot be undone.')) return

    setSaving(true)
    const { toast } = await import('../lib/toast')
    const { error } = await supabase.from('utility_invoices').delete().eq('id', id)

    if (error) {
      toast.error('Failed to delete bill: ' + error.message)
      setSaving(false)
    } else {
      toast.success('Utility incentive deleted')
      await fetchUtilityInvoices()
      navigate('/invoices?type=utility')
    }
  }

  const formatCurrency = (amount) => {
    if (!amount) return '$0.00'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
  }

  const formatDate = (date) => {
    if (!date) return '-'
    return new Date(date).toLocaleDateString()
  }

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    border: `1px solid ${theme.border}`,
    borderRadius: '8px',
    fontSize: '14px',
    color: theme.text,
    backgroundColor: theme.bgCard,
    outline: 'none'
  }

  const labelStyle = {
    display: 'block',
    fontSize: '13px',
    fontWeight: '500',
    color: theme.textSecondary,
    marginBottom: '6px'
  }

  const actionBtnStyle = (bg, color) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '12px 16px',
    backgroundColor: bg,
    color: color,
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    width: '100%'
  })

  if (loading) {
    return (
      <div style={{ padding: '24px' }}>
        <p style={{ color: theme.textMuted }}>Loading utility incentive...</p>
      </div>
    )
  }

  if (!invoice) {
    return (
      <div style={{ padding: '24px' }}>
        <p style={{ color: '#dc2626', marginBottom: '16px' }}>Utility incentive not found</p>
        <button onClick={() => navigate('/invoices?type=utility')} style={{ color: theme.accent, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}>
          Back to Utility Incentives
        </button>
      </div>
    )
  }

  const statusStyle = statusColors[invoice.payment_status] || statusColors['Pending']

  return (
    <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '100%', overflowX: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '12px' : '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <button
          onClick={() => navigate('/invoices?type=utility')}
          style={{
            padding: '10px',
            backgroundColor: theme.bgCard,
            border: `1px solid ${theme.border}`,
            borderRadius: '8px',
            cursor: 'pointer',
            color: theme.textSecondary
          }}
        >
          <ArrowLeft size={20} />
        </button>
        <div style={{ flex: 1 }}>
          <p style={{ fontSize: '13px', color: theme.accent, fontWeight: '600' }}>
            UTL-{invoice.id}
          </p>
          <h1 style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: '700', color: theme.text }}>
            {invoice.customer_name || 'Utility Incentive'}
          </h1>
        </div>
        <span style={{
          padding: '6px 14px',
          borderRadius: '20px',
          fontSize: '13px',
          fontWeight: '500',
          backgroundColor: statusStyle.bg,
          color: statusStyle.text
        }}>
          {invoice.payment_status}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 360px', gap: isMobile ? '16px' : '24px' }}>
        {/* Main Content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Utility Info */}
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            padding: '20px'
          }}>
            <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '16px' }}>
              Utility Info
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
              <div>
                <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Utility Name</p>
                {isEditing ? (
                  <input
                    type="text"
                    value={editForm.utility_name}
                    onChange={(e) => setEditForm(prev => ({ ...prev, utility_name: e.target.value }))}
                    style={inputStyle}
                    placeholder="Utility name"
                  />
                ) : (
                  <p style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>{invoice.utility_name || '-'}</p>
                )}
              </div>
              <div>
                <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Customer Name</p>
                {isEditing ? (
                  <input
                    type="text"
                    value={editForm.customer_name}
                    onChange={(e) => setEditForm(prev => ({ ...prev, customer_name: e.target.value }))}
                    style={inputStyle}
                    placeholder="Customer name"
                  />
                ) : (
                  <p style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>{invoice.customer_name || '-'}</p>
                )}
              </div>
              <div>
                <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Date Created</p>
                <p style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>{formatDate(invoice.created_at)}</p>
              </div>
              <div>
                <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Last Updated</p>
                <p style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>{formatDate(invoice.updated_at)}</p>
              </div>
            </div>
          </div>

          {/* Job Link */}
          {invoice.job_id && (
            <div style={{
              backgroundColor: theme.bgCard,
              borderRadius: '12px',
              border: `1px solid ${theme.border}`,
              padding: '20px'
            }}>
              <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '16px' }}>
                Linked Job
              </h3>
              <div>
                <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Job ID</p>
                <button
                  onClick={() => navigate(`/jobs/${invoice.job_id}`)}
                  style={{ fontSize: '14px', fontWeight: '500', color: theme.accent, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  {invoice.job_id}
                </button>
              </div>
            </div>
          )}

          {/* Notes */}
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            padding: '20px'
          }}>
            <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '12px' }}>
              Notes
            </h3>
            {isEditing ? (
              <textarea
                value={editForm.notes}
                onChange={(e) => setEditForm(prev => ({ ...prev, notes: e.target.value }))}
                rows={3}
                style={{ ...inputStyle, resize: 'vertical' }}
                placeholder="Invoice notes..."
              />
            ) : (
              <p style={{ fontSize: '14px', color: theme.textSecondary }}>
                {invoice.notes || <span style={{ color: theme.textMuted, fontStyle: 'italic' }}>No notes</span>}
              </p>
            )}
          </div>

          {/* Edit Save/Cancel buttons */}
          {isEditing && (
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={cancelEditing}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  border: `1px solid ${theme.border}`,
                  backgroundColor: 'transparent',
                  color: theme.text,
                  borderRadius: '8px',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={saveEdits}
                disabled={saving}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  backgroundColor: theme.accent,
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.6 : 1
                }}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Financial Summary */}
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            padding: '20px'
          }}>
            <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '16px' }}>
              Financial Summary
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', alignItems: 'center' }}>
                <span style={{ color: theme.textSecondary }}>Project Cost</span>
                {isEditing ? (
                  <input
                    type="number"
                    step="0.01"
                    value={editForm.project_cost}
                    onChange={(e) => setEditForm(prev => ({ ...prev, project_cost: e.target.value }))}
                    style={{ ...inputStyle, width: '140px', textAlign: 'right' }}
                  />
                ) : (
                  <span style={{ fontWeight: '500', color: theme.text }}>{formatCurrency(invoice.project_cost || invoice.amount)}</span>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', alignItems: 'center' }}>
                <span style={{ color: theme.textSecondary }}>Incentive Amount</span>
                {isEditing ? (
                  <input
                    type="number"
                    step="0.01"
                    value={editForm.incentive_amount}
                    onChange={(e) => setEditForm(prev => ({ ...prev, incentive_amount: e.target.value }))}
                    style={{ ...inputStyle, width: '140px', textAlign: 'right' }}
                  />
                ) : (
                  <span style={{ fontWeight: '500', color: '#d4940a' }}>{formatCurrency(invoice.incentive_amount)}</span>
                )}
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                paddingTop: '12px',
                borderTop: `1px solid ${theme.border}`,
                alignItems: 'center'
              }}>
                <span style={{ fontWeight: '600', color: theme.text }}>Net Cost</span>
                {isEditing ? (
                  <input
                    type="number"
                    step="0.01"
                    value={editForm.net_cost}
                    onChange={(e) => setEditForm(prev => ({ ...prev, net_cost: e.target.value }))}
                    style={{ ...inputStyle, width: '140px', textAlign: 'right' }}
                  />
                ) : (
                  <span style={{ fontSize: '20px', fontWeight: '600', color: theme.text }}>
                    {formatCurrency(invoice.net_cost)}
                  </span>
                )}
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                paddingTop: '12px',
                borderTop: `1px solid ${theme.border}`
              }}>
                <span style={{ color: theme.textSecondary, fontSize: '14px' }}>Payment Status</span>
                <span style={{
                  padding: '2px 10px',
                  borderRadius: '12px',
                  fontSize: '12px',
                  fontWeight: '500',
                  backgroundColor: statusStyle.bg,
                  color: statusStyle.text
                }}>
                  {invoice.payment_status}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            padding: '20px'
          }}>
            <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '16px' }}>
              Actions
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {invoice.payment_status !== 'Paid' && (
                <button
                  onClick={markAsPaid}
                  disabled={saving}
                  style={actionBtnStyle('#4a7c59', '#ffffff')}
                >
                  <CheckCircle size={18} />
                  Mark as Paid
                </button>
              )}

              {!isEditing && (
                <button onClick={startEditing} style={actionBtnStyle(theme.accentBg, theme.accent)}>
                  <Pencil size={18} />
                  Edit Rebate
                </button>
              )}

              <div style={{ borderTop: `1px solid ${theme.border}`, margin: '6px 0' }} />
              <button
                onClick={handleDeleteInvoice}
                disabled={saving}
                style={actionBtnStyle('rgba(220,38,38,0.10)', '#dc2626')}
              >
                <Trash2 size={18} />
                Delete Rebate
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
