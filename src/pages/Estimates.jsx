import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { Plus, Search, FileText, X, ChevronRight, DollarSign, User, Calendar, Upload, Download } from 'lucide-react'
import EntityCard from '../components/EntityCard'
import ImportExportModal, { exportToCSV, exportToXLSX } from '../components/ImportExportModal'
import { estimatesFields, quoteLinesFields } from '../lib/importExportFields'

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

export default function Estimates() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const quotes = useStore((state) => state.quotes)
  const leads = useStore((state) => state.leads)
  const customers = useStore((state) => state.customers)
  const employees = useStore((state) => state.employees)
  const serviceTypes = useStore((state) => state.serviceTypes)
  const fetchQuotes = useStore((state) => state.fetchQuotes)
  const fetchLeads = useStore((state) => state.fetchLeads)

  const [showModal, setShowModal] = useState(false)
  const [associationType, setAssociationType] = useState('lead') // 'lead' | 'customer' | 'newLead'
  const [formData, setFormData] = useState({
    lead_id: '',
    customer_id: '',
    salesperson_id: '',
    service_type: '',
    estimate_name: '',
    notes: ''
  })
  const [newLeadData, setNewLeadData] = useState({
    customer_name: '',
    email: '',
    phone: '',
    address: '',
    service_type: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [showImportExport, setShowImportExport] = useState(false)

  const estimateRelatedTables = [
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

  const filteredEstimates = quotes.filter(quote => {
    const customerName = quote.customer?.name || quote.lead?.customer_name || ''
    const matchesSearch = searchTerm === '' ||
      customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      quote.quote_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      quote.estimate_name?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesStatus = statusFilter === 'all' || quote.status === statusFilter

    return matchesSearch && matchesStatus
  })

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleCreateEstimate = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    let leadId = null
    let customerId = null

    if (associationType === 'lead') {
      leadId = formData.lead_id || null
    } else if (associationType === 'customer') {
      customerId = formData.customer_id || null
    } else if (associationType === 'newLead') {
      if (!newLeadData.customer_name.trim()) {
        setError('Customer name is required for a new lead')
        setLoading(false)
        return
      }
      const leadNumber = `LEAD-${Date.now().toString(36).toUpperCase()}`
      const { data: newLead, error: leadError } = await supabase
        .from('leads')
        .insert([{
          company_id: companyId,
          lead_id: leadNumber,
          customer_name: newLeadData.customer_name.trim(),
          email: newLeadData.email.trim() || null,
          phone: newLeadData.phone.trim() || null,
          address: newLeadData.address.trim() || null,
          service_type: newLeadData.service_type || formData.service_type || null,
          salesperson_id: formData.salesperson_id || null,
          status: 'New',
          quote_generated: true
        }])
        .select()
        .single()

      if (leadError) {
        setError('Failed to create lead: ' + leadError.message)
        setLoading(false)
        return
      }
      leadId = newLead.id
      fetchLeads() // refresh store so the new lead appears in lists
    }

    const estimateNumber = `EST-${Date.now().toString(36).toUpperCase()}`

    const { data, error: insertError } = await supabase
      .from('quotes')
      .insert([{
        company_id: companyId,
        quote_id: estimateNumber,
        lead_id: leadId,
        customer_id: customerId,
        salesperson_id: formData.salesperson_id || null,
        service_type: formData.service_type || null,
        estimate_name: formData.estimate_name || null,
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
    setFormData({ lead_id: '', customer_id: '', salesperson_id: '', service_type: '', estimate_name: '', notes: '' })
    setNewLeadData({ customer_name: '', email: '', phone: '', address: '', service_type: '' })
    setAssociationType('lead')
    await fetchQuotes()
    navigate(`/estimates/${data.id}`)
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
    <div style={{ padding: '24px', maxWidth: '100%', overflowX: 'hidden' }}>
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
          Estimates
        </h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowImportExport(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', backgroundColor: 'transparent', color: theme.accent, border: `1px solid ${theme.border}`, borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>
            <Upload size={18} /> Import
          </button>
          <button onClick={() => exportToXLSX(filteredEstimates, estimatesFields, 'estimates_export', { relatedTables: estimateRelatedTables, parentRefField: 'quote_id', mainSheetName: 'Estimates', companyId })} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', backgroundColor: 'transparent', color: theme.textSecondary, border: `1px solid ${theme.border}`, borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>
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
          <option value="Expired">Expired</option>
        </select>
      </div>

      {filteredEstimates.length === 0 ? (
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
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          {filteredEstimates.map((estimate) => {
            const statusStyle = statusColors[estimate.status] || statusColors['Draft']
            const customerName = estimate.customer?.name || estimate.lead?.customer_name || 'No customer'

            return (
              <EntityCard
                key={estimate.id}
                name={customerName}
                businessName={estimate.customer?.business_name || estimate.lead?.business_name}
                onClick={() => navigate(`/estimates/${estimate.id}`)}
                style={{ padding: '16px 20px' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                {/* Estimate Number & Customer */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                    <span style={{
                      fontWeight: '600',
                      color: theme.accent,
                      fontSize: '14px'
                    }}>
                      {estimate.quote_id || `#${estimate.id}`}
                    </span>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: '500',
                      backgroundColor: statusStyle.bg,
                      color: statusStyle.text
                    }}>
                      {estimate.status}
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
                    {estimate.estimate_name || customerName}
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
                      {formatCurrency(estimate.quote_amount)}
                    </span>
                  </div>
                </div>

                {/* Salesperson */}
                <div style={{ minWidth: '120px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <User size={14} style={{ color: theme.textMuted }} />
                  <span style={{ fontSize: '13px', color: theme.textSecondary }}>
                    {estimate.salesperson?.name || '-'}
                  </span>
                </div>

                {/* Date */}
                <div style={{ minWidth: '100px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Calendar size={14} style={{ color: theme.textMuted }} />
                  <span style={{ fontSize: '13px', color: theme.textSecondary }}>
                    {formatDate(estimate.sent_date || estimate.created_at)}
                  </span>
                </div>

                {/* Arrow */}
                <ChevronRight size={20} style={{ color: theme.textMuted }} />
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

            <form onSubmit={handleCreateEstimate} style={{ padding: '20px' }}>
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
                  <label style={labelStyle}>Estimate Name</label>
                  <input
                    type="text"
                    name="estimate_name"
                    value={formData.estimate_name}
                    onChange={handleChange}
                    placeholder="e.g. Kitchen Remodel, LED Retrofit"
                    style={inputStyle}
                  />
                </div>

                {/* Association type toggle */}
                <div>
                  <label style={labelStyle}>Associate With</label>
                  <div style={{ display: 'flex', borderRadius: '8px', border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
                    {[
                      { key: 'lead', label: 'Existing Lead' },
                      { key: 'customer', label: 'Customer' },
                      { key: 'newLead', label: 'New Lead' }
                    ].map(opt => (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => {
                          setAssociationType(opt.key)
                          setFormData(prev => ({ ...prev, lead_id: '', customer_id: '' }))
                        }}
                        style={{
                          flex: 1,
                          padding: '8px 4px',
                          fontSize: '13px',
                          fontWeight: associationType === opt.key ? '600' : '400',
                          backgroundColor: associationType === opt.key ? theme.accent : 'transparent',
                          color: associationType === opt.key ? '#ffffff' : theme.textSecondary,
                          border: 'none',
                          cursor: 'pointer',
                          borderRight: opt.key !== 'newLead' ? `1px solid ${theme.border}` : 'none'
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Existing Lead picker */}
                {associationType === 'lead' && (
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
                        <option key={lead.id} value={lead.id}>{lead.customer_name}{lead.service_type ? ` — ${lead.service_type}` : ''}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Existing Customer picker */}
                {associationType === 'customer' && (
                  <div>
                    <label style={labelStyle}>Customer</label>
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
                )}

                {/* New Lead inline fields */}
                {associationType === 'newLead' && (
                  <div style={{
                    display: 'flex', flexDirection: 'column', gap: '12px',
                    padding: '14px', borderRadius: '8px',
                    backgroundColor: theme.accentBg, border: `1px solid ${theme.border}`
                  }}>
                    <div>
                      <label style={labelStyle}>Customer Name *</label>
                      <input
                        type="text"
                        value={newLeadData.customer_name}
                        onChange={e => setNewLeadData(prev => ({ ...prev, customer_name: e.target.value }))}
                        placeholder="Business or person name"
                        style={inputStyle}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      <div style={{ flex: 1 }}>
                        <label style={labelStyle}>Email</label>
                        <input
                          type="email"
                          value={newLeadData.email}
                          onChange={e => setNewLeadData(prev => ({ ...prev, email: e.target.value }))}
                          placeholder="email@example.com"
                          style={inputStyle}
                        />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={labelStyle}>Phone</label>
                        <input
                          type="tel"
                          value={newLeadData.phone}
                          onChange={e => setNewLeadData(prev => ({ ...prev, phone: e.target.value }))}
                          placeholder="(555) 555-5555"
                          style={inputStyle}
                        />
                      </div>
                    </div>
                    <div>
                      <label style={labelStyle}>Address</label>
                      <input
                        type="text"
                        value={newLeadData.address}
                        onChange={e => setNewLeadData(prev => ({ ...prev, address: e.target.value }))}
                        placeholder="Street address"
                        style={inputStyle}
                      />
                    </div>
                  </div>
                )}

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
          fields={estimatesFields}
          companyId={companyId}
          defaultValues={{ company_id: companyId, status: 'Draft', quote_amount: 0 }}
          relatedTables={estimateRelatedTables}
          parentRefField="quote_id"
          extraContext="Service estimates / proposals. Map as many columns as possible. Common aliases: quote_id=Estimate #/Estimate ID/Estimate Number, estimate_name=Name/Title/Project, service_type=Service/Type, status=Estimate Status/Stage, summary=Description/Scope/Summary, expiration_date=Expires/Valid Until, service_date=Service Date/Scheduled Date, estimate_message=Message/Customer Message, job_address=Site Address/Service Address/Location, job_city=City, job_state=State, job_zip=ZIP, quote_amount=Amount/Estimate Amount/Price/Total, subtotal=Subtotal/Sub Total, discount=Discount $, discount_percent=Discount %, tax_rate=Tax Rate/Tax %, tax_amount=Tax/Sales Tax, total=Total/Grand Total, utility_incentive=Rebate/Incentive/Utility Incentive, out_of_pocket=Out of Pocket/Customer Cost/Net Cost, deposit_required=Deposit Required, deposit_amount=Deposit/Deposit Paid, deposit_method=Deposit Method/Payment Method, deposit_date=Deposit Date, payment_terms=Payment Terms/Terms, warranty_terms=Warranty, notes=Notes/Comments, internal_notes=Internal Notes"
          onImportComplete={() => fetchQuotes()}
          onClose={() => setShowImportExport(false)}
        />
      )}
    </div>
  )
}
