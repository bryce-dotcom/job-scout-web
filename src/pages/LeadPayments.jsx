import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { Plus, Pencil, Trash2, X, CreditCard, Search, DollarSign, Upload, Download } from 'lucide-react'
import ImportExportModal, { exportToCSV } from '../components/ImportExportModal'
import { depositsFields } from '../lib/importExportFields'
import { isAdmin as checkAdmin } from '../lib/accessControl'

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

const emptyDeposit = {
  business: '',
  lead_customer_name: '',
  description: '',
  account: '',
  lead_source: '',
  receipt: '',
  date_created: new Date().toISOString().split('T')[0],
  amount: '',
  payment_id: '',
  payment_status: 'Completed',
  notes: ''
}

export default function LeadPayments() {
  const navigate = useNavigate()
  const user = useStore((state) => state.user)
  const companyId = useStore((state) => state.companyId)
  const leadPayments = useStore((state) => state.leadPayments)
  const fetchLeadPayments = useStore((state) => state.fetchLeadPayments)

  const [showModal, setShowModal] = useState(false)
  const [editingPayment, setEditingPayment] = useState(null)
  const [formData, setFormData] = useState(emptyDeposit)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [showImportExport, setShowImportExport] = useState(false)

  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchLeadPayments()
  }, [companyId, navigate, fetchLeadPayments])

  const filteredPayments = leadPayments.filter(p => {
    if (!searchTerm) return true
    const s = searchTerm.toLowerCase()
    return (
      p.lead_customer_name?.toLowerCase().includes(s) ||
      p.business?.toLowerCase().includes(s) ||
      p.description?.toLowerCase().includes(s) ||
      p.account?.toLowerCase().includes(s) ||
      p.lead_source?.toLowerCase().includes(s) ||
      p.payment_id?.toLowerCase().includes(s) ||
      p.receipt?.toLowerCase().includes(s)
    )
  })

  const totalDeposits = filteredPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)

  const openAddModal = () => {
    setEditingPayment(null)
    setFormData(emptyDeposit)
    setError(null)
    setShowModal(true)
  }

  const openEditModal = (payment) => {
    setEditingPayment(payment)
    setFormData({
      business: payment.business || '',
      lead_customer_name: payment.lead_customer_name || '',
      description: payment.description || '',
      account: payment.account || '',
      lead_source: payment.lead_source || '',
      receipt: payment.receipt || '',
      date_created: payment.date_created || '',
      amount: payment.amount || '',
      payment_id: payment.payment_id || '',
      payment_status: payment.payment_status || 'Completed',
      notes: payment.notes || ''
    })
    setError(null)
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingPayment(null)
    setFormData(emptyDeposit)
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
      business: formData.business || null,
      lead_customer_name: formData.lead_customer_name || null,
      description: formData.description || null,
      account: formData.account || null,
      lead_source: formData.lead_source || null,
      receipt: formData.receipt || null,
      date_created: formData.date_created || null,
      amount: parseFloat(formData.amount) || 0,
      payment_id: formData.payment_id || null,
      payment_status: formData.payment_status || 'Completed',
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
    if (!confirm('Delete this deposit?')) return
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

  if (!checkAdmin(user)) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '16px', fontWeight: '600', color: '#2c3530', marginBottom: '8px' }}>Access Restricted</div>
        <div style={{ fontSize: '14px', color: '#7d8a7f' }}>You don't have permission to view this page. Contact your admin for access.</div>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px', maxWidth: '100%', overflowX: 'hidden' }}>
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
          Deposits
        </h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowImportExport(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', backgroundColor: 'transparent', color: theme.accent, border: `1px solid ${theme.border}`, borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>
            <Upload size={18} /> Import
          </button>
          <button onClick={() => exportToCSV(filteredPayments, depositsFields, 'deposits_export')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', backgroundColor: 'transparent', color: theme.textSecondary, border: `1px solid ${theme.border}`, borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>
            <Download size={18} /> Export
          </button>
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
            Add Deposit
          </button>
        </div>
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
                {formatCurrency(totalDeposits)}
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
            placeholder="Search deposits..."
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
            No deposits found. Record your first deposit or import from a file.
          </p>
        </div>
      ) : (
        <div style={{
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          overflow: 'auto'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
            <thead>
              <tr style={{ backgroundColor: theme.accentBg, borderBottom: `1px solid ${theme.border}` }}>
                {['Business', 'Customer', 'Description', 'Account', 'Source', 'Receipt', 'Date', 'Amount', ''].map((col, i) => (
                  <th key={i} style={{
                    padding: '12px 14px',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: theme.textMuted,
                    textTransform: 'uppercase',
                    textAlign: col === 'Amount' ? 'right' : 'left',
                    whiteSpace: 'nowrap'
                  }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredPayments.map((p) => (
                <tr key={p.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                  <td style={{ padding: '12px 14px', fontSize: '14px', color: theme.text }}>
                    {p.business || '-'}
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: '14px', fontWeight: '500', color: theme.text }}>
                    {p.lead_customer_name || '-'}
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: '13px', color: theme.textSecondary, maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.description || p.notes || '-'}
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: '13px', color: theme.textSecondary }}>
                    {p.account || '-'}
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: '13px', color: theme.textSecondary, maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {p.lead_source || '-'}
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: '13px', color: theme.textMuted }}>
                    {p.receipt || '-'}
                  </td>
                  <td style={{ padding: '12px 14px', fontSize: '14px', color: theme.textSecondary, whiteSpace: 'nowrap' }}>
                    {formatDate(p.date_created)}
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: '600', color: '#4a7c59', whiteSpace: 'nowrap' }}>
                    {formatCurrency(p.amount)}
                  </td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button
                      onClick={() => openEditModal(p)}
                      style={{ padding: '6px', backgroundColor: 'transparent', border: 'none', borderRadius: '6px', cursor: 'pointer', color: theme.textMuted }}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => handleDelete(p)}
                      style={{ padding: '6px', backgroundColor: 'transparent', border: 'none', borderRadius: '6px', cursor: 'pointer', color: theme.textMuted }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Modal */}
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
            maxWidth: '600px',
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
                {editingPayment ? 'Edit Deposit' : 'New Deposit'}
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
                    <label style={labelStyle}>Business</label>
                    <input type="text" name="business" value={formData.business} onChange={handleChange} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Customer / Client</label>
                    <input type="text" name="lead_customer_name" value={formData.lead_customer_name} onChange={handleChange} style={inputStyle} />
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Description</label>
                  <input type="text" name="description" value={formData.description} onChange={handleChange} style={inputStyle} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Account</label>
                    <input type="text" name="account" value={formData.account} onChange={handleChange} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Source</label>
                    <input type="text" name="lead_source" value={formData.lead_source} onChange={handleChange} style={inputStyle} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Receipt</label>
                    <input type="text" name="receipt" value={formData.receipt} onChange={handleChange} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Date *</label>
                    <input type="date" name="date_created" value={formData.date_created} onChange={handleChange} required style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Amount *</label>
                    <input type="number" name="amount" value={formData.amount} onChange={handleChange} step="0.01" required style={inputStyle} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Payment ID</label>
                    <input type="text" name="payment_id" value={formData.payment_id} onChange={handleChange} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Status</label>
                    <select name="payment_status" value={formData.payment_status} onChange={handleChange} style={inputStyle}>
                      <option value="Pending">Pending</option>
                      <option value="Completed">Completed</option>
                      <option value="Failed">Failed</option>
                      <option value="Refunded">Refunded</option>
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
                  {loading ? 'Saving...' : (editingPayment ? 'Update' : 'Record Deposit')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {showImportExport && (
        <ImportExportModal
          tableName="lead_payments"
          entityName="Deposits"
          fields={depositsFields}
          companyId={companyId}
          requiredField="amount"
          defaultValues={{ company_id: companyId, payment_status: 'Completed' }}
          onImportComplete={() => fetchLeadPayments()}
          onClose={() => setShowImportExport(false)}
        />
      )}
    </div>
  )
}
