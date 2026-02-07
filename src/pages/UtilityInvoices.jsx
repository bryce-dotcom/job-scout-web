import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { Plus, Pencil, Trash2, X, FileText, Search, Zap, DollarSign } from 'lucide-react'

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

const emptyInvoice = {
  utility_name: '',
  job_id: '',
  amount: '',
  payment_status: 'Pending',
  notes: ''
}

export default function UtilityInvoices() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const utilityInvoices = useStore((state) => state.utilityInvoices)
  const customers = useStore((state) => state.customers)
  const utilityProviders = useStore((state) => state.utilityProviders)
  const fetchUtilityInvoices = useStore((state) => state.fetchUtilityInvoices)

  const [showModal, setShowModal] = useState(false)
  const [editingInvoice, setEditingInvoice] = useState(null)
  const [formData, setFormData] = useState(emptyInvoice)
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
    fetchUtilityInvoices()
  }, [companyId, navigate, fetchUtilityInvoices])

  const filteredInvoices = utilityInvoices.filter(inv => {
    const matchesSearch = searchTerm === '' ||
      inv.utility_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      String(inv.job_id || '').toLowerCase().includes(searchTerm.toLowerCase())
    return matchesSearch
  })

  const totalKwh = filteredInvoices.reduce((sum, inv) => sum + (parseFloat(inv.kwh_usage) || 0), 0)
  const totalAmount = filteredInvoices.reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0)

  const openAddModal = () => {
    setEditingInvoice(null)
    setFormData(emptyInvoice)
    setError(null)
    setShowModal(true)
  }

  const openEditModal = (invoice) => {
    setEditingInvoice(invoice)
    setFormData({
      utility_name: invoice.utility_name || '',
      job_id: invoice.job_id || '',
      amount: invoice.amount || '',
      payment_status: invoice.payment_status || 'Pending',
      notes: invoice.notes || ''
    })
    setError(null)
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingInvoice(null)
    setFormData(emptyInvoice)
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
      utility_name: formData.utility_name || null,
      job_id: formData.job_id || null,
      amount: parseFloat(formData.amount) || null,
      payment_status: formData.payment_status || 'Pending',
      notes: formData.notes || null,
      job_description: formData.job_description || null,
      updated_at: new Date().toISOString()
    }

    let result
    if (editingInvoice) {
      result = await supabase.from('utility_invoices').update(payload).eq('id', editingInvoice.id)
    } else {
      result = await supabase.from('utility_invoices').insert([payload])
    }

    if (result.error) {
      setError(result.error.message)
      setLoading(false)
      return
    }

    await fetchUtilityInvoices()
    closeModal()
    setLoading(false)
  }

  const handleDelete = async (invoice) => {
    if (!confirm(`Delete this utility invoice?`)) return
    await supabase.from('utility_invoices').delete().eq('id', invoice.id)
    await fetchUtilityInvoices()
  }

  const formatCurrency = (amount) => {
    if (!amount) return '$0.00'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
  }

  const formatNumber = (num) => {
    if (!num) return '0'
    return new Intl.NumberFormat('en-US').format(num)
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
          Utility Invoices
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
          Add Invoice
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
              backgroundColor: 'rgba(212,148,10,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Zap size={24} style={{ color: '#d4940a' }} />
            </div>
            <div>
              <p style={{ fontSize: '13px', color: theme.textMuted }}>Total kWh</p>
              <p style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>
                {formatNumber(totalKwh)}
              </p>
            </div>
          </div>
        </div>
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
              backgroundColor: theme.accentBg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <DollarSign size={24} style={{ color: theme.accent }} />
            </div>
            <div>
              <p style={{ fontSize: '13px', color: theme.textMuted }}>Total Amount</p>
              <p style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>
                {formatCurrency(totalAmount)}
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
            placeholder="Search invoices..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ ...inputStyle, paddingLeft: '40px' }}
          />
        </div>
      </div>

      {/* Table */}
      {filteredInvoices.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '48px 24px',
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`
        }}>
          <FileText size={48} style={{ color: theme.textMuted, marginBottom: '16px', opacity: 0.5 }} />
          <p style={{ color: theme.textSecondary, fontSize: '15px' }}>
            No utility invoices found. Add your first invoice.
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
            gridTemplateColumns: '100px 1fr 1fr 100px 100px 80px',
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
            <div>Utility</div>
            <div>Status</div>
            <div style={{ textAlign: 'right' }}>Job</div>
            <div style={{ textAlign: 'right' }}>Amount</div>
            <div style={{ textAlign: 'right' }}>Actions</div>
          </div>

          {filteredInvoices.map((invoice) => (
            <div
              key={invoice.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '100px 1fr 1fr 100px 100px 80px',
                gap: '16px',
                padding: '16px 20px',
                borderBottom: `1px solid ${theme.border}`,
                alignItems: 'center'
              }}
            >
              <div style={{ fontSize: '14px', color: theme.textSecondary }}>
                {formatDate(invoice.created_at)}
              </div>
              <div style={{ fontWeight: '500', color: theme.text, fontSize: '14px' }}>
                {invoice.utility_name || '-'}
              </div>
              <div style={{ fontSize: '14px', color: theme.textSecondary }}>
                {invoice.payment_status || '-'}
              </div>
              <div style={{ textAlign: 'right', fontWeight: '500', color: theme.text }}>
                {invoice.job_id || '-'}
              </div>
              <div style={{ textAlign: 'right', fontWeight: '600', color: theme.text }}>
                {formatCurrency(invoice.amount)}
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '4px' }}>
                <button
                  onClick={() => openEditModal(invoice)}
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
                  onClick={() => handleDelete(invoice)}
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
            maxWidth: '550px',
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
                {editingInvoice ? 'Edit Utility Invoice' : 'New Utility Invoice'}
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Utility Name *</label>
                    <input type="text" name="utility_name" value={formData.utility_name} onChange={handleChange} required style={inputStyle} placeholder="Utility name" />
                  </div>
                  <div>
                    <label style={labelStyle}>Job ID</label>
                    <input type="text" name="job_id" value={formData.job_id} onChange={handleChange} style={inputStyle} placeholder="Job ID" />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Amount</label>
                    <input type="number" name="amount" value={formData.amount} onChange={handleChange} step="0.01" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Payment Status</label>
                    <select name="payment_status" value={formData.payment_status} onChange={handleChange} style={inputStyle}>
                      <option value="Pending">Pending</option>
                      <option value="Paid">Paid</option>
                      <option value="Overdue">Overdue</option>
                    </select>
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
                  {loading ? 'Saving...' : (editingInvoice ? 'Update' : 'Add Invoice')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
