import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { ArrowLeft, Plus, X, DollarSign, CheckCircle, Send } from 'lucide-react'

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

export default function InvoiceDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const fetchInvoices = useStore((state) => state.fetchInvoices)

  const [invoice, setInvoice] = useState(null)
  const [payments, setPayments] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [paymentData, setPaymentData] = useState({
    amount: '',
    date: new Date().toISOString().split('T')[0],
    method: 'Cash',
    status: 'Completed',
    notes: ''
  })

  // Theme with fallback
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

    const { data: invoiceData } = await supabase
      .from('invoices')
      .select('*, customer:customers(id, name, email, phone, address), job:jobs(id, job_id, job_title)')
      .eq('id', id)
      .single()

    if (invoiceData) {
      setInvoice(invoiceData)

      // Fetch payments for this invoice
      const { data: paymentsData } = await supabase
        .from('payments')
        .select('*')
        .eq('invoice_id', id)
        .order('payment_date', { ascending: false })

      setPayments(paymentsData || [])
    }

    setLoading(false)
  }

  const addPayment = async () => {
    if (!paymentData.amount) return

    setSaving(true)

    await supabase.from('payments').insert([{
      company_id: companyId,
      invoice_id: parseInt(id),
      customer_id: invoice.customer_id,
      amount: parseFloat(paymentData.amount),
      payment_date: paymentData.date,
      payment_method: paymentData.method,
      status: paymentData.status,
      notes: paymentData.notes || null
    }])

    // Check if invoice is fully paid
    const totalPaid = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0) + parseFloat(paymentData.amount)
    if (totalPaid >= parseFloat(invoice.amount)) {
      await supabase.from('invoices').update({
        payment_status: 'Paid',
        updated_at: new Date().toISOString()
      }).eq('id', id)
    }

    await fetchInvoiceData()
    await fetchInvoices()
    setPaymentData({
      amount: '',
      date: new Date().toISOString().split('T')[0],
      method: 'Cash',
      status: 'Completed',
      notes: ''
    })
    setShowPaymentModal(false)
    setSaving(false)
  }

  const markAsPaid = async () => {
    setSaving(true)
    await supabase.from('invoices').update({
      payment_status: 'Paid',
      updated_at: new Date().toISOString()
    }).eq('id', id)
    await fetchInvoiceData()
    await fetchInvoices()
    setSaving(false)
  }

  const formatCurrency = (amount) => {
    if (!amount) return '$0.00'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
  }

  const formatDate = (date) => {
    if (!date) return '-'
    return new Date(date).toLocaleDateString()
  }

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

  if (loading) {
    return (
      <div style={{ padding: '24px' }}>
        <p style={{ color: theme.textMuted }}>Loading invoice...</p>
      </div>
    )
  }

  if (!invoice) {
    return (
      <div style={{ padding: '24px' }}>
        <p style={{ color: '#dc2626', marginBottom: '16px' }}>Invoice not found</p>
        <button onClick={() => navigate('/invoices')} style={{ color: theme.accent, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}>
          Back to Invoices
        </button>
      </div>
    )
  }

  const totalPaid = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
  const balanceDue = (parseFloat(invoice.amount) || 0) - totalPaid
  const statusStyle = statusColors[invoice.payment_status] || statusColors['Pending']

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
        <button
          onClick={() => navigate('/invoices')}
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
          <p style={{ fontSize: '13px', color: theme.accent, fontWeight: '600' }}>{invoice.invoice_id}</p>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>
            {invoice.customer?.name || 'Invoice'}
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '24px' }}>
        {/* Main Content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Customer Info */}
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            padding: '20px'
          }}>
            <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '16px' }}>
              Bill To
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Customer</p>
                <p style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>{invoice.customer?.name || '-'}</p>
              </div>
              <div>
                <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Email</p>
                <p style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>{invoice.customer?.email || '-'}</p>
              </div>
              <div>
                <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Phone</p>
                <p style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>{invoice.customer?.phone || '-'}</p>
              </div>
              <div>
                <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Address</p>
                <p style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>{invoice.customer?.address || '-'}</p>
              </div>
            </div>
          </div>

          {/* Job Info */}
          {invoice.job && (
            <div style={{
              backgroundColor: theme.bgCard,
              borderRadius: '12px',
              border: `1px solid ${theme.border}`,
              padding: '20px'
            }}>
              <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '16px' }}>
                Job Details
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Job ID</p>
                  <button
                    onClick={() => navigate(`/jobs/${invoice.job.id}`)}
                    style={{ fontSize: '14px', fontWeight: '500', color: theme.accent, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    {invoice.job.job_id}
                  </button>
                </div>
                <div>
                  <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Job Title</p>
                  <p style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>{invoice.job.job_title || '-'}</p>
                </div>
              </div>
            </div>
          )}

          {/* Description */}
          {invoice.job_description && (
            <div style={{
              backgroundColor: theme.bgCard,
              borderRadius: '12px',
              border: `1px solid ${theme.border}`,
              padding: '20px'
            }}>
              <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '12px' }}>
                Description
              </h3>
              <p style={{ fontSize: '14px', color: theme.textSecondary }}>{invoice.job_description}</p>
            </div>
          )}

          {/* Payments */}
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            overflow: 'hidden'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderBottom: `1px solid ${theme.border}`
            }}>
              <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text }}>Payments</h3>
              <button
                onClick={() => setShowPaymentModal(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 12px',
                  backgroundColor: theme.accent,
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                <Plus size={16} />
                Add Payment
              </button>
            </div>

            {payments.length === 0 ? (
              <div style={{ padding: '32px 20px', textAlign: 'center', color: theme.textMuted }}>
                No payments recorded yet.
              </div>
            ) : (
              <div>
                {payments.map((payment) => (
                  <div key={payment.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 20px',
                    borderBottom: `1px solid ${theme.border}`
                  }}>
                    <div>
                      <p style={{ fontWeight: '500', color: theme.text, fontSize: '14px' }}>
                        {formatCurrency(payment.amount)}
                      </p>
                      <p style={{ fontSize: '12px', color: theme.textMuted }}>
                        {formatDate(payment.payment_date)} - {payment.payment_method}
                      </p>
                    </div>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: '500',
                      backgroundColor: payment.status === 'Completed' ? 'rgba(74,124,89,0.12)' : 'rgba(194,139,56,0.12)',
                      color: payment.status === 'Completed' ? '#4a7c59' : '#c28b38'
                    }}>
                      {payment.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Totals */}
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            padding: '20px'
          }}>
            <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '16px' }}>
              Invoice Summary
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                <span style={{ color: theme.textSecondary }}>Invoice Total</span>
                <span style={{ fontWeight: '500', color: theme.text }}>{formatCurrency(invoice.amount)}</span>
              </div>

              {invoice.discount_applied > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                  <span style={{ color: theme.textSecondary }}>Discount</span>
                  <span style={{ color: '#dc2626' }}>-{formatCurrency(invoice.discount_applied)}</span>
                </div>
              )}

              {invoice.credit_card_fee > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                  <span style={{ color: theme.textSecondary }}>CC Fee</span>
                  <span style={{ color: theme.textMuted }}>{formatCurrency(invoice.credit_card_fee)}</span>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px' }}>
                <span style={{ color: theme.textSecondary }}>Total Paid</span>
                <span style={{ fontWeight: '500', color: '#4a7c59' }}>{formatCurrency(totalPaid)}</span>
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                paddingTop: '12px',
                borderTop: `1px solid ${theme.border}`
              }}>
                <span style={{ fontWeight: '600', color: theme.text }}>Balance Due</span>
                <span style={{ fontSize: '20px', fontWeight: '600', color: balanceDue > 0 ? '#c28b38' : '#4a7c59' }}>
                  {formatCurrency(balanceDue)}
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
                <>
                  <button
                    onClick={() => setShowPaymentModal(true)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '12px 16px',
                      backgroundColor: theme.accent,
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '500',
                      cursor: 'pointer'
                    }}
                  >
                    <DollarSign size={18} />
                    Record Payment
                  </button>
                  <button
                    onClick={markAsPaid}
                    disabled={saving}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '12px 16px',
                      backgroundColor: '#4a7c59',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '500',
                      cursor: 'pointer'
                    }}
                  >
                    <CheckCircle size={18} />
                    Mark as Paid
                  </button>
                </>
              )}
              <button
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '12px 16px',
                  backgroundColor: theme.accentBg,
                  color: theme.accent,
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                <Send size={18} />
                Send Invoice
              </button>
            </div>
          </div>

          {/* Notes */}
          {invoice.notes && (
            <div style={{
              backgroundColor: theme.bgCard,
              borderRadius: '12px',
              border: `1px solid ${theme.border}`,
              padding: '20px'
            }}>
              <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '12px' }}>
                Notes
              </h3>
              <p style={{ fontSize: '14px', color: theme.textSecondary }}>{invoice.notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Add Payment Modal */}
      {showPaymentModal && (
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
            maxWidth: '400px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '20px',
              borderBottom: `1px solid ${theme.border}`
            }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>
                Record Payment
              </h2>
              <button
                onClick={() => setShowPaymentModal(false)}
                style={{ background: 'none', border: 'none', padding: '8px', cursor: 'pointer', color: theme.textMuted }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>Amount</label>
                  <input
                    type="number"
                    value={paymentData.amount}
                    onChange={(e) => setPaymentData(prev => ({ ...prev, amount: e.target.value }))}
                    step="0.01"
                    placeholder={formatCurrency(balanceDue)}
                    style={inputStyle}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Date</label>
                    <input
                      type="date"
                      value={paymentData.date}
                      onChange={(e) => setPaymentData(prev => ({ ...prev, date: e.target.value }))}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Method</label>
                    <select
                      value={paymentData.method}
                      onChange={(e) => setPaymentData(prev => ({ ...prev, method: e.target.value }))}
                      style={inputStyle}
                    >
                      <option value="Cash">Cash</option>
                      <option value="Check">Check</option>
                      <option value="Credit Card">Credit Card</option>
                      <option value="ACH">ACH</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Notes</label>
                  <textarea
                    value={paymentData.notes}
                    onChange={(e) => setPaymentData(prev => ({ ...prev, notes: e.target.value }))}
                    rows={2}
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button
                  onClick={() => setShowPaymentModal(false)}
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
                  onClick={addPayment}
                  disabled={saving || !paymentData.amount}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    backgroundColor: theme.accent,
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: (saving || !paymentData.amount) ? 'not-allowed' : 'pointer',
                    opacity: (saving || !paymentData.amount) ? 0.6 : 1
                  }}
                >
                  {saving ? 'Saving...' : 'Record Payment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
