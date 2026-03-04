import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { Plus, Search, FileText, X, ChevronRight, DollarSign, CheckCircle, Pencil, Trash2, Zap } from 'lucide-react'
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

const emptyUtilityInvoice = {
  utility_name: '',
  job_id: '',
  amount: '',
  payment_status: 'Pending',
  notes: '',
  project_cost: '',
  incentive_amount: '',
  net_cost: '',
  customer_name: ''
}

export default function Invoices() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const companyId = useStore((state) => state.companyId)
  const invoices = useStore((state) => state.invoices)
  const utilityInvoices = useStore((state) => state.utilityInvoices)
  const customers = useStore((state) => state.customers)
  const jobs = useStore((state) => state.jobs)
  const fetchInvoices = useStore((state) => state.fetchInvoices)
  const fetchUtilityInvoices = useStore((state) => state.fetchUtilityInvoices)

  // Type filter from URL param
  const initialType = searchParams.get('type') || 'all'
  const [typeFilter, setTypeFilter] = useState(
    initialType === 'utility' ? 'utility' : initialType === 'customer' ? 'customer' : 'all'
  )

  // Customer invoice modal
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

  // Utility invoice modal
  const [showUtilityModal, setShowUtilityModal] = useState(false)
  const [editingUtilityInvoice, setEditingUtilityInvoice] = useState(null)
  const [utilityFormData, setUtilityFormData] = useState(emptyUtilityInvoice)

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
    fetchUtilityInvoices()
  }, [companyId, navigate, fetchInvoices, fetchUtilityInvoices])

  // Sync typeFilter to URL
  const handleTypeFilter = (type) => {
    setTypeFilter(type)
    if (type === 'all') {
      setSearchParams({})
    } else {
      setSearchParams({ type })
    }
  }

  // Customer invoice filtering
  const filteredCustomerInvoices = invoices.filter(invoice => {
    const customerName = invoice.customer?.name || ''
    const matchesSearch = searchTerm === '' ||
      customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.invoice_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      invoice.job?.job_title?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === 'all' || invoice.payment_status === statusFilter
    return matchesSearch && matchesStatus
  })

  // Utility invoice filtering
  const filteredUtilityInvoices = utilityInvoices.filter(inv => {
    const term = searchTerm.toLowerCase()
    const matchesSearch = searchTerm === '' ||
      inv.utility_name?.toLowerCase().includes(term) ||
      inv.customer_name?.toLowerCase().includes(term) ||
      String(inv.job_id || '').toLowerCase().includes(term)
    const matchesStatus = statusFilter === 'all' || inv.payment_status === statusFilter
    return matchesSearch && matchesStatus
  })

  // --- Customer invoice handlers ---
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

  // --- Utility invoice handlers ---
  const handleUtilityChange = (e) => {
    const { name, value } = e.target
    setUtilityFormData(prev => ({ ...prev, [name]: value }))
  }

  const openUtilityAddModal = () => {
    setEditingUtilityInvoice(null)
    setUtilityFormData(emptyUtilityInvoice)
    setError(null)
    setShowUtilityModal(true)
  }

  const openUtilityEditModal = (invoice) => {
    setEditingUtilityInvoice(invoice)
    setUtilityFormData({
      utility_name: invoice.utility_name || '',
      job_id: invoice.job_id || '',
      amount: invoice.amount || '',
      payment_status: invoice.payment_status || 'Pending',
      notes: invoice.notes || '',
      project_cost: invoice.project_cost || '',
      incentive_amount: invoice.incentive_amount || '',
      net_cost: invoice.net_cost || '',
      customer_name: invoice.customer_name || ''
    })
    setError(null)
    setShowUtilityModal(true)
  }

  const closeUtilityModal = () => {
    setShowUtilityModal(false)
    setEditingUtilityInvoice(null)
    setUtilityFormData(emptyUtilityInvoice)
    setError(null)
  }

  const handleUtilitySubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const payload = {
      company_id: companyId,
      utility_name: utilityFormData.utility_name || null,
      job_id: utilityFormData.job_id || null,
      amount: parseFloat(utilityFormData.amount) || null,
      payment_status: utilityFormData.payment_status || 'Pending',
      notes: utilityFormData.notes || null,
      project_cost: parseFloat(utilityFormData.project_cost) || null,
      incentive_amount: parseFloat(utilityFormData.incentive_amount) || null,
      net_cost: parseFloat(utilityFormData.net_cost) || null,
      customer_name: utilityFormData.customer_name || null,
      updated_at: new Date().toISOString()
    }

    let result
    if (editingUtilityInvoice) {
      result = await supabase.from('utility_invoices').update(payload).eq('id', editingUtilityInvoice.id)
    } else {
      result = await supabase.from('utility_invoices').insert([payload])
    }

    if (result.error) {
      setError(result.error.message)
      setLoading(false)
      return
    }

    await fetchUtilityInvoices()
    closeUtilityModal()
    setLoading(false)
  }

  const handleUtilityDelete = async (invoice) => {
    if (!confirm('Delete this utility rebate?')) return
    await supabase.from('utility_invoices').delete().eq('id', invoice.id)
    await fetchUtilityInvoices()
  }

  // --- Formatting ---
  const formatCurrency = (amount) => {
    if (!amount) return '$0.00'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
  }

  const formatDate = (date) => {
    if (!date) return '-'
    return new Date(date).toLocaleDateString()
  }

  // --- Stats ---
  const customerPendingCount = invoices.filter(i => i.payment_status === 'Pending').length
  const customerPaidCount = invoices.filter(i => i.payment_status === 'Paid').length
  const customerTotalPending = invoices.filter(i => i.payment_status === 'Pending').reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0)
  const customerTotalPaid = invoices.filter(i => i.payment_status === 'Paid').reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0)

  const utilityPendingCount = utilityInvoices.filter(i => i.payment_status === 'Pending').length
  const utilityPaidCount = utilityInvoices.filter(i => i.payment_status === 'Paid').length
  const utilityTotalPending = utilityInvoices.filter(i => i.payment_status === 'Pending').reduce((sum, i) => sum + (parseFloat(i.amount || i.incentive_amount) || 0), 0)
  const utilityTotalPaid = utilityInvoices.filter(i => i.payment_status === 'Paid').reduce((sum, i) => sum + (parseFloat(i.amount || i.incentive_amount) || 0), 0)

  // --- Styles ---
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

  const filterBtnStyle = (isActive) => ({
    padding: '8px 16px',
    backgroundColor: isActive ? theme.accent : 'transparent',
    color: isActive ? '#fff' : theme.textMuted,
    border: 'none',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.15s ease'
  })

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
          Invoices
        </h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          {(typeFilter === 'all' || typeFilter === 'customer') && (
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
          )}
          {(typeFilter === 'all' || typeFilter === 'utility') && (
            <button
              onClick={openUtilityAddModal}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 16px',
                backgroundColor: typeFilter === 'utility' ? theme.accent : 'transparent',
                color: typeFilter === 'utility' ? '#ffffff' : theme.accent,
                border: typeFilter === 'utility' ? 'none' : `1px solid ${theme.accent}`,
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              <Zap size={18} />
              New Rebate Claim
            </button>
          )}
        </div>
      </div>

      {/* Filter Buttons */}
      <div style={{
        display: 'flex',
        gap: '8px',
        backgroundColor: theme.bg,
        padding: '4px',
        borderRadius: '10px',
        marginBottom: '24px',
        width: 'fit-content'
      }}>
        <button onClick={() => handleTypeFilter('all')} style={filterBtnStyle(typeFilter === 'all')}>All Invoices</button>
        <button onClick={() => handleTypeFilter('customer')} style={filterBtnStyle(typeFilter === 'customer')}>Customer</button>
        <button onClick={() => handleTypeFilter('utility')} style={filterBtnStyle(typeFilter === 'utility')}>Utility Rebates</button>
      </div>

      {/* Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: '12px',
        marginBottom: '24px'
      }}>
        {typeFilter !== 'utility' && (
          <>
            <div style={{
              backgroundColor: theme.bgCard,
              borderRadius: '12px',
              border: `1px solid ${theme.border}`,
              padding: '16px',
              textAlign: 'center'
            }}>
              <p style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '4px' }}>Pending</p>
              <p style={{ fontSize: '24px', fontWeight: '600', color: '#c28b38' }}>{customerPendingCount}</p>
              <p style={{ fontSize: '12px', color: theme.textMuted }}>{formatCurrency(customerTotalPending)}</p>
            </div>
            <div style={{
              backgroundColor: theme.bgCard,
              borderRadius: '12px',
              border: `1px solid ${theme.border}`,
              padding: '16px',
              textAlign: 'center'
            }}>
              <p style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '4px' }}>Paid</p>
              <p style={{ fontSize: '24px', fontWeight: '600', color: '#4a7c59' }}>{customerPaidCount}</p>
              <p style={{ fontSize: '12px', color: theme.textMuted }}>{formatCurrency(customerTotalPaid)}</p>
            </div>
          </>
        )}
        {typeFilter === 'utility' && (
          <>
            <div style={{
              backgroundColor: theme.bgCard,
              borderRadius: '12px',
              border: `1px solid ${theme.border}`,
              padding: '16px',
              textAlign: 'center'
            }}>
              <p style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '4px' }}>Pending Rebates</p>
              <p style={{ fontSize: '24px', fontWeight: '600', color: '#c28b38' }}>{utilityPendingCount}</p>
              <p style={{ fontSize: '12px', color: theme.textMuted }}>{formatCurrency(utilityTotalPending)}</p>
            </div>
            <div style={{
              backgroundColor: theme.bgCard,
              borderRadius: '12px',
              border: `1px solid ${theme.border}`,
              padding: '16px',
              textAlign: 'center'
            }}>
              <p style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '4px' }}>Collected Rebates</p>
              <p style={{ fontSize: '24px', fontWeight: '600', color: '#4a7c59' }}>{utilityPaidCount}</p>
              <p style={{ fontSize: '12px', color: theme.textMuted }}>{formatCurrency(utilityTotalPaid)}</p>
            </div>
          </>
        )}
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

      {/* ===== ALL INVOICES VIEW ===== */}
      {typeFilter === 'all' && (() => {
        // Build unified list
        const allItems = [
          ...filteredCustomerInvoices.map(inv => ({ ...inv, _type: 'customer' })),
          ...filteredUtilityInvoices.map(inv => ({ ...inv, _type: 'utility' }))
        ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))

        if (allItems.length === 0) {
          return (
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
          )
        }

        return (
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            overflow: 'hidden'
          }}>
            {/* Header row */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '90px 100px 1fr 1fr 120px 100px 100px',
              gap: '12px',
              padding: '14px 20px',
              backgroundColor: theme.accentBg,
              borderBottom: `1px solid ${theme.border}`,
              fontSize: '12px',
              fontWeight: '600',
              color: theme.textMuted,
              textTransform: 'uppercase'
            }}>
              <div>Type</div>
              <div>Reference</div>
              <div>Name</div>
              <div>Description</div>
              <div style={{ textAlign: 'right' }}>Amount</div>
              <div style={{ textAlign: 'center' }}>Status</div>
              <div>Date</div>
            </div>

            {allItems.map((item) => {
              const isCustomer = item._type === 'customer'
              const statusStyle = statusColors[item.payment_status] || statusColors['Pending']
              const ref = isCustomer ? item.invoice_id : `UTL-${item.id}`
              const name = isCustomer ? (item.customer?.name || 'No customer') : (item.customer_name || '-')
              const desc = isCustomer ? (item.job?.job_title || item.job_description || '') : (item.utility_name || '')
              const amount = isCustomer ? item.amount : (item.incentive_amount || item.amount)

              return (
                <div
                  key={`${item._type}-${item.id}`}
                  onClick={() => navigate(isCustomer ? `/invoices/${item.id}` : `/utility-invoices/${item.id}`)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '90px 100px 1fr 1fr 120px 100px 100px',
                    gap: '12px',
                    padding: '14px 20px',
                    borderBottom: `1px solid ${theme.border}`,
                    alignItems: 'center',
                    cursor: 'pointer',
                    transition: 'background-color 0.1s ease'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.bgCardHover}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <div>
                    <span style={{
                      padding: '3px 8px',
                      borderRadius: '6px',
                      fontSize: '11px',
                      fontWeight: '600',
                      backgroundColor: isCustomer ? 'rgba(59,130,246,0.12)' : 'rgba(20,184,166,0.12)',
                      color: isCustomer ? '#3b82f6' : '#14b8a6'
                    }}>
                      {isCustomer ? 'Customer' : 'Utility'}
                    </span>
                  </div>
                  <div style={{ fontWeight: '600', color: theme.accent, fontSize: '13px' }}>
                    {ref}
                  </div>
                  <div style={{ fontWeight: '500', color: theme.text, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {name}
                  </div>
                  <div style={{ fontSize: '13px', color: theme.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {desc}
                  </div>
                  <div style={{ textAlign: 'right', fontWeight: '600', color: theme.text }}>
                    {formatCurrency(amount)}
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
                      {item.payment_status}
                    </span>
                  </div>
                  <div style={{ fontSize: '13px', color: theme.textSecondary }}>
                    {formatDate(item.created_at)}
                  </div>
                </div>
              )
            })}
          </div>
        )
      })()}

      {/* ===== CUSTOMER INVOICES VIEW ===== */}
      {typeFilter === 'customer' && (
        <>
          {filteredCustomerInvoices.length === 0 ? (
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
              {filteredCustomerInvoices.map((invoice) => {
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
        </>
      )}

      {/* ===== UTILITY REBATES VIEW ===== */}
      {typeFilter === 'utility' && (
        <>
          {filteredUtilityInvoices.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '48px 24px',
              backgroundColor: theme.bgCard,
              borderRadius: '12px',
              border: `1px solid ${theme.border}`
            }}>
              <FileText size={48} style={{ color: theme.textMuted, marginBottom: '16px', opacity: 0.5 }} />
              <p style={{ color: theme.textSecondary, fontSize: '15px' }}>
                No utility rebates found. Add your first rebate claim.
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
                gridTemplateColumns: '90px 1fr 1fr 1fr 80px 100px 100px 100px 70px',
                gap: '12px',
                padding: '14px 20px',
                backgroundColor: theme.accentBg,
                borderBottom: `1px solid ${theme.border}`,
                fontSize: '12px',
                fontWeight: '600',
                color: theme.textMuted,
                textTransform: 'uppercase'
              }}>
                <div>Date</div>
                <div>Customer</div>
                <div>Utility</div>
                <div>Status</div>
                <div style={{ textAlign: 'right' }}>Job</div>
                <div style={{ textAlign: 'right' }}>Project Cost</div>
                <div style={{ textAlign: 'right' }}>Incentive</div>
                <div style={{ textAlign: 'right' }}>Net Cost</div>
                <div style={{ textAlign: 'right' }}>Actions</div>
              </div>

              {filteredUtilityInvoices.map((invoice) => (
                <div
                  key={invoice.id}
                  onClick={() => navigate(`/utility-invoices/${invoice.id}`)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '90px 1fr 1fr 1fr 80px 100px 100px 100px 70px',
                    gap: '12px',
                    padding: '16px 20px',
                    borderBottom: `1px solid ${theme.border}`,
                    alignItems: 'center',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ fontSize: '14px', color: theme.textSecondary }}>
                    {formatDate(invoice.created_at)}
                  </div>
                  <div style={{ fontWeight: '500', color: theme.text, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {invoice.customer_name || '-'}
                  </div>
                  <div style={{ fontWeight: '500', color: theme.text, fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {invoice.utility_name || '-'}
                  </div>
                  <div style={{ fontSize: '14px', color: theme.textSecondary }}>
                    {invoice.payment_status || '-'}
                  </div>
                  <div style={{ textAlign: 'right', fontWeight: '500', color: theme.text }}>
                    {invoice.job_id || '-'}
                  </div>
                  <div style={{ textAlign: 'right', fontWeight: '600', color: theme.text }}>
                    {formatCurrency(invoice.project_cost || invoice.amount)}
                  </div>
                  <div style={{ textAlign: 'right', fontWeight: '600', color: '#d4940a' }}>
                    {formatCurrency(invoice.incentive_amount)}
                  </div>
                  <div style={{ textAlign: 'right', fontWeight: '600', color: theme.text }}>
                    {formatCurrency(invoice.net_cost)}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '4px' }}>
                    <button
                      onClick={(e) => { e.stopPropagation(); openUtilityEditModal(invoice) }}
                      style={{
                        padding: '6px',
                        backgroundColor: 'transparent',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        color: theme.textMuted
                      }}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleUtilityDelete(invoice) }}
                      style={{
                        padding: '6px',
                        backgroundColor: 'transparent',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        color: theme.textMuted
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Create Customer Invoice Modal */}
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

      {/* Utility Rebate Modal */}
      {showUtilityModal && (
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
                {editingUtilityInvoice ? 'Edit Rebate Claim' : 'New Rebate Claim'}
              </h2>
              <button onClick={closeUtilityModal} style={{ background: 'none', border: 'none', padding: '8px', cursor: 'pointer', color: theme.textMuted }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleUtilitySubmit} style={{ padding: '20px' }}>
              {error && (
                <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '14px' }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Utility Name *</label>
                    <input type="text" name="utility_name" value={utilityFormData.utility_name} onChange={handleUtilityChange} required style={inputStyle} placeholder="Utility name" />
                  </div>
                  <div>
                    <label style={labelStyle}>Customer Name</label>
                    <input type="text" name="customer_name" value={utilityFormData.customer_name} onChange={handleUtilityChange} style={inputStyle} placeholder="Customer name" />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Job ID</label>
                    <input type="text" name="job_id" value={utilityFormData.job_id} onChange={handleUtilityChange} style={inputStyle} placeholder="Job ID" />
                  </div>
                  <div>
                    <label style={labelStyle}>Payment Status</label>
                    <select name="payment_status" value={utilityFormData.payment_status} onChange={handleUtilityChange} style={inputStyle}>
                      <option value="Pending">Pending</option>
                      <option value="Paid">Paid</option>
                      <option value="Overdue">Overdue</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Project Cost</label>
                    <input type="number" name="project_cost" value={utilityFormData.project_cost} onChange={handleUtilityChange} step="0.01" style={inputStyle} placeholder="0.00" />
                  </div>
                  <div>
                    <label style={labelStyle}>Incentive Amount</label>
                    <input type="number" name="incentive_amount" value={utilityFormData.incentive_amount} onChange={handleUtilityChange} step="0.01" style={inputStyle} placeholder="0.00" />
                  </div>
                  <div>
                    <label style={labelStyle}>Net Cost</label>
                    <input type="number" name="net_cost" value={utilityFormData.net_cost} onChange={handleUtilityChange} step="0.01" style={inputStyle} placeholder="0.00" />
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Notes</label>
                  <textarea name="notes" value={utilityFormData.notes} onChange={handleUtilityChange} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button type="button" onClick={closeUtilityModal} style={{
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
                  {loading ? 'Saving...' : (editingUtilityInvoice ? 'Update' : 'Add Rebate')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
