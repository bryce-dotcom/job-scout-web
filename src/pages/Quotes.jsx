import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { Plus, Search, FileText, X, ChevronRight, DollarSign, User, Calendar, Upload, Download } from 'lucide-react'
import EntityCard from '../components/EntityCard'
import ImportExportModal, { exportToCSV, exportToXLSX } from '../components/ImportExportModal'
import { quotesFields, quoteLinesFields } from '../lib/importExportFields'
import { quoteStatusColors as statusColors } from '../lib/statusColors'
import { useIsMobile } from '../hooks/useIsMobile'

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

export default function Quotes() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const companyId = useStore((state) => state.companyId)
  const quotes = useStore((state) => state.quotes)
  const leads = useStore((state) => state.leads)
  const customers = useStore((state) => state.customers)
  const employees = useStore((state) => state.employees)
  const serviceTypes = useStore((state) => state.serviceTypes)
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
  const [showImportExport, setShowImportExport] = useState(false)

  const quoteRelatedTables = [
    {
      tableName: 'quote_lines',
      sheetName: 'Line Items',
      parentIdField: 'quote_id',
      parentRefLabel: 'Estimate ID',
      fields: quoteLinesFields,
      fetchData: async (parentIds) => {
        const { data } = await supabase.from('quote_lines').select('*, item:products_services(name)').in('quote_id', parentIds)
        return (data || []).map(r => ({
          ...r,
          item_name: r.item?.name || r.item_name || '',
          price: r.price ?? r.unit_price ?? 0,
          line_total: r.line_total ?? r.total ?? 0,
        }))
      },
    },
  ]

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
    <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '100%', overflowX: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'stretch' : 'center',
        justifyContent: 'space-between',
        gap: '16px',
        marginBottom: '24px',
        flexWrap: 'wrap'
      }}>
        <h1 style={{
          fontSize: isMobile ? '20px' : '24px',
          fontWeight: '700',
          color: theme.text
        }}>
          Estimates
        </h1>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={() => setShowImportExport(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', backgroundColor: 'transparent', color: theme.accent, border: `1px solid ${theme.border}`, borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>
            <Upload size={18} /> Import
          </button>
          <button onClick={() => exportToXLSX(filteredQuotes, quotesFields, 'quotes_export', { relatedTables: quoteRelatedTables, parentRefField: 'quote_id', mainSheetName: 'Estimates', companyId })} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', backgroundColor: 'transparent', color: theme.textSecondary, border: `1px solid ${theme.border}`, borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>
            <Download size={18} /> Export
          </button>
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
            New Estimate
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fit, minmax(140px, 1fr))',
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
        flexDirection: isMobile ? 'column' : 'row',
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
            placeholder="Search estimates..."
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
              ? 'No estimates match your search.'
              : 'No estimates yet. Create your first estimate.'}
          </p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '16px'
        }}>
          {filteredQuotes.map((quote) => {
            const statusStyle = statusColors[quote.status] || statusColors['Draft']
            const customerName = quote.customer?.name || quote.lead?.customer_name || 'No customer'

            return (
              <EntityCard
                key={quote.id}
                name={customerName}
                businessName={quote.customer?.business_name || quote.lead?.business_name}
                onClick={() => navigate(`/quotes/${quote.id}`)}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      width: '44px', height: '44px',
                      backgroundColor: theme.accentBg,
                      borderRadius: '10px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      <FileText size={22} style={{ color: theme.accent }} />
                    </div>
                    <div>
                      <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '2px' }}>
                        {customerName}
                      </h3>
                      <p style={{ fontSize: '13px', color: theme.accent, fontWeight: '500' }}>
                        {quote.quote_id || `#${quote.id}`}
                      </p>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                  {quote.salesperson?.name && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: theme.textSecondary }}>
                      <User size={14} />
                      <span>{quote.salesperson.name}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: theme.textSecondary }}>
                    <Calendar size={14} />
                    <span>{formatDate(quote.sent_date || quote.created_at)}</span>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '18px', fontWeight: '700', color: theme.text }}>
                    {formatCurrency(quote.quote_amount)}
                  </span>
                  <span style={{
                    padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '500',
                    backgroundColor: statusStyle.bg, color: statusStyle.text
                  }}>
                    {quote.status}
                  </span>
                </div>
              </EntityCard>
            )
          })}
        </div>
      )}

      {/* Create Estimate Modal */}
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
            maxWidth: isMobile ? 'calc(100vw - 32px)' : '450px',
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column'
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
                New Estimate
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

            <form onSubmit={handleCreateQuote} style={{ padding: '20px', maxHeight: '70vh', overflowY: 'auto' }}>
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
                    {leads.filter(l => l.status !== 'Lost' && l.status !== 'Not Qualified').map(lead => (
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
                  <select
                    name="service_type"
                    value={formData.service_type}
                    onChange={handleChange}
                    style={inputStyle}
                  >
                    <option value="">-- Select --</option>
                    {serviceTypes.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
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
                  {loading ? 'Creating...' : 'Create Estimate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showImportExport && (
        <ImportExportModal
          tableName="quotes"
          entityName="Estimates"
          fields={quotesFields}
          companyId={companyId}
          defaultValues={{ company_id: companyId, status: 'Draft', quote_amount: 0 }}
          relatedTables={quoteRelatedTables}
          parentRefField="quote_id"
          extraContext="Service estimates / proposals. Map as many columns as possible. Common aliases: quote_id=Estimate #/Estimate ID/Estimate Number, service_type=Service/Type, status=Estimate Status/Stage, quote_date=Date/Created, expiration_date=Expires/Valid Until, job_address=Site Address/Service Address/Location, job_city=City, job_state=State, job_zip=ZIP, quote_amount=Amount/Estimate Amount/Price, subtotal=Subtotal, discount=Discount, discount_percent=Discount %, tax_rate=Tax Rate/Tax %, tax_amount=Tax/Sales Tax, total=Total/Grand Total, utility_incentive=Rebate/Incentive/Utility Incentive, out_of_pocket=Out of Pocket/Customer Cost, deposit_required=Deposit Required, payment_terms=Payment Terms/Terms, warranty_terms=Warranty, notes=Notes/Comments, internal_notes=Internal Notes"
          onImportComplete={() => fetchQuotes()}
          onClose={() => setShowImportExport(false)}
        />
      )}
    </div>
  )
}
