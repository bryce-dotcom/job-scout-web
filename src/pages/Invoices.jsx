import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { Plus, Search, FileText, X, ChevronRight, DollarSign, CheckCircle } from 'lucide-react'
import EntityCard from '../components/EntityCard'

// Light theme fallback
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

const statusColors = {
  'Pending': { bg: 'rgba(194,139,56,0.12)', text: '#c28b38' },
  'Paid': { bg: 'rgba(74,124,89,0.12)', text: '#4a7c59' },
  'Overdue': { bg: 'rgba(139,90,90,0.12)', text: '#8b5a5a' },
  'Cancelled': { bg: 'rgba(125,138,127,0.12)', text: '#7d8a7f' }
}

export default function Invoices() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const invoices = useStore((state) => state.invoices)
  const customers = useStore((state) => state.customers)
  const jobs = useStore((state) => state.jobs)
  const fetchInvoices = useStore((state) => state.fetchInvoices)

  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({
    customer_id: '',
    job_id: '',
    amount: '',
    payment_method: '',
    payment_status: 'Pending',
    discount_applied: '',
    credit_card_fee: '',
    job_description: '',
    notes: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  // Theme with fallback
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchInvoices()
  }, [companyId, navigate, fetchInvoices])

  const filteredInvoices = invoices.filter(invoice => {
    const customerName = invoice.customer?.name || ''
    const matchesSearch = searchTerm === '' ||
      customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.invoice_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.job?.job_title?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesStatus = statusFilter === 'all' || invoice.payment_status === statusFilter

    return matchesSearch && matchesStatus
  })

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleCreateInvoice = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`

    const { data, error: insertError } = await supabase
      .from('invoices')
      .insert([{
        company_id: companyId,
        invoice_id: invoiceNumber,
        customer_id: formData.customer_id || null,
        job_id: formData.job_id || null,
        amount: formData.amount || 0,
        payment_method: formData.payment_method || null,
        payment_status: formData.payment_status || 'Pending',
        discount_applied: formData.discount_applied || null,
        credit_card_fee: formData.credit_card_fee || null,
        job_description: formData.job_description || null
      }])
      .select()
      .single()

    if (insertError) {
      setError(insertError.message)
      setLoading(false)
      return
    }

    setShowModal(false)
    setFormData({
      customer_id: '',
      job_id: '',
      amount: '',
      payment_method: '',
      payment_status: 'Pending',
      discount_applied: '',
      credit_card_fee: '',
      job_description: '',
      notes: ''
    })
    await fetchInvoices()
    navigate(`/invoices/${data.id}`)
    setLoading(false)
  }

  const markAsPaid = async (invoice) => {
    await supabase
      .from('invoices')
      .update({ payment_status: 'Paid', updated_at: new Date().toISOString() })
      .eq('id', invoice.id)

    // Sync to lead pipeline: invoice paid → lead Closed
    if (invoice.job_id) {
      const { data: jobData } = await supabase.from('jobs').select('lead_id').eq('id', invoice.job_id).single()
      if (jobData?.lead_id) {
        await supabase.from('leads').update({ status: 'Closed', updated_at: new Date().toISOString() }).eq('id', jobData.lead_id)
      }
    }

    await fetchInvoices()
  }

  const formatCurrency = (amount) => {
    if (!amount) return '$0.00'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
  }

  const formatDate = (date) => {
    if (!date) return '-'
    return new Date(date).toLocaleDateString()
  }

  // Stats
  const pendingCount = invoices.filter(i => i.payment_status === 'Pending').length
  const paidCount = invoices.filter(i => i.payment_status === 'Paid').length
  const totalPending = invoices.filter(i => i.payment_status === 'Pending').reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0)
  const totalPaid = invoices.filter(i => i.payment_status === 'Paid').reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0)

  // Styles
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
          Invoices
        </h1>
        <button
          onClick={() => setShowModal(true)}
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
          New Invoice
        </button>
      </div>

      {/* Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: '12px',
        marginBottom: '24px'
      }}>
        <div style={{
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          padding: '16px',
          textAlign: 'center'
        }}>
          <p style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '4px' }}>Pending</p>
          <p style={{ fontSize: '24px', fontWeight: '600', color: '#c28b38' }}>{pendingCount}</p>
          <p style={{ fontSize: '12px', color: theme.textMuted }}>{formatCurrency(totalPending)}</p>
        </div>
        <div style={{
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          padding: '16px',
          textAlign: 'center'
        }}>
          <p style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '4px' }}>Paid</p>
          <p style={{ fontSize: '24px', fontWeight: '600', color: '#4a7c59' }}>{paidCount}</p>
          <p style={{ fontSize: '12px', color: theme.textMuted }}>{formatCurrency(totalPaid)}</p>
        </div>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '24px',
        flexWrap: 'wrap'
      }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
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
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ ...inputStyle, width: 'auto', minWidth: '140px' }}
        >
          <option value="all">All Status</option>
          <option value="Pending">Pending</option>
          <option value="Paid">Paid</option>
          <option value="Overdue">Overdue</option>
          <option value="Cancelled">Cancelled</option>
        </select>
      </div>

      {/* Invoices List */}
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
            {searchTerm || statusFilter !== 'all' ? 'No invoices match your search.' : 'No invoices yet.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredInvoices.map((invoice) => {
            const statusStyle = statusColors[invoice.payment_status] || statusColors['Pending']

            return (
              <EntityCard
                key={invoice.id}
                name={invoice.customer?.name}
                businessName={invoice.customer?.business_name}
                onClick={() => navigate(`/invoices/${invoice.id}`)}
                style={{ padding: '16px 20px' }}
              >
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 2fr 1fr 120px 100px 80px',
                  gap: '16px',
                  alignItems: 'center'
                }}>
                <div>
                  <p style={{ fontWeight: '600', color: theme.accent, fontSize: '14px' }}>
                    {invoice.invoice_id}
                  </p>
                </div>

                <div>
                  <p style={{ fontWeight: '500', color: theme.text, fontSize: '14px' }}>
                    {invoice.customer?.name || 'No customer'}
                  </p>
                  {invoice.job && (
                    <p style={{ fontSize: '12px', color: theme.textMuted }}>
                      {invoice.job.job_title || invoice.job.job_id}
                    </p>
                  )}
                </div>

                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: '15px', fontWeight: '600', color: theme.text }}>
                    {formatCurrency(invoice.amount)}
                  </p>
                </div>

                <div style={{ textAlign: 'center' }}>
                  <span style={{
                    padding: '4px 10px',
                    borderRadius: '12px',
                    fontSize: '12px',
                    fontWeight: '500',
                    backgroundColor: statusStyle.bg,
                    color: statusStyle.text
                  }}>
                    {invoice.payment_status}
                  </span>
                </div>

                <div style={{ fontSize: '13px', color: theme.textSecondary }}>
                  {formatDate(invoice.created_at)}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
                  {invoice.payment_status === 'Pending' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); markAsPaid(invoice); }}
                      style={{
                        padding: '6px',
                        backgroundColor: '#4a7c59',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer'
                      }}
                      title="Mark as Paid"
                    >
                      <CheckCircle size={16} />
                    </button>
                  )}
                  <ChevronRight size={20} style={{ color: theme.textMuted }} />
                </div>
                </div>
              </EntityCard>
            )
          })}
        </div>
      )}

      {/* Create Invoice Modal */}
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
            maxWidth: '500px',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '20px',
              borderBottom: `1px solid ${theme.border}`,
              position: 'sticky',
              top: 0,
              backgroundColor: theme.bgCard,
              borderRadius: '16px 16px 0 0'
            }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>
                New Invoice
              </h2>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: 'none', border: 'none', padding: '8px', cursor: 'pointer', color: theme.textMuted }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateInvoice} style={{ padding: '20px' }}>
              {error && (
                <div style={{
                  marginBottom: '16px',
                  padding: '12px',
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '8px',
                  color: '#dc2626',
                  fontSize: '14px'
                }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>Customer</label>
                  <select
                    name="customer_id"
                    value={formData.customer_id}
                    onChange={handleChange}
                    style={inputStyle}
                  >
                    <option value="">-- Select Customer --</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Job (optional)</label>
                  <select
                    name="job_id"
                    value={formData.job_id}
                    onChange={handleChange}
                    style={inputStyle}
                  >
                    <option value="">-- Select Job --</option>
                    {jobs.map(j => (
                      <option key={j.id} value={j.id}>{j.job_id} - {j.job_title || j.customer?.name}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Amount</label>
                    <input
                      type="number"
                      name="amount"
                      value={formData.amount}
                      onChange={handleChange}
                      step="0.01"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Payment Method</label>
                    <select
                      name="payment_method"
                      value={formData.payment_method}
                      onChange={handleChange}
                      style={inputStyle}
                    >
                      <option value="">-- Select --</option>
                      <option value="Cash">Cash</option>
                      <option value="Check">Check</option>
                      <option value="Credit Card">Credit Card</option>
                      <option value="ACH">ACH</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Description</label>
                  <textarea
                    name="job_description"
                    value={formData.job_description}
                    onChange={handleChange}
                    rows={2}
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Notes</label>
                  <textarea
                    name="notes"
                    value={formData.notes}
                    onChange={handleChange}
                    rows={2}
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
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
                  type="submit"
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    backgroundColor: theme.accent,
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.6 : 1
                  }}
                >
                  {loading ? 'Creating...' : 'Create Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
