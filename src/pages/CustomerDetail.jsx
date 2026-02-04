import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import {
  ArrowLeft, FileText, Briefcase, Plus, Send, Phone, Mail,
  MapPin, Building2, User, X, Save, Trash2, Package, UserPlus,
  Search, ChevronLeft, Grid3X3, Wrench, Zap, Droplets, Leaf, ShoppingBag, Box
} from 'lucide-react'
import Tooltip from '../components/Tooltip'
import EmptyState from '../components/EmptyState'

const defaultTheme = {
  bg: '#f7f5ef',
  bgCard: '#ffffff',
  border: '#d6cdb8',
  text: '#2c3530',
  textSecondary: '#4d5a52',
  textMuted: '#7d8a7f',
  accent: '#5a6349',
  accentBg: 'rgba(90,99,73,0.12)'
}

export default function CustomerDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const employees = useStore((state) => state.employees)
  const products = useStore((state) => state.products)
  const fetchCustomers = useStore((state) => state.fetchCustomers)
  const serviceTypes = useStore((state) => state.serviceTypes)
  const laborRates = useStore((state) => state.laborRates)
  const inventory = useStore((state) => state.inventory)

  const [customer, setCustomer] = useState(null)
  const [quotes, setQuotes] = useState([])
  const [jobs, setJobs] = useState([])
  const [activeTab, setActiveTab] = useState('info')
  const [loading, setLoading] = useState(true)
  const [isMobile, setIsMobile] = useState(false)

  // Quote creation modal state
  const [showQuoteModal, setShowQuoteModal] = useState(false)
  const [quoteLines, setQuoteLines] = useState([])
  const [quoteDiscount, setQuoteDiscount] = useState(0)
  const [quoteNotes, setQuoteNotes] = useState('')
  const [savingQuote, setSavingQuote] = useState(false)

  // Product catalog picker state
  const [productGroups, setProductGroups] = useState([])
  const [catalogServiceType, setCatalogServiceType] = useState('')
  const [selectedGroup, setSelectedGroup] = useState(null)
  const [catalogSearch, setCatalogSearch] = useState('')
  const [showCatalogPicker, setShowCatalogPicker] = useState(false)

  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    if (id && companyId) {
      fetchCustomerData()
    }
  }, [id, companyId])

  const fetchCustomerData = async () => {
    setLoading(true)

    // Fetch customer with relations
    const { data: customerData, error: customerError } = await supabase
      .from('customers')
      .select('*, salesperson:employees(id, name)')
      .eq('id', id)
      .single()

    if (customerError) {
      console.error('Error fetching customer:', customerError)
      setLoading(false)
      return
    }

    setCustomer(customerData)

    // Fetch quotes linked to this customer
    const { data: quoteData } = await supabase
      .from('quotes')
      .select('*, quote_lines(*)')
      .eq('customer_id', id)
      .order('created_at', { ascending: false })
    setQuotes(quoteData || [])

    // Fetch jobs linked to this customer
    const { data: jobData } = await supabase
      .from('jobs')
      .select('*, salesperson:employees(id, name)')
      .eq('customer_id', id)
      .order('created_at', { ascending: false })
    setJobs(jobData || [])

    setLoading(false)
  }

  // Fetch product groups for catalog
  const fetchProductGroups = async () => {
    const { data } = await supabase
      .from('product_groups')
      .select('*')
      .eq('company_id', companyId)
      .order('name')
    setProductGroups(data || [])
  }

  // Open quote creation modal
  const openQuoteModal = async () => {
    setQuoteLines([])
    setQuoteDiscount(0)
    setQuoteNotes('')
    setCatalogServiceType(serviceTypes[0] || '')
    setSelectedGroup(null)
    setCatalogSearch('')
    setShowCatalogPicker(false)
    await fetchProductGroups()
    setShowQuoteModal(true)
  }

  // Get service type icon
  const getServiceTypeIcon = (type) => {
    const iconMap = {
      'Energy Efficiency': Zap,
      'Electrical': Zap,
      'Exterior Cleaning': Droplets,
      'Landscaping': Leaf,
      'Retail': ShoppingBag,
      'General': Grid3X3
    }
    return iconMap[type] || Wrench
  }

  // Calculate labor cost for product
  const calculateLaborCost = (product) => {
    if (!product.allotted_time_hours) return 0

    // Find the labor rate for this product
    let rate = null
    if (product.labor_rate_id) {
      rate = laborRates.find(r => r.id === product.labor_rate_id)
    }
    // Fall back to default rate
    if (!rate) {
      rate = laborRates.find(r => r.is_default)
    }

    if (!rate) return 0
    return product.allotted_time_hours * (rate.rate_per_hour || 0) * (rate.multiplier || 1)
  }

  // Get inventory count for product
  const getInventoryCount = (productId) => {
    const inv = inventory.find(i => i.product_id === productId)
    return inv?.quantity || 0
  }

  // Select product from catalog and add to quote
  const handleSelectProduct = (product) => {
    const laborCost = calculateLaborCost(product)
    const totalPrice = (product.unit_price || 0) + laborCost

    const newLine = {
      id: Date.now(),
      product_id: product.id,
      description: product.name,
      quantity: 1,
      unit_price: totalPrice,
      labor_cost: laborCost,
      line_total: totalPrice
    }
    setQuoteLines([...quoteLines, newLine])
    setSelectedGroup(null)
    setCatalogSearch('')
    setShowCatalogPicker(false)
  }

  // Add custom line item
  const handleAddCustomLine = () => {
    const newLine = {
      id: Date.now(),
      product_id: null,
      description: '',
      quantity: 1,
      unit_price: 0,
      line_total: 0
    }
    setQuoteLines([...quoteLines, newLine])
  }

  // Update line item
  const handleUpdateLine = (lineId, field, value) => {
    setQuoteLines(quoteLines.map(line => {
      if (line.id === lineId) {
        const updated = { ...line, [field]: value }
        if (field === 'quantity' || field === 'unit_price') {
          updated.line_total = (parseFloat(updated.quantity) || 0) * (parseFloat(updated.unit_price) || 0)
        }
        return updated
      }
      return line
    }))
  }

  // Remove line item
  const handleRemoveLine = (lineId) => {
    setQuoteLines(quoteLines.filter(line => line.id !== lineId))
  }

  // Calculate totals
  const quoteSubtotal = quoteLines.reduce((sum, line) => sum + (line.line_total || 0), 0)
  const quoteTotal = quoteSubtotal - (parseFloat(quoteDiscount) || 0)

  // Save quote
  const handleSaveQuote = async () => {
    if (quoteLines.length === 0) {
      alert('Please add at least one line item')
      return
    }

    setSavingQuote(true)

    // Create quote with customer_id
    const { data: quote, error: quoteError } = await supabase
      .from('quotes')
      .insert({
        company_id: companyId,
        customer_id: customer.id,
        quote_amount: quoteTotal,
        discount: parseFloat(quoteDiscount) || 0,
        status: 'Draft',
        notes: quoteNotes || null
      })
      .select()
      .single()

    if (quoteError) {
      console.error('Error creating quote:', quoteError)
      alert('Error creating quote: ' + quoteError.message)
      setSavingQuote(false)
      return
    }

    // Create quote lines
    const linesToInsert = quoteLines.map(line => ({
      quote_id: quote.id,
      item_id: line.product_id,
      item_name: line.description,
      quantity: parseFloat(line.quantity) || 1,
      price: parseFloat(line.unit_price) || 0,
      line_total: line.line_total || 0
    }))

    const { error: linesError } = await supabase
      .from('quote_lines')
      .insert(linesToInsert)

    if (linesError) {
      console.error('Error creating quote lines:', linesError)
    }

    setSavingQuote(false)
    setShowQuoteModal(false)
    await fetchCustomerData()
  }

  // Mark quote as sent
  const handleSendQuote = async (quoteId) => {
    await supabase
      .from('quotes')
      .update({ status: 'Sent', sent_at: new Date().toISOString() })
      .eq('id', quoteId)

    await fetchCustomerData()
    alert('Quote marked as sent!')
  }

  // Send customer to setter pipeline
  const handleSendToSetter = async () => {
    const confirmed = window.confirm(
      `Send ${customer.name} to the Lead Setter pipeline?\n\nThis will create a new lead from this customer's information so a setter can schedule a new appointment.`
    )

    if (!confirmed) return

    const { data: newLead, error } = await supabase
      .from('leads')
      .insert({
        company_id: companyId,
        customer_name: customer.name,
        email: customer.email || null,
        phone: customer.phone || null,
        address: customer.address || null,
        business_name: customer.business_name || null,
        status: 'New',
        lead_source: 'Existing Customer',
        customer_id: customer.id
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating lead:', error)
      alert('Error creating lead: ' + error.message)
      return
    }

    alert(`Lead created for ${customer.name}. Redirecting to Lead Setter...`)
    navigate('/lead-setter')
  }

  const getStatusColor = (status) => {
    const colors = {
      'Active': '#16a34a',
      'Inactive': '#6b7280',
      'Prospect': '#ca8a04'
    }
    return colors[status] || theme.accent
  }

  const getJobStatusColor = (status) => {
    const colors = {
      'Scheduled': '#3b82f6',
      'In Progress': '#f59e0b',
      'Completed': '#16a34a',
      'On Hold': '#6b7280',
      'Cancelled': '#dc2626'
    }
    return colors[status] || theme.accent
  }

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: theme.textMuted }}>
        Loading...
      </div>
    )
  }

  if (!customer) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: theme.textMuted }}>
        Customer not found
      </div>
    )
  }

  const tabs = [
    { id: 'info', label: 'Info', icon: FileText, hint: 'Customer contact information' },
    { id: 'quotes', label: `Quotes (${quotes.length})`, icon: FileText, hint: 'Price proposals for this customer' },
    { id: 'jobs', label: `Jobs (${jobs.length})`, icon: Briefcase, hint: 'Work orders for this customer' }
  ]

  return (
    <div style={{ padding: isMobile ? '16px' : '24px', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        alignItems: isMobile ? 'stretch' : 'flex-start',
        gap: isMobile ? '12px' : '16px',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
          <button
            onClick={() => navigate(-1)}
            style={{
              padding: isMobile ? '12px' : '8px',
              minWidth: isMobile ? '44px' : 'auto',
              minHeight: isMobile ? '44px' : 'auto',
              background: 'none',
              border: `1px solid ${theme.border}`,
              borderRadius: '8px',
              cursor: 'pointer',
              color: theme.textSecondary,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <ArrowLeft size={20} />
          </button>

          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: '700', color: theme.text, margin: 0 }}>
                {customer.name}
              </h1>
              <span style={{
                padding: '4px 10px',
                backgroundColor: getStatusColor(customer.status) + '20',
                color: getStatusColor(customer.status),
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: '600'
              }}>
                {customer.status}
              </span>
            </div>
            {customer.business_name && (
              <div style={{ fontSize: isMobile ? '13px' : '14px', color: theme.textMuted }}>
                {customer.business_name}
              </div>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {customer.phone && (
            <a
              href={`tel:${customer.phone}`}
              style={{
                padding: isMobile ? '12px 16px' : '10px 14px',
                minHeight: isMobile ? '44px' : 'auto',
                backgroundColor: '#dcfce7',
                color: '#166534',
                border: 'none',
                borderRadius: '8px',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                fontSize: '14px',
                fontWeight: '500',
                flex: isMobile ? 1 : 'none'
              }}
            >
              <Phone size={16} />
              Call
            </a>
          )}
          {customer.email && (
            <a
              href={`mailto:${customer.email}`}
              style={{
                padding: isMobile ? '12px 16px' : '10px 14px',
                minHeight: isMobile ? '44px' : 'auto',
                backgroundColor: theme.accentBg,
                color: theme.accent,
                border: 'none',
                borderRadius: '8px',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                fontSize: '14px',
                fontWeight: '500',
                flex: isMobile ? 1 : 'none'
              }}
            >
              <Mail size={16} />
              Email
            </a>
          )}
          <Tooltip text="Create a new lead from this customer for the setter to schedule an appointment">
            <button
              onClick={handleSendToSetter}
              style={{
                padding: isMobile ? '12px 16px' : '10px 14px',
                minHeight: isMobile ? '44px' : 'auto',
                backgroundColor: '#dbeafe',
                color: '#1d4ed8',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                fontSize: '14px',
                fontWeight: '500',
                flex: isMobile ? 1 : 'none'
              }}
            >
              <UserPlus size={16} />
              Send to Setter
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        marginBottom: '24px',
        borderBottom: `1px solid ${theme.border}`,
        paddingBottom: '12px'
      }}>
        <div style={{
          display: 'flex',
          gap: '8px',
          minWidth: 'max-content',
          padding: '4px'
        }}>
          {tabs.map(tab => {
            const Icon = tab.icon
            return (
              <Tooltip key={tab.id} text={tab.hint} position="bottom">
                <button
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    padding: isMobile ? '12px 16px' : '10px 16px',
                    minHeight: isMobile ? '44px' : 'auto',
                    backgroundColor: activeTab === tab.id ? theme.accent : 'transparent',
                    color: activeTab === tab.id ? '#fff' : theme.textSecondary,
                    border: activeTab === tab.id ? 'none' : `1px solid ${theme.border}`,
                    borderRadius: '8px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: isMobile ? '13px' : '14px',
                    fontWeight: '500',
                    whiteSpace: 'nowrap'
                  }}
                >
                  <Icon size={16} />
                  {tab.label}
                </button>
              </Tooltip>
            )
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div style={{
        backgroundColor: theme.bgCard,
        borderRadius: '12px',
        border: `1px solid ${theme.border}`,
        padding: isMobile ? '16px' : '24px'
      }}>

        {/* INFO TAB */}
        {activeTab === 'info' && (
          <div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: isMobile ? '16px' : '24px'
            }}>
              {/* Contact Info */}
              <div style={{
                padding: isMobile ? '16px' : '20px',
                backgroundColor: theme.bg,
                borderRadius: '10px'
              }}>
                <h3 style={{ fontSize: '14px', fontWeight: '600', color: theme.textSecondary, marginBottom: isMobile ? '12px' : '16px' }}>
                  Contact Information
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <User size={16} color={theme.textMuted} />
                    <span style={{ color: theme.text }}>{customer.name}</span>
                  </div>
                  {customer.business_name && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Building2 size={16} color={theme.textMuted} />
                      <span style={{ color: theme.text }}>{customer.business_name}</span>
                    </div>
                  )}
                  {customer.job_title && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Briefcase size={16} color={theme.textMuted} />
                      <span style={{ color: theme.text }}>{customer.job_title}</span>
                    </div>
                  )}
                  {customer.phone && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Phone size={16} color={theme.textMuted} />
                      <a href={`tel:${customer.phone}`} style={{ color: theme.accent }}>{customer.phone}</a>
                    </div>
                  )}
                  {customer.email && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Mail size={16} color={theme.textMuted} />
                      <a href={`mailto:${customer.email}`} style={{ color: theme.accent }}>{customer.email}</a>
                    </div>
                  )}
                  {customer.address && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <MapPin size={16} color={theme.textMuted} style={{ marginTop: '2px' }} />
                      <span style={{ color: theme.text }}>{customer.address}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Customer Details */}
              <div style={{
                padding: isMobile ? '16px' : '20px',
                backgroundColor: theme.bg,
                borderRadius: '10px'
              }}>
                <h3 style={{ fontSize: '14px', fontWeight: '600', color: theme.textSecondary, marginBottom: isMobile ? '12px' : '16px' }}>
                  Customer Details
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>Status</div>
                    <div style={{ fontSize: '14px', color: theme.text }}>{customer.status || '-'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>Preferred Contact</div>
                    <div style={{ fontSize: '14px', color: theme.text }}>{customer.preferred_contact || '-'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>Salesperson</div>
                    <div style={{ fontSize: '14px', color: theme.text }}>{customer.salesperson?.name || '-'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>Marketing Opt-in</div>
                    <div style={{ fontSize: '14px', color: theme.text }}>{customer.marketing_opt_in ? 'Yes' : 'No'}</div>
                  </div>
                </div>
              </div>

              {/* Secondary Contact */}
              {(customer.secondary_contact_name || customer.secondary_contact_email || customer.secondary_contact_phone) && (
                <div style={{
                  padding: isMobile ? '16px' : '20px',
                  backgroundColor: theme.bg,
                  borderRadius: '10px'
                }}>
                  <h3 style={{ fontSize: '14px', fontWeight: '600', color: theme.textSecondary, marginBottom: isMobile ? '12px' : '16px' }}>
                    Secondary Contact
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {customer.secondary_contact_name && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <User size={16} color={theme.textMuted} />
                        <span style={{ color: theme.text }}>
                          {customer.secondary_contact_name}
                          {customer.secondary_contact_role && ` (${customer.secondary_contact_role})`}
                        </span>
                      </div>
                    )}
                    {customer.secondary_contact_phone && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Phone size={16} color={theme.textMuted} />
                        <a href={`tel:${customer.secondary_contact_phone}`} style={{ color: theme.accent }}>
                          {customer.secondary_contact_phone}
                        </a>
                      </div>
                    )}
                    {customer.secondary_contact_email && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Mail size={16} color={theme.textMuted} />
                        <a href={`mailto:${customer.secondary_contact_email}`} style={{ color: theme.accent }}>
                          {customer.secondary_contact_email}
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Notes */}
              {customer.notes && (
                <div style={{
                  padding: isMobile ? '16px' : '20px',
                  backgroundColor: theme.bg,
                  borderRadius: '10px',
                  gridColumn: isMobile ? 'span 1' : 'span 2'
                }}>
                  <h3 style={{ fontSize: '14px', fontWeight: '600', color: theme.textSecondary, marginBottom: '12px' }}>
                    Notes
                  </h3>
                  <p style={{ fontSize: '14px', color: theme.text, whiteSpace: 'pre-wrap', margin: 0 }}>
                    {customer.notes}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* QUOTES TAB */}
        {activeTab === 'quotes' && (
          <div>
            <div style={{
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              justifyContent: 'space-between',
              alignItems: isMobile ? 'stretch' : 'center',
              gap: isMobile ? '12px' : '16px',
              marginBottom: '20px'
            }}>
              <div>
                <h3 style={{ margin: 0, color: theme.text, fontSize: isMobile ? '16px' : '18px' }}>Quotes</h3>
                <p style={{ margin: '4px 0 0', color: theme.textMuted, fontSize: '13px' }}>
                  Create and send quotes to this customer
                </p>
              </div>
              <button
                onClick={openQuoteModal}
                style={{
                  padding: isMobile ? '12px 16px' : '10px 16px',
                  minHeight: isMobile ? '44px' : 'auto',
                  backgroundColor: theme.accent,
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                <Plus size={16} />
                New Quote
              </button>
            </div>

            {quotes.length === 0 ? (
              <EmptyState
                icon={FileText}
                iconColor="#3b82f6"
                title="No quotes yet"
                message="Create a quote to send a price proposal to this customer."
                actionLabel="Create Quote"
                onAction={openQuoteModal}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {quotes.map(quote => {
                  const statusColors = {
                    'Draft': { bg: '#fef3c7', text: '#b45309' },
                    'Sent': { bg: '#dbeafe', text: '#1d4ed8' },
                    'Approved': { bg: '#dcfce7', text: '#166534' },
                    'Rejected': { bg: '#fee2e2', text: '#dc2626' }
                  }
                  const statusStyle = statusColors[quote.status] || statusColors['Draft']

                  return (
                    <div key={quote.id} style={{
                      padding: isMobile ? '14px 16px' : '16px 20px',
                      backgroundColor: theme.bg,
                      borderRadius: '10px',
                      border: `1px solid ${theme.border}`,
                      display: 'flex',
                      flexDirection: isMobile ? 'column' : 'row',
                      justifyContent: 'space-between',
                      alignItems: isMobile ? 'stretch' : 'center',
                      gap: isMobile ? '12px' : '16px'
                    }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                          <div style={{ fontSize: isMobile ? '18px' : '20px', fontWeight: '700', color: theme.text }}>
                            ${(quote.quote_amount || 0).toLocaleString()}
                          </div>
                          <span style={{
                            padding: '4px 10px',
                            backgroundColor: statusStyle.bg,
                            color: statusStyle.text,
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: '600'
                          }}>
                            {quote.status}
                          </span>
                        </div>
                        <div style={{ fontSize: '13px', color: theme.textMuted, marginTop: '4px' }}>
                          {quote.quote_lines?.length > 0 && `${quote.quote_lines.length} line items`}
                        </div>
                        <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>
                          Created {new Date(quote.created_at).toLocaleDateString()}
                          {quote.sent_at && ` - Sent ${new Date(quote.sent_at).toLocaleDateString()}`}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => navigate(`/quotes/${quote.id}`)}
                          style={{
                            padding: isMobile ? '10px 14px' : '8px 14px',
                            minHeight: isMobile ? '44px' : 'auto',
                            backgroundColor: 'transparent',
                            color: theme.accent,
                            border: `1px solid ${theme.accent}`,
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: '500',
                            flex: isMobile ? 1 : 'none'
                          }}
                        >
                          View/Edit
                        </button>
                        {quote.status === 'Draft' && (
                          <Tooltip text="Mark this quote as sent to the customer">
                            <button
                              onClick={() => handleSendQuote(quote.id)}
                              style={{
                                padding: isMobile ? '10px 14px' : '8px 14px',
                                minHeight: isMobile ? '44px' : 'auto',
                                backgroundColor: '#16a34a',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '13px',
                                fontWeight: '500',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '4px',
                                flex: isMobile ? 1 : 'none'
                              }}
                            >
                              <Send size={14} />
                              Mark Sent
                            </button>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* JOBS TAB */}
        {activeTab === 'jobs' && (
          <div>
            <div style={{
              display: 'flex',
              flexDirection: isMobile ? 'column' : 'row',
              justifyContent: 'space-between',
              alignItems: isMobile ? 'stretch' : 'center',
              gap: isMobile ? '12px' : '16px',
              marginBottom: '20px'
            }}>
              <div>
                <h3 style={{ margin: 0, color: theme.text, fontSize: isMobile ? '16px' : '18px' }}>Jobs</h3>
                <p style={{ margin: '4px 0 0', color: theme.textMuted, fontSize: '13px' }}>
                  Work orders for this customer
                </p>
              </div>
              <button
                onClick={() => navigate('/jobs')}
                style={{
                  padding: isMobile ? '12px 16px' : '10px 16px',
                  minHeight: isMobile ? '44px' : 'auto',
                  backgroundColor: theme.accent,
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                <Plus size={16} />
                New Job
              </button>
            </div>

            {jobs.length === 0 ? (
              <EmptyState
                icon={Briefcase}
                iconColor="#f59e0b"
                title="No jobs yet"
                message="Jobs will appear here once they are created for this customer."
                actionLabel="Go to Jobs"
                onAction={() => navigate('/jobs')}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {jobs.map(job => (
                  <div key={job.id} style={{
                    padding: isMobile ? '14px 16px' : '16px 20px',
                    backgroundColor: theme.bg,
                    borderRadius: '10px',
                    border: `1px solid ${theme.border}`,
                    display: 'flex',
                    flexDirection: isMobile ? 'column' : 'row',
                    justifyContent: 'space-between',
                    alignItems: isMobile ? 'stretch' : 'center',
                    gap: isMobile ? '12px' : '16px'
                  }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                        <div style={{ fontSize: isMobile ? '15px' : '16px', fontWeight: '600', color: theme.text }}>
                          {job.job_title || job.job_id || 'Untitled Job'}
                        </div>
                        <span style={{
                          padding: '4px 10px',
                          backgroundColor: getJobStatusColor(job.status) + '20',
                          color: getJobStatusColor(job.status),
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: '600'
                        }}>
                          {job.status}
                        </span>
                      </div>
                      {job.description && (
                        <div style={{ fontSize: '13px', color: theme.textSecondary, marginTop: '4px' }}>
                          {job.description.length > 100 ? job.description.substring(0, 100) + '...' : job.description}
                        </div>
                      )}
                      <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '4px' }}>
                        {job.scheduled_date && `Scheduled: ${new Date(job.scheduled_date).toLocaleDateString()}`}
                        {job.salesperson && ` - ${job.salesperson.name}`}
                      </div>
                    </div>
                    <button
                      onClick={() => navigate(`/jobs/${job.id}`)}
                      style={{
                        padding: isMobile ? '10px 14px' : '8px 14px',
                        minHeight: isMobile ? '44px' : 'auto',
                        backgroundColor: 'transparent',
                        color: theme.accent,
                        border: `1px solid ${theme.accent}`,
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: '500'
                      }}
                    >
                      View
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quote Creation Modal */}
      {showQuoteModal && (
        <>
          <div
            onClick={() => setShowQuoteModal(false)}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              zIndex: 50
            }}
          />
          <div style={{
            position: 'fixed',
            top: isMobile ? 0 : '50%',
            left: isMobile ? 0 : '50%',
            right: isMobile ? 0 : 'auto',
            bottom: isMobile ? 0 : 'auto',
            transform: isMobile ? 'none' : 'translate(-50%, -50%)',
            backgroundColor: theme.bgCard,
            borderRadius: isMobile ? 0 : '16px',
            border: isMobile ? 'none' : `1px solid ${theme.border}`,
            width: isMobile ? '100%' : '90%',
            maxWidth: isMobile ? '100%' : '900px',
            height: isMobile ? '100%' : 'auto',
            maxHeight: isMobile ? '100%' : '90vh',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 51
          }}>
            {/* Modal Header */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: isMobile ? '16px' : '20px',
              borderBottom: `1px solid ${theme.border}`
            }}>
              <div>
                <h2 style={{ fontSize: isMobile ? '16px' : '18px', fontWeight: '600', color: theme.text, margin: 0 }}>
                  Create Quote
                </h2>
                <p style={{ fontSize: '13px', color: theme.textMuted, margin: '4px 0 0' }}>
                  {customer.name}
                </p>
              </div>
              <button
                onClick={() => setShowQuoteModal(false)}
                style={{
                  padding: isMobile ? '12px' : '8px',
                  minWidth: isMobile ? '44px' : 'auto',
                  minHeight: isMobile ? '44px' : 'auto',
                  backgroundColor: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: theme.textMuted,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{
              flex: 1,
              overflow: 'auto',
              padding: isMobile ? '16px' : '20px'
            }}>
              {/* Product Catalog Picker */}
              {showCatalogPicker ? (
                <div style={{ marginBottom: '20px' }}>
                  {/* Search Bar */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '16px'
                  }}>
                    <button
                      onClick={() => {
                        if (catalogSearch) {
                          setCatalogSearch('')
                        } else if (selectedGroup) {
                          setSelectedGroup(null)
                        } else {
                          setShowCatalogPicker(false)
                        }
                      }}
                      style={{
                        padding: isMobile ? '12px' : '10px',
                        minWidth: isMobile ? '44px' : 'auto',
                        minHeight: isMobile ? '44px' : 'auto',
                        backgroundColor: theme.bg,
                        border: `1px solid ${theme.border}`,
                        borderRadius: '8px',
                        cursor: 'pointer',
                        color: theme.textSecondary,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                    >
                      <ChevronLeft size={20} />
                    </button>
                    <div style={{
                      flex: 1,
                      position: 'relative'
                    }}>
                      <Search size={18} style={{
                        position: 'absolute',
                        left: '12px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: theme.textMuted
                      }} />
                      <input
                        type="text"
                        value={catalogSearch}
                        onChange={(e) => setCatalogSearch(e.target.value)}
                        placeholder="Search products..."
                        style={{
                          width: '100%',
                          padding: isMobile ? '12px 12px 12px 40px' : '10px 12px 10px 40px',
                          minHeight: isMobile ? '44px' : 'auto',
                          border: `1px solid ${theme.border}`,
                          borderRadius: '8px',
                          fontSize: '14px',
                          color: theme.text,
                          backgroundColor: theme.bgCard
                        }}
                      />
                    </div>
                  </div>

                  {/* Service Type Tabs */}
                  {!catalogSearch && !selectedGroup && (
                    <div style={{
                      display: 'flex',
                      gap: '8px',
                      overflowX: 'auto',
                      WebkitOverflowScrolling: 'touch',
                      paddingBottom: '8px',
                      marginBottom: '16px'
                    }}>
                      {serviceTypes.map(type => (
                        <button
                          key={type}
                          onClick={() => setCatalogServiceType(type)}
                          style={{
                            padding: isMobile ? '10px 16px' : '8px 14px',
                            minHeight: isMobile ? '44px' : 'auto',
                            backgroundColor: catalogServiceType === type ? theme.accent : theme.bg,
                            color: catalogServiceType === type ? '#fff' : theme.textSecondary,
                            border: `1px solid ${catalogServiceType === type ? theme.accent : theme.border}`,
                            borderRadius: '8px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: '500',
                            whiteSpace: 'nowrap',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                          }}
                        >
                          {(() => {
                            const Icon = getServiceTypeIcon(type)
                            return <Icon size={16} />
                          })()}
                          {type}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Search Results */}
                  {catalogSearch && (
                    <div>
                      <div style={{
                        fontSize: '13px',
                        color: theme.textMuted,
                        marginBottom: '12px'
                      }}>
                        Search results for "{catalogSearch}"
                      </div>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(200px, 1fr))',
                        gap: '12px'
                      }}>
                        {products
                          .filter(p => p.active !== false && p.name.toLowerCase().includes(catalogSearch.toLowerCase()))
                          .slice(0, 20)
                          .map(product => (
                            <button
                              key={product.id}
                              onClick={() => handleSelectProduct(product)}
                              style={{
                                padding: '16px',
                                backgroundColor: theme.bg,
                                border: `1px solid ${theme.border}`,
                                borderRadius: '12px',
                                cursor: 'pointer',
                                textAlign: 'left',
                                transition: 'border-color 0.2s',
                                minHeight: isMobile ? '80px' : 'auto'
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.borderColor = theme.accent}
                              onMouseLeave={(e) => e.currentTarget.style.borderColor = theme.border}
                            >
                              <div style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '12px'
                              }}>
                                <div style={{
                                  width: '48px',
                                  height: '48px',
                                  borderRadius: '8px',
                                  backgroundColor: theme.accentBg,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0
                                }}>
                                  {product.image_url ? (
                                    <img
                                      src={product.image_url}
                                      alt={product.name}
                                      style={{
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'cover',
                                        borderRadius: '8px'
                                      }}
                                    />
                                  ) : (
                                    <Package size={24} color={theme.accent} />
                                  )}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{
                                    fontSize: '14px',
                                    fontWeight: '600',
                                    color: theme.text,
                                    marginBottom: '4px',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                  }}>
                                    {product.name}
                                  </div>
                                  <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    fontSize: '13px'
                                  }}>
                                    <span style={{ fontWeight: '600', color: theme.accent }}>
                                      ${((product.unit_price || 0) + calculateLaborCost(product)).toFixed(2)}
                                    </span>
                                    <span style={{ color: theme.textMuted }}>
                                      {getInventoryCount(product.id)} in stock
                                    </span>
                                  </div>
                                  {calculateLaborCost(product) > 0 && (
                                    <div style={{
                                      fontSize: '11px',
                                      color: theme.textMuted,
                                      marginTop: '2px'
                                    }}>
                                      +${calculateLaborCost(product).toFixed(2)} labor
                                    </div>
                                  )}
                                </div>
                              </div>
                            </button>
                          ))}
                      </div>
                      {products.filter(p => p.active !== false && p.name.toLowerCase().includes(catalogSearch.toLowerCase())).length === 0 && (
                        <div style={{
                          padding: '40px',
                          textAlign: 'center',
                          color: theme.textMuted
                        }}>
                          No products found matching "{catalogSearch}"
                        </div>
                      )}
                    </div>
                  )}

                  {/* Product Groups */}
                  {!catalogSearch && !selectedGroup && (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(150px, 1fr))',
                      gap: '12px'
                    }}>
                      {/* Show groups for selected service type */}
                      {productGroups
                        .filter(g => g.service_type === catalogServiceType)
                        .map(group => (
                          <button
                            key={group.id}
                            onClick={() => setSelectedGroup(group)}
                            style={{
                              padding: '20px 16px',
                              backgroundColor: theme.bg,
                              border: `1px solid ${theme.border}`,
                              borderRadius: '12px',
                              cursor: 'pointer',
                              textAlign: 'center',
                              transition: 'border-color 0.2s, transform 0.2s',
                              minHeight: isMobile ? '100px' : '120px',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: '8px'
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor = theme.accent
                              e.currentTarget.style.transform = 'translateY(-2px)'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = theme.border
                              e.currentTarget.style.transform = 'translateY(0)'
                            }}
                          >
                            <div style={{
                              width: '48px',
                              height: '48px',
                              borderRadius: '12px',
                              backgroundColor: theme.accentBg,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}>
                              {group.image_url ? (
                                <img
                                  src={group.image_url}
                                  alt={group.name}
                                  style={{
                                    width: '100%',
                                    height: '100%',
                                    objectFit: 'cover',
                                    borderRadius: '12px'
                                  }}
                                />
                              ) : (
                                <Grid3X3 size={24} color={theme.accent} />
                              )}
                            </div>
                            <div style={{
                              fontSize: '13px',
                              fontWeight: '600',
                              color: theme.text
                            }}>
                              {group.name}
                            </div>
                            <div style={{
                              fontSize: '11px',
                              color: theme.textMuted
                            }}>
                              {products.filter(p => p.group_id === group.id && p.active !== false).length} items
                            </div>
                          </button>
                        ))}

                      {/* Show ungrouped products tile */}
                      {products.filter(p =>
                        p.service_type === catalogServiceType &&
                        !p.group_id &&
                        p.active !== false
                      ).length > 0 && (
                        <button
                          onClick={() => setSelectedGroup({ id: null, name: 'Other Products', service_type: catalogServiceType })}
                          style={{
                            padding: '20px 16px',
                            backgroundColor: theme.bg,
                            border: `1px solid ${theme.border}`,
                            borderRadius: '12px',
                            cursor: 'pointer',
                            textAlign: 'center',
                            transition: 'border-color 0.2s, transform 0.2s',
                            minHeight: isMobile ? '100px' : '120px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = theme.accent
                            e.currentTarget.style.transform = 'translateY(-2px)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = theme.border
                            e.currentTarget.style.transform = 'translateY(0)'
                          }}
                        >
                          <div style={{
                            width: '48px',
                            height: '48px',
                            borderRadius: '12px',
                            backgroundColor: theme.accentBg,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <Box size={24} color={theme.accent} />
                          </div>
                          <div style={{
                            fontSize: '13px',
                            fontWeight: '600',
                            color: theme.text
                          }}>
                            Other Products
                          </div>
                          <div style={{
                            fontSize: '11px',
                            color: theme.textMuted
                          }}>
                            {products.filter(p => p.service_type === catalogServiceType && !p.group_id && p.active !== false).length} items
                          </div>
                        </button>
                      )}

                      {productGroups.filter(g => g.service_type === catalogServiceType).length === 0 &&
                       products.filter(p => p.service_type === catalogServiceType && !p.group_id && p.active !== false).length === 0 && (
                        <div style={{
                          gridColumn: '1 / -1',
                          padding: '40px',
                          textAlign: 'center',
                          color: theme.textMuted
                        }}>
                          No product groups for {catalogServiceType}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Products in selected group */}
                  {!catalogSearch && selectedGroup && (
                    <div>
                      <div style={{
                        fontSize: '16px',
                        fontWeight: '600',
                        color: theme.text,
                        marginBottom: '16px'
                      }}>
                        {selectedGroup.name}
                      </div>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(200px, 1fr))',
                        gap: '12px'
                      }}>
                        {products
                          .filter(p => {
                            if (selectedGroup.id === null) {
                              return p.service_type === selectedGroup.service_type && !p.group_id && p.active !== false
                            }
                            return p.group_id === selectedGroup.id && p.active !== false
                          })
                          .map(product => (
                            <button
                              key={product.id}
                              onClick={() => handleSelectProduct(product)}
                              style={{
                                padding: '16px',
                                backgroundColor: theme.bg,
                                border: `1px solid ${theme.border}`,
                                borderRadius: '12px',
                                cursor: 'pointer',
                                textAlign: 'left',
                                transition: 'border-color 0.2s',
                                minHeight: isMobile ? '80px' : 'auto'
                              }}
                              onMouseEnter={(e) => e.currentTarget.style.borderColor = theme.accent}
                              onMouseLeave={(e) => e.currentTarget.style.borderColor = theme.border}
                            >
                              <div style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '12px'
                              }}>
                                <div style={{
                                  width: '48px',
                                  height: '48px',
                                  borderRadius: '8px',
                                  backgroundColor: theme.accentBg,
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  flexShrink: 0
                                }}>
                                  {product.image_url ? (
                                    <img
                                      src={product.image_url}
                                      alt={product.name}
                                      style={{
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'cover',
                                        borderRadius: '8px'
                                      }}
                                    />
                                  ) : (
                                    <Package size={24} color={theme.accent} />
                                  )}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{
                                    fontSize: '14px',
                                    fontWeight: '600',
                                    color: theme.text,
                                    marginBottom: '4px',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                  }}>
                                    {product.name}
                                  </div>
                                  <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px',
                                    fontSize: '13px'
                                  }}>
                                    <span style={{ fontWeight: '600', color: theme.accent }}>
                                      ${((product.unit_price || 0) + calculateLaborCost(product)).toFixed(2)}
                                    </span>
                                    <span style={{ color: theme.textMuted }}>
                                      {getInventoryCount(product.id)} in stock
                                    </span>
                                  </div>
                                  {calculateLaborCost(product) > 0 && (
                                    <div style={{
                                      fontSize: '11px',
                                      color: theme.textMuted,
                                      marginTop: '2px'
                                    }}>
                                      +${calculateLaborCost(product).toFixed(2)} labor
                                    </div>
                                  )}
                                </div>
                              </div>
                            </button>
                          ))}
                      </div>
                      {products.filter(p => {
                        if (selectedGroup.id === null) {
                          return p.service_type === selectedGroup.service_type && !p.group_id && p.active !== false
                        }
                        return p.group_id === selectedGroup.id && p.active !== false
                      }).length === 0 && (
                        <div style={{
                          padding: '40px',
                          textAlign: 'center',
                          color: theme.textMuted
                        }}>
                          No products in this group
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                /* Add Product Buttons */
                <div style={{ marginBottom: '20px' }}>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: theme.textSecondary,
                    marginBottom: '8px'
                  }}>
                    Add Products
                  </label>
                  <button
                    onClick={() => setShowCatalogPicker(true)}
                    style={{
                      width: '100%',
                      padding: isMobile ? '16px' : '14px 16px',
                      minHeight: isMobile ? '60px' : 'auto',
                      backgroundColor: theme.accentBg,
                      color: theme.accent,
                      border: `2px dashed ${theme.accent}`,
                      borderRadius: '12px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '10px',
                      fontSize: '15px',
                      fontWeight: '600'
                    }}
                  >
                    <Grid3X3 size={20} />
                    Browse Product Catalog
                  </button>
                  <button
                    onClick={handleAddCustomLine}
                    style={{
                      marginTop: '8px',
                      width: '100%',
                      padding: isMobile ? '12px' : '10px 12px',
                      minHeight: isMobile ? '44px' : 'auto',
                      backgroundColor: 'transparent',
                      color: theme.textSecondary,
                      border: `1px solid ${theme.border}`,
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    <Plus size={14} />
                    Add Custom Line Item
                  </button>
                </div>
              )}

              {/* Line Items */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: theme.textSecondary,
                  marginBottom: '8px'
                }}>
                  Line Items ({quoteLines.length})
                </label>

                {quoteLines.length === 0 ? (
                  <div style={{
                    padding: '24px',
                    backgroundColor: theme.bg,
                    borderRadius: '8px',
                    textAlign: 'center',
                    color: theme.textMuted,
                    fontSize: '14px'
                  }}>
                    <Package size={32} style={{ marginBottom: '8px', opacity: 0.5 }} />
                    <p style={{ margin: 0 }}>No line items yet. Add products or custom items above.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {quoteLines.map((line, index) => (
                      <div
                        key={line.id}
                        style={{
                          padding: isMobile ? '12px' : '12px 16px',
                          backgroundColor: theme.bg,
                          borderRadius: '8px',
                          border: `1px solid ${theme.border}`
                        }}
                      >
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: isMobile ? '1fr' : '1fr auto auto auto auto',
                          gap: isMobile ? '8px' : '12px',
                          alignItems: 'center'
                        }}>
                          {/* Description */}
                          <input
                            type="text"
                            value={line.description}
                            onChange={(e) => handleUpdateLine(line.id, 'description', e.target.value)}
                            placeholder="Description"
                            style={{
                              padding: isMobile ? '10px' : '8px 10px',
                              minHeight: isMobile ? '44px' : 'auto',
                              border: `1px solid ${theme.border}`,
                              borderRadius: '6px',
                              fontSize: '14px',
                              color: theme.text,
                              backgroundColor: theme.bgCard
                            }}
                          />

                          {isMobile ? (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr auto', gap: '8px', alignItems: 'center' }}>
                              {/* Qty */}
                              <input
                                type="number"
                                value={line.quantity}
                                onChange={(e) => handleUpdateLine(line.id, 'quantity', e.target.value)}
                                min="1"
                                placeholder="Qty"
                                style={{
                                  padding: '10px',
                                  minHeight: '44px',
                                  border: `1px solid ${theme.border}`,
                                  borderRadius: '6px',
                                  fontSize: '14px',
                                  color: theme.text,
                                  backgroundColor: theme.bgCard,
                                  width: '100%'
                                }}
                              />
                              {/* Price */}
                              <input
                                type="number"
                                value={line.unit_price}
                                onChange={(e) => handleUpdateLine(line.id, 'unit_price', e.target.value)}
                                min="0"
                                step="0.01"
                                placeholder="Price"
                                style={{
                                  padding: '10px',
                                  minHeight: '44px',
                                  border: `1px solid ${theme.border}`,
                                  borderRadius: '6px',
                                  fontSize: '14px',
                                  color: theme.text,
                                  backgroundColor: theme.bgCard,
                                  width: '100%'
                                }}
                              />
                              {/* Total */}
                              <div style={{
                                padding: '10px',
                                minHeight: '44px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: '600',
                                color: theme.text,
                                fontSize: '14px'
                              }}>
                                ${(line.line_total || 0).toFixed(2)}
                              </div>
                              {/* Delete */}
                              <button
                                onClick={() => handleRemoveLine(line.id)}
                                style={{
                                  padding: '10px',
                                  minWidth: '44px',
                                  minHeight: '44px',
                                  backgroundColor: '#fee2e2',
                                  color: '#dc2626',
                                  border: 'none',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          ) : (
                            <>
                              {/* Qty */}
                              <input
                                type="number"
                                value={line.quantity}
                                onChange={(e) => handleUpdateLine(line.id, 'quantity', e.target.value)}
                                min="1"
                                style={{
                                  width: '70px',
                                  padding: '8px 10px',
                                  border: `1px solid ${theme.border}`,
                                  borderRadius: '6px',
                                  fontSize: '14px',
                                  color: theme.text,
                                  backgroundColor: theme.bgCard,
                                  textAlign: 'center'
                                }}
                              />
                              {/* Price */}
                              <input
                                type="number"
                                value={line.unit_price}
                                onChange={(e) => handleUpdateLine(line.id, 'unit_price', e.target.value)}
                                min="0"
                                step="0.01"
                                style={{
                                  width: '100px',
                                  padding: '8px 10px',
                                  border: `1px solid ${theme.border}`,
                                  borderRadius: '6px',
                                  fontSize: '14px',
                                  color: theme.text,
                                  backgroundColor: theme.bgCard,
                                  textAlign: 'right'
                                }}
                              />
                              {/* Total */}
                              <div style={{
                                width: '90px',
                                fontWeight: '600',
                                color: theme.text,
                                textAlign: 'right'
                              }}>
                                ${(line.line_total || 0).toFixed(2)}
                              </div>
                              {/* Delete */}
                              <button
                                onClick={() => handleRemoveLine(line.id)}
                                style={{
                                  padding: '6px',
                                  backgroundColor: '#fee2e2',
                                  color: '#dc2626',
                                  border: 'none',
                                  borderRadius: '6px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Totals */}
              {quoteLines.length > 0 && (
                <div style={{
                  padding: '16px',
                  backgroundColor: theme.bg,
                  borderRadius: '8px',
                  marginBottom: '20px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ color: theme.textSecondary }}>Subtotal</span>
                    <span style={{ fontWeight: '500', color: theme.text }}>${quoteSubtotal.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ color: theme.textSecondary }}>Discount</span>
                    <input
                      type="number"
                      value={quoteDiscount}
                      onChange={(e) => setQuoteDiscount(e.target.value)}
                      min="0"
                      step="0.01"
                      style={{
                        width: '100px',
                        padding: isMobile ? '10px' : '6px 10px',
                        minHeight: isMobile ? '44px' : 'auto',
                        border: `1px solid ${theme.border}`,
                        borderRadius: '6px',
                        fontSize: '14px',
                        color: theme.text,
                        backgroundColor: theme.bgCard,
                        textAlign: 'right'
                      }}
                    />
                  </div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    paddingTop: '8px',
                    borderTop: `1px solid ${theme.border}`
                  }}>
                    <span style={{ fontWeight: '600', color: theme.text }}>Total</span>
                    <span style={{ fontSize: '18px', fontWeight: '700', color: theme.accent }}>
                      ${quoteTotal.toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: theme.textSecondary,
                  marginBottom: '8px'
                }}>
                  Notes
                </label>
                <textarea
                  value={quoteNotes}
                  onChange={(e) => setQuoteNotes(e.target.value)}
                  placeholder="Optional notes for this quote..."
                  rows={3}
                  style={{
                    width: '100%',
                    padding: isMobile ? '12px' : '10px 12px',
                    border: `1px solid ${theme.border}`,
                    borderRadius: '8px',
                    fontSize: '14px',
                    color: theme.text,
                    backgroundColor: theme.bgCard,
                    resize: 'vertical'
                  }}
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{
              display: 'flex',
              gap: '12px',
              padding: isMobile ? '16px' : '20px',
              borderTop: `1px solid ${theme.border}`
            }}>
              <button
                onClick={() => setShowQuoteModal(false)}
                style={{
                  flex: 1,
                  padding: isMobile ? '14px' : '12px',
                  minHeight: isMobile ? '44px' : 'auto',
                  backgroundColor: 'transparent',
                  color: theme.textSecondary,
                  border: `1px solid ${theme.border}`,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveQuote}
                disabled={savingQuote || quoteLines.length === 0}
                style={{
                  flex: 1,
                  padding: isMobile ? '14px' : '12px',
                  minHeight: isMobile ? '44px' : 'auto',
                  backgroundColor: quoteLines.length === 0 ? theme.border : theme.accent,
                  color: quoteLines.length === 0 ? theme.textMuted : '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: savingQuote || quoteLines.length === 0 ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  opacity: savingQuote ? 0.7 : 1
                }}
              >
                <Save size={16} />
                {savingQuote ? 'Saving...' : 'Create Quote'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
