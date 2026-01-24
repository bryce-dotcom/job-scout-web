import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { Plus, Search, FileText, X, ChevronRight, DollarSign, User, Calendar } from 'lucide-react'

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
  'Draft': { bg: 'rgba(125,138,127,0.12)', text: '#7d8a7f' },
  'Sent': { bg: 'rgba(90,99,73,0.12)', text: '#5a6349' },
  'Approved': { bg: 'rgba(74,124,89,0.12)', text: '#4a7c59' },
  'Rejected': { bg: 'rgba(139,90,90,0.12)', text: '#8b5a5a' },
  'Expired': { bg: 'rgba(124,111,74,0.12)', text: '#7c6f4a' }
}

export default function Quotes() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const quotes = useStore((state) => state.quotes)
  const leads = useStore((state) => state.leads)
  const customers = useStore((state) => state.customers)
  const employees = useStore((state) => state.employees)
  const fetchQuotes = useStore((state) => state.fetchQuotes)

  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({
    lead_id: '',
    customer_id: '',
    salesperson_id: '',
    service_type: '',
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
    fetchQuotes()
  }, [companyId, navigate, fetchQuotes])

  const filteredQuotes = quotes.filter(quote => {
    const customerName = quote.customer?.name || quote.lead?.customer_name || ''
    const matchesSearch = searchTerm === '' ||
      customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      quote.quote_id?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesStatus = statusFilter === 'all' || quote.status === statusFilter

    return matchesSearch && matchesStatus
  })

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleCreateQuote = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const quoteNumber = `Q-${Date.now().toString(36).toUpperCase()}`

    const { data, error: insertError } = await supabase
      .from('quotes')
      .insert([{
        company_id: companyId,
        quote_id: quoteNumber,
        lead_id: formData.lead_id || null,
        customer_id: formData.customer_id || null,
        salesperson_id: formData.salesperson_id || null,
        service_type: formData.service_type || null,
        notes: formData.notes || null,
        status: 'Draft',
        quote_amount: 0
      }])
      .select()
      .single()

    if (insertError) {
      setError(insertError.message)
      setLoading(false)
      return
    }

    setShowModal(false)
    setFormData({ lead_id: '', customer_id: '', salesperson_id: '', service_type: '', notes: '' })
    await fetchQuotes()
    navigate(`/quotes/${data.id}`)
    setLoading(false)
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
  const draftCount = quotes.filter(q => q.status === 'Draft').length
  const sentCount = quotes.filter(q => q.status === 'Sent').length
  const approvedCount = quotes.filter(q => q.status === 'Approved').length
  const totalValue = quotes.filter(q => q.status === 'Approved').reduce((sum, q) => sum + (parseFloat(q.quote_amount) || 0), 0)

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
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        marginBottom: '24px',
        flexWrap: 'wrap'
      }}>
        <h1 style={{
          fontSize: '24px',
          fontWeight: '700',
          color: theme.text
        }}>
          Quotes
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
          New Quote
        </button>
      </div>

      {/* Stats Cards */}
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
          <p style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '4px' }}>Draft</p>
          <p style={{ fontSize: '24px', fontWeight: '600', color: theme.text }}>{draftCount}</p>
        </div>
        <div style={{
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          padding: '16px',
          textAlign: 'center'
        }}>
          <p style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '4px' }}>Sent</p>
          <p style={{ fontSize: '24px', fontWeight: '600', color: theme.text }}>{sentCount}</p>
        </div>
        <div style={{
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          padding: '16px',
          textAlign: 'center'
        }}>
          <p style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '4px' }}>Approved</p>
          <p style={{ fontSize: '24px', fontWeight: '600', color: '#4a7c59' }}>{approvedCount}</p>
        </div>
        <div style={{
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          padding: '16px',
          textAlign: 'center'
        }}>
          <p style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '4px' }}>Total Value</p>
          <p style={{ fontSize: '20px', fontWeight: '600', color: theme.accent }}>{formatCurrency(totalValue)}</p>
        </div>
      </div>

      {/* Search and Filter */}
      <div style={{
        display: 'flex',
        flexDirection: 'row',
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
            placeholder="Search quotes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              ...inputStyle,
              paddingLeft: '40px'
            }}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ ...inputStyle, width: 'auto', minWidth: '140px' }}
        >
          <option value="all">All Status</option>
          <option value="Draft">Draft</option>
          <option value="Sent">Sent</option>
          <option value="Approved">Approved</option>
          <option value="Rejected">Rejected</option>
        </select>
      </div>

      {filteredQuotes.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '48px 24px',
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`
        }}>
          <FileText size={48} style={{ color: theme.textMuted, marginBottom: '16px', opacity: 0.5 }} />
          <p style={{ color: theme.textSecondary, fontSize: '15px' }}>
            {searchTerm || statusFilter !== 'all'
              ? 'No quotes match your search.'
              : 'No quotes yet. Create your first quote.'}
          </p>
        </div>
      ) : (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          {filteredQuotes.map((quote) => {
            const statusStyle = statusColors[quote.status] || statusColors['Draft']
            const customerName = quote.customer?.name || quote.lead?.customer_name || 'No customer'

            return (
              <div
                key={quote.id}
                onClick={() => navigate(`/quotes/${quote.id}`)}
                style={{
                  backgroundColor: theme.bgCard,
                  borderRadius: '12px',
                  border: `1px solid ${theme.border}`,
                  padding: '16px 20px',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = theme.bgCardHover
                  e.currentTarget.style.borderColor = theme.accent
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = theme.bgCard
                  e.currentTarget.style.borderColor = theme.border
                }}
              >
                {/* Quote Number & Customer */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{
                      fontWeight: '600',
                      color: theme.accent,
                      fontSize: '14px'
                    }}>
                      {quote.quote_id || `#${quote.id}`}
                    </span>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: '500',
                      backgroundColor: statusStyle.bg,
                      color: statusStyle.text
                    }}>
                      {quote.status}
                    </span>
                  </div>
                  <p style={{
                    fontWeight: '500',
                    color: theme.text,
                    fontSize: '15px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}>
                    {customerName}
                  </p>
                </div>

                {/* Amount */}
                <div style={{ textAlign: 'right', minWidth: '100px' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'flex-end',
                    gap: '4px',
                    color: theme.text
                  }}>
                    <DollarSign size={14} style={{ color: theme.textMuted }} />
                    <span style={{ fontWeight: '600', fontSize: '15px' }}>
                      {formatCurrency(quote.quote_amount)}
                    </span>
                  </div>
                </div>

                {/* Salesperson */}
                <div style={{ minWidth: '120px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <User size={14} style={{ color: theme.textMuted }} />
                  <span style={{ fontSize: '13px', color: theme.textSecondary }}>
                    {quote.salesperson?.name || '-'}
                  </span>
                </div>

                {/* Date */}
                <div style={{ minWidth: '100px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Calendar size={14} style={{ color: theme.textMuted }} />
                  <span style={{ fontSize: '13px', color: theme.textSecondary }}>
                    {formatDate(quote.sent_date || quote.created_at)}
                  </span>
                </div>

                {/* Arrow */}
                <ChevronRight size={20} style={{ color: theme.textMuted }} />
              </div>
            )
          })}
        </div>
      )}

      {/* Create Quote Modal */}
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
            maxWidth: '450px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '20px',
              borderBottom: `1px solid ${theme.border}`
            }}>
              <h2 style={{
                fontSize: '18px',
                fontWeight: '600',
                color: theme.text
              }}>
                New Quote
              </h2>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '8px',
                  cursor: 'pointer',
                  color: theme.textMuted,
                  borderRadius: '8px'
                }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateQuote} style={{ padding: '20px' }}>
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
                  <label style={labelStyle}>Lead</label>
                  <select
                    name="lead_id"
                    value={formData.lead_id}
                    onChange={handleChange}
                    style={inputStyle}
                  >
                    <option value="">-- Select Lead --</option>
                    {leads.filter(l => l.status !== 'Not Qualified').map(lead => (
                      <option key={lead.id} value={lead.id}>{lead.customer_name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Or Customer</label>
                  <select
                    name="customer_id"
                    value={formData.customer_id}
                    onChange={handleChange}
                    style={inputStyle}
                  >
                    <option value="">-- Select Customer --</option>
                    {customers.map(cust => (
                      <option key={cust.id} value={cust.id}>{cust.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Salesperson</label>
                  <select
                    name="salesperson_id"
                    value={formData.salesperson_id}
                    onChange={handleChange}
                    style={inputStyle}
                  >
                    <option value="">-- Select --</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Service Type</label>
                  <input
                    type="text"
                    name="service_type"
                    value={formData.service_type}
                    onChange={handleChange}
                    style={inputStyle}
                    placeholder="e.g., Lighting Retrofit, Maintenance"
                  />
                </div>
              </div>

              <div style={{
                display: 'flex',
                gap: '12px',
                marginTop: '24px'
              }}>
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
                  {loading ? 'Creating...' : 'Create Quote'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
