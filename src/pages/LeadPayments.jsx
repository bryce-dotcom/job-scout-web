import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { PAYMENT_METHODS } from '../lib/schema'
import { Plus, Pencil, Trash2, X, CreditCard, Search, DollarSign } from 'lucide-react'

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

const emptyPayment = {
  lead_id: '',
  payment_date: new Date().toISOString().split('T')[0],
  amount: '',
  payment_method: '',
  reference_number: '',
  notes: ''
}

export default function LeadPayments() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const leadPayments = useStore((state) => state.leadPayments)
  const leads = useStore((state) => state.leads)
  const fetchLeadPayments = useStore((state) => state.fetchLeadPayments)

  const [showModal, setShowModal] = useState(false)
  const [editingPayment, setEditingPayment] = useState(null)
  const [formData, setFormData] = useState(emptyPayment)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')

  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchLeadPayments()
  }, [companyId, navigate, fetchLeadPayments])

  const filteredPayments = leadPayments.filter(payment => {
    const matchesSearch = searchTerm === '' ||
      payment.lead?.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.reference_number?.toLowerCase().includes(searchTerm.toLowerCase())
    return matchesSearch
  })

  const totalPayments = filteredPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)

  const openAddModal = () => {
    setEditingPayment(null)
    setFormData(emptyPayment)
    setError(null)
    setShowModal(true)
  }

  const openEditModal = (payment) => {
    setEditingPayment(payment)
    setFormData({
      lead_id: payment.lead_id || '',
      payment_date: payment.payment_date || '',
      amount: payment.amount || '',
      payment_method: payment.payment_method || '',
      reference_number: payment.reference_number || '',
      notes: payment.notes || ''
    })
    setError(null)
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingPayment(null)
    setFormData(emptyPayment)
    setError(null)
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const payload = {
      company_id: companyId,
      lead_id: formData.lead_id || null,
      payment_date: formData.payment_date,
      amount: parseFloat(formData.amount) || 0,
      payment_method: formData.payment_method || null,
      reference_number: formData.reference_number || null,
      notes: formData.notes || null,
      updated_at: new Date().toISOString()
    }

    let result
    if (editingPayment) {
      result = await supabase.from('lead_payments').update(payload).eq('id', editingPayment.id)
    } else {
      result = await supabase.from('lead_payments').insert([payload])
    }

    if (result.error) {
      setError(result.error.message)
      setLoading(false)
      return
    }

    await fetchLeadPayments()
    closeModal()
    setLoading(false)
  }

  const handleDelete = async (payment) => {
    if (!confirm(`Delete this payment?`)) return
    await supabase.from('lead_payments').delete().eq('id', payment.id)
    await fetchLeadPayments()
  }

  const formatCurrency = (amount) => {
    if (!amount) return '$0.00'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString()
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

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        marginBottom: '24px',
        flexWrap: 'wrap'
      }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>
          Lead Payments
        </h1>
        <button
          onClick={openAddModal}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 16px',
            backgroundColor: theme.accent,
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer'
          }}
        >
          <Plus size={18} />
          Add Payment
        </button>
      </div>

      {/* Summary */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div style={{
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          padding: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              backgroundColor: 'rgba(74,124,89,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <DollarSign size={24} style={{ color: '#4a7c59' }} />
            </div>
            <div>
              <p style={{ fontSize: '13px', color: theme.textMuted }}>Total Collected</p>
              <p style={{ fontSize: '24px', fontWeight: '700', color: '#4a7c59' }}>
                {formatCurrency(totalPayments)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Search */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ position: 'relative', maxWidth: '400px' }}>
          <Search size={18} style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: theme.textMuted
          }} />
          <input
            type="text"
            placeholder="Search payments..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ ...inputStyle, paddingLeft: '40px' }}
          />
        </div>
      </div>

      {/* Table */}
      {filteredPayments.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '48px 24px',
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`
        }}>
          <CreditCard size={48} style={{ color: theme.textMuted, marginBottom: '16px', opacity: 0.5 }} />
          <p style={{ color: theme.textSecondary, fontSize: '15px' }}>
            No payments found. Record your first lead payment.
          </p>
        </div>
      ) : (
        <div style={{
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          overflow: 'hidden'
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '100px 1fr 120px 120px 120px 80px',
            gap: '16px',
            padding: '14px 20px',
            backgroundColor: theme.accentBg,
            borderBottom: `1px solid ${theme.border}`,
            fontSize: '12px',
            fontWeight: '600',
            color: theme.textMuted,
            textTransform: 'uppercase'
          }}>
            <div>Date</div>
            <div>Lead</div>
            <div style={{ textAlign: 'right' }}>Amount</div>
            <div>Method</div>
            <div>Reference</div>
            <div style={{ textAlign: 'right' }}>Actions</div>
          </div>

          {filteredPayments.map((payment) => (
            <div
              key={payment.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '100px 1fr 120px 120px 120px 80px',
                gap: '16px',
                padding: '16px 20px',
                borderBottom: `1px solid ${theme.border}`,
                alignItems: 'center'
              }}
            >
              <div style={{ fontSize: '14px', color: theme.textSecondary }}>
                {formatDate(payment.payment_date)}
              </div>
              <div style={{ fontWeight: '500', color: theme.text, fontSize: '14px' }}>
                {payment.lead?.customer_name || 'Unknown Lead'}
              </div>
              <div style={{ textAlign: 'right', fontWeight: '600', color: '#4a7c59' }}>
                {formatCurrency(payment.amount)}
              </div>
              <div style={{ fontSize: '13px', color: theme.textSecondary }}>
                {payment.payment_method || '-'}
              </div>
              <div style={{ fontSize: '13px', color: theme.textMuted }}>
                {payment.reference_number || '-'}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '4px' }}>
                <button
                  onClick={() => openEditModal(payment)}
                  style={{
                    padding: '8px',
                    backgroundColor: 'transparent',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    color: theme.textMuted
                  }}
                >
                  <Pencil size={16} />
                </button>
                <button
                  onClick={() => handleDelete(payment)}
                  style={{
                    padding: '8px',
                    backgroundColor: 'transparent',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    color: theme.textMuted
                  }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
          zIndex: 50
        }}>
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '16px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
            width: '100%',
            maxWidth: '450px',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '20px',
              borderBottom: `1px solid ${theme.border}`
            }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>
                {editingPayment ? 'Edit Payment' : 'New Payment'}
              </h2>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', padding: '8px', cursor: 'pointer', color: theme.textMuted }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
              {error && (
                <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '14px' }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>Lead *</label>
                  <select name="lead_id" value={formData.lead_id} onChange={handleChange} required style={inputStyle}>
                    <option value="">Select lead</option>
                    {leads.map(lead => (
                      <option key={lead.id} value={lead.id}>{lead.customer_name}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Payment Date *</label>
                    <input type="date" name="payment_date" value={formData.payment_date} onChange={handleChange} required style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Amount *</label>
                    <input type="number" name="amount" value={formData.amount} onChange={handleChange} step="0.01" required style={inputStyle} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Payment Method</label>
                    <select name="payment_method" value={formData.payment_method} onChange={handleChange} style={inputStyle}>
                      <option value="">Select method</option>
                      {PAYMENT_METHODS.map(method => (
                        <option key={method} value={method}>{method}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Reference #</label>
                    <input type="text" name="reference_number" value={formData.reference_number} onChange={handleChange} style={inputStyle} />
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Notes</label>
                  <textarea name="notes" value={formData.notes} onChange={handleChange} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button type="button" onClick={closeModal} style={{
                  flex: 1, padding: '10px 16px', border: `1px solid ${theme.border}`,
                  backgroundColor: 'transparent', color: theme.text, borderRadius: '8px', fontSize: '14px', cursor: 'pointer'
                }}>
                  Cancel
                </button>
                <button type="submit" disabled={loading} style={{
                  flex: 1, padding: '10px 16px', backgroundColor: theme.accent, color: '#ffffff',
                  border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500',
                  cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1
                }}>
                  {loading ? 'Saving...' : (editingPayment ? 'Update' : 'Record Payment')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
