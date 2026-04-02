import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { toast } from '../lib/toast'
import {
  ArrowLeft, FileText, Briefcase, Plus, Send, Phone, Mail,
  MapPin, Building2, User, X, Save, Trash2, Package, UserPlus, Grid3X3,
  DollarSign, TrendingUp, MessageCircle, CreditCard, ExternalLink, Edit2, Zap
} from 'lucide-react'
import ProductPickerModal from '../components/ProductPickerModal'
import Tooltip from '../components/Tooltip'
import EmptyState from '../components/EmptyState'
import { quoteStatusColors, invoiceStatusColors } from '../lib/statusColors'

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
  const user = useStore((state) => state.user)
  const companyId = useStore((state) => state.companyId)
  const employees = useStore((state) => state.employees)
  const fetchCustomers = useStore((state) => state.fetchCustomers)
  const updateCustomer = useStore((state) => state.updateCustomer)

  const [customer, setCustomer] = useState(null)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [quotes, setQuotes] = useState([])
  const [jobs, setJobs] = useState([])
  const [invoices, setInvoices] = useState([])
  const [utilityInvoices, setUtilityInvoices] = useState([])
  const [leads, setLeads] = useState([])
  const [payments, setPayments] = useState([])
  const [invoicePayments, setInvoicePayments] = useState([])
  const [communications, setCommunications] = useState([])
  const [savedCards, setSavedCards] = useState([])
  const [loadingCards, setLoadingCards] = useState(false)
  const [removingCardId, setRemovingCardId] = useState(null)
  const [activeTab, setActiveTab] = useState('info')
  const [loading, setLoading] = useState(true)
  const [isMobile, setIsMobile] = useState(false)

  // Quote creation modal state
  const [showQuoteModal, setShowQuoteModal] = useState(false)
  const [quoteLines, setQuoteLines] = useState([])
  const [quoteDiscount, setQuoteDiscount] = useState(0)
  const [quoteNotes, setQuoteNotes] = useState('')
  const [savingQuote, setSavingQuote] = useState(false)
  const [showProductPicker, setShowProductPicker] = useState(false)

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
      .select('*, salesperson:employees!jobs_salesperson_id_fkey(id, name)')
      .eq('customer_id', id)
      .order('created_at', { ascending: false })
    setJobs(jobData || [])

    // Fetch invoices linked to this customer (by customer_id or via job)
    const jobIds = (jobData || []).map(j => j.id)
    const invoiceFilter = jobIds.length > 0
      ? `customer_id.eq.${id},job_id.in.(${jobIds.join(',')})`
      : `customer_id.eq.${id}`
    const { data: invoiceData } = await supabase
      .from('invoices')
      .select('*')
      .or(invoiceFilter)
      .order('created_at', { ascending: false })
    // Deduplicate in case an invoice matches both customer_id and job_id
    const uniqueInvoices = invoiceData ? [...new Map(invoiceData.map(inv => [inv.id, inv])).values()] : []
    setInvoices(uniqueInvoices)

    // Fetch utility invoices via the customer's jobs
    if (jobIds.length > 0) {
      const { data: utilInvData } = await supabase
        .from('utility_invoices')
        .select('*')
        .in('job_id', jobIds)
        .order('created_at', { ascending: false })
      setUtilityInvoices(utilInvData || [])
    } else {
      setUtilityInvoices([])
    }

    // Fetch leads linked to this customer
    const { data: leadData } = await supabase
      .from('leads')
      .select('*')
      .or(`customer_id.eq.${id},converted_customer_id.eq.${id}`)
      .order('created_at', { ascending: false })
    setLeads(leadData || [])

    // Fetch payments via leads linked to this customer
    const leadIds = (leadData || []).map(l => l.id)
    if (leadIds.length > 0) {
      const { data: paymentData } = await supabase
        .from('lead_payments')
        .select('*')
        .in('lead_id', leadIds)
        .order('date_created', { ascending: false })
      setPayments(paymentData || [])
    } else {
      setPayments([])
    }

    // Fetch invoice payments (from payments table — includes Stripe transactions)
    const invoiceIds = uniqueInvoices.map(inv => inv.id)
    if (invoiceIds.length > 0) {
      const { data: invPayData } = await supabase
        .from('payments')
        .select('*')
        .in('invoice_id', invoiceIds)
        .order('created_at', { ascending: false })
      setInvoicePayments(invPayData || [])
    } else if (parseInt(id)) {
      // Fallback: fetch by customer_id if available
      const { data: invPayData } = await supabase
        .from('payments')
        .select('*')
        .eq('customer_id', parseInt(id))
        .order('created_at', { ascending: false })
      setInvoicePayments(invPayData || [])
    } else {
      setInvoicePayments([])
    }

    // Fetch saved payment methods
    const { data: cardData } = await supabase
      .from('customer_payment_methods')
      .select('id, brand, last_four, exp_month, exp_year, is_default, created_at')
      .eq('company_id', companyId)
      .eq('customer_id', id)
      .eq('status', 'active')
      .order('is_default', { ascending: false })
    setSavedCards(cardData || [])

    // Fetch communications for this customer
    const { data: commData } = await supabase
      .from('communications_log')
      .select('*, employee:employees(id, name)')
      .eq('customer_id', id)
      .order('created_at', { ascending: false })
    setCommunications(commData || [])

    setLoading(false)
  }

  const handleAddCard = async () => {
    setLoadingCards(true)
    try {
      const res = await supabase.functions.invoke('manage-payment-methods', {
        body: {
          action: 'create_setup_session',
          company_id: companyId,
          customer_id: parseInt(id),
          return_url: window.location.href
        }
      })
      if (res.data?.checkout_url) {
        window.open(res.data.checkout_url, '_blank')
      } else {
        toast.error(res.data?.error || 'Failed to start card setup')
      }
    } catch (err) {
      toast.error(err.message)
    }
    setLoadingCards(false)
  }

  const handleRemoveCard = async (cardId) => {
    if (!confirm('Remove this payment method?')) return
    setRemovingCardId(cardId)
    try {
      await supabase.functions.invoke('manage-payment-methods', {
        body: {
          action: 'remove',
          company_id: companyId,
          customer_id: parseInt(id),
          payment_method_id: cardId
        }
      })
      setSavedCards(prev => prev.filter(c => c.id !== cardId))
      toast.success('Card removed')
    } catch (err) {
      toast.error(err.message)
    }
    setRemovingCardId(null)
  }

  const handleSetDefault = async (cardId) => {
    try {
      await supabase.functions.invoke('manage-payment-methods', {
        body: {
          action: 'set_default',
          company_id: companyId,
          customer_id: parseInt(id),
          payment_method_id: cardId
        }
      })
      setSavedCards(prev => prev.map(c => ({ ...c, is_default: c.id === cardId })))
    } catch (err) {
      toast.error(err.message)
    }
  }

  // Open quote creation modal
  const openQuoteModal = () => {
    setQuoteLines([])
    setQuoteDiscount(0)
    setQuoteNotes('')
    setShowProductPicker(false)
    setShowQuoteModal(true)
  }

  // Handle product selection from ProductPickerModal
  const handleProductSelect = (product, laborCost, totalPrice) => {
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
    setShowProductPicker(false)
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
      alert('Error creating estimate: ' + quoteError.message)
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

    // Auto-create tracking lead so this quote appears in the pipeline
    const { data: newLead } = await supabase
      .from('leads')
      .insert({
        company_id: companyId,
        customer_name: customer.name,
        phone: customer.phone || null,
        email: customer.email || null,
        address: customer.address || null,
        status: 'Quote Sent',
        lead_source: 'Existing Customer',
        service_type: quoteLines[0]?.description || null,
        converted_customer_id: customer.id,
        quote_id: quote.id,
        quote_amount: quoteTotal,
        updated_at: new Date().toISOString()
      })
      .select()
      .single()

    if (newLead) {
      // Link quote back to the tracking lead
      await supabase.from('quotes').update({ lead_id: newLead.id }).eq('id', quote.id)
      toast.info('Tracking in sales pipeline')
    }

    setSavingQuote(false)
    setShowQuoteModal(false)
    await fetchCustomerData()
  }

  // Mark quote as sent
  const handleSendQuote = async (quoteId) => {
    await supabase
      .from('quotes')
      .update({ status: 'Sent', sent_date: new Date().toISOString() })
      .eq('id', quoteId)

    await fetchCustomerData()
    alert('Estimate marked as sent!')
  }

  // Send customer to setter pipeline
  const handleSendToSetter = async () => {
    const reason = window.prompt(`Why does ${customer.name} need a meeting?\n\nAdd a note for the setter:`)
    if (reason === null) return

    const senderName = user?.name || 'Someone'
    const noteText = `Sent to setter by ${senderName} on ${new Date().toLocaleDateString()}${reason ? `: ${reason}` : ''}`

    const { error } = await supabase
      .from('leads')
      .insert({
        company_id: companyId,
        customer_name: customer.name,
        email: customer.email || null,
        phone: customer.phone || null,
        address: customer.address || null,
        business_name: customer.business_name || null,
        status: 'Contacted',
        lead_source: 'Existing Customer',
        customer_id: customer.id,
        notes: noteText
      })
      .select()
      .single()

    if (error) {
      toast.error('Error creating lead: ' + error.message)
      return
    }

    toast.success(`${customer.name} sent to setter pipeline`)
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

  const startEditing = () => {
    setEditForm({
      name: customer?.name || '',
      business_name: customer?.business_name || '',
      job_title: customer?.job_title || '',
      phone: customer?.phone || '',
      email: customer?.email || '',
      address: customer?.address || '',
      status: customer?.status || 'Active',
      preferred_contact: customer?.preferred_contact || '',
      salesperson_id: customer?.salesperson_id || '',
      marketing_opt_in: customer?.marketing_opt_in || false,
      calendar_display: customer?.calendar_display || 'person',
      secondary_contact_name: customer?.secondary_contact_name || '',
      secondary_contact_role: customer?.secondary_contact_role || '',
      secondary_contact_phone: customer?.secondary_contact_phone || '',
      secondary_contact_email: customer?.secondary_contact_email || '',
      notes: customer?.notes || '',
    })
    setEditing(true)
  }

  const handleSaveCustomer = async () => {
    const changes = { ...editForm, updated_at: new Date().toISOString() }
    // Convert empty strings to null for optional fields
    const optionalFields = ['business_name', 'job_title', 'phone', 'email', 'address', 'preferred_contact', 'secondary_contact_name', 'secondary_contact_role', 'secondary_contact_phone', 'secondary_contact_email', 'notes']
    optionalFields.forEach(f => { if (changes[f] === '') changes[f] = null })
    if (!changes.salesperson_id) changes.salesperson_id = null

    const { error } = await supabase
      .from('customers')
      .update(changes)
      .eq('id', customer.id)

    if (error) {
      toast.error('Save failed: ' + error.message)
      return
    }

    setCustomer(prev => ({ ...prev, ...changes, salesperson: employees.find(e => e.id === changes.salesperson_id) || null }))
    setEditing(false)
    toast.success('Customer updated')
    fetchCustomers()
  }

  const editField = (field, value) => {
    setEditForm(prev => ({ ...prev, [field]: value }))
  }

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    fontSize: '14px',
    color: theme.text,
    backgroundColor: theme.bgCard,
    border: `1px solid ${theme.border}`,
    borderRadius: '8px',
    outline: 'none',
    minHeight: '44px',
    boxSizing: 'border-box',
  }

  const selectStyle = {
    ...inputStyle,
    cursor: 'pointer',
    appearance: 'auto',
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
    { id: 'leads', label: `Leads (${leads.length})`, icon: TrendingUp, hint: 'Leads/deals for this customer' },
    { id: 'quotes', label: `Estimates (${quotes.length})`, icon: FileText, hint: 'Price estimates for this customer' },
    { id: 'jobs', label: `Jobs (${jobs.length})`, icon: Briefcase, hint: 'Work orders for this customer' },
    { id: 'invoices', label: `Invoices (${invoices.length + utilityInvoices.length})`, icon: DollarSign, hint: 'Invoices for this customer' },
    { id: 'payments', label: `Payments (${payments.length + invoicePayments.length})`, icon: CreditCard, hint: 'Payments received from this customer' },
    ...(communications.length > 0 ? [{ id: 'comms', label: `Comms (${communications.length})`, icon: MessageCircle, hint: 'Communication history' }] : []),
  ]

  return (
    <div style={{ padding: isMobile ? '16px' : '24px', minHeight: '100vh', maxWidth: '100%', overflowX: 'hidden' }}>
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
            onClick={() => navigate('/customers')}
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
          <button
            onClick={async () => {
              if (!confirm(`Delete ${customer.name}? This will permanently remove the customer.`)) return
              const { error } = await supabase.from('customers').delete().eq('id', customer.id)
              if (error) {
                if (error.code === '23503' || error.message?.includes('violates foreign key')) {
                  toast.error(`Cannot delete — ${customer.name} has linked jobs, invoices, or estimates.`)
                } else {
                  toast.error('Delete failed: ' + error.message)
                }
                return
              }
              toast.success(`${customer.name} deleted`)
              navigate('/customers')
            }}
            style={{
              padding: isMobile ? '12px 16px' : '10px 14px',
              minHeight: isMobile ? '44px' : 'auto',
              backgroundColor: 'transparent',
              color: '#dc2626',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              flex: isMobile ? 1 : 'none'
            }}
          >
            <Trash2 size={16} />
            Delete
          </button>
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
            {/* Edit / Save / Cancel bar */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginBottom: '16px' }}>
              {editing ? (
                <>
                  <button
                    onClick={() => setEditing(false)}
                    style={{
                      padding: '10px 16px', minHeight: '44px',
                      backgroundColor: 'transparent', color: theme.textSecondary,
                      border: `1px solid ${theme.border}`, borderRadius: '8px',
                      cursor: 'pointer', fontSize: '14px', fontWeight: '500',
                      display: 'flex', alignItems: 'center', gap: '6px'
                    }}
                  >
                    <X size={16} /> Cancel
                  </button>
                  <button
                    onClick={handleSaveCustomer}
                    style={{
                      padding: '10px 16px', minHeight: '44px',
                      backgroundColor: theme.accent, color: '#fff',
                      border: 'none', borderRadius: '8px',
                      cursor: 'pointer', fontSize: '14px', fontWeight: '500',
                      display: 'flex', alignItems: 'center', gap: '6px'
                    }}
                  >
                    <Save size={16} /> Save
                  </button>
                </>
              ) : (
                <button
                  onClick={startEditing}
                  style={{
                    padding: '10px 16px', minHeight: '44px',
                    backgroundColor: theme.accentBg, color: theme.accent,
                    border: `1px solid ${theme.accent}`, borderRadius: '8px',
                    cursor: 'pointer', fontSize: '14px', fontWeight: '500',
                    display: 'flex', alignItems: 'center', gap: '6px'
                  }}
                >
                  <Edit2 size={16} /> Edit
                </button>
              )}
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: isMobile ? '16px' : '24px'
            }}>
              {/* Contact Info */}
              <div style={{ padding: isMobile ? '16px' : '20px', backgroundColor: theme.bg, borderRadius: '10px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: '600', color: theme.textSecondary, marginBottom: isMobile ? '12px' : '16px' }}>
                  Contact Information
                </h3>
                {editing ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                      <label style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px', display: 'block' }}>Name *</label>
                      <input style={inputStyle} value={editForm.name} onChange={e => editField('name', e.target.value)} placeholder="Customer name" />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px', display: 'block' }}>Business Name</label>
                      <input style={inputStyle} value={editForm.business_name} onChange={e => editField('business_name', e.target.value)} placeholder="Business name" />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px', display: 'block' }}>Job Title</label>
                      <input style={inputStyle} value={editForm.job_title} onChange={e => editField('job_title', e.target.value)} placeholder="Job title" />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px', display: 'block' }}>Phone</label>
                      <input style={inputStyle} type="tel" value={editForm.phone} onChange={e => editField('phone', e.target.value)} placeholder="Phone number" />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px', display: 'block' }}>Email</label>
                      <input style={inputStyle} type="email" value={editForm.email} onChange={e => editField('email', e.target.value)} placeholder="Email address" />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px', display: 'block' }}>Address</label>
                      <input style={inputStyle} value={editForm.address} onChange={e => editField('address', e.target.value)} placeholder="Street address" />
                    </div>
                  </div>
                ) : (
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
                    {!customer.phone && !customer.email && !customer.address && !customer.business_name && !customer.job_title && (
                      <div style={{ fontSize: '13px', color: theme.textMuted, fontStyle: 'italic' }}>
                        No contact details — click Edit to add information
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Customer Details */}
              <div style={{ padding: isMobile ? '16px' : '20px', backgroundColor: theme.bg, borderRadius: '10px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: '600', color: theme.textSecondary, marginBottom: isMobile ? '12px' : '16px' }}>
                  Customer Details
                </h3>
                {editing ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                      <label style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px', display: 'block' }}>Status</label>
                      <select style={selectStyle} value={editForm.status} onChange={e => editField('status', e.target.value)}>
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                        <option value="Prospect">Prospect</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px', display: 'block' }}>Preferred Contact Method</label>
                      <select style={selectStyle} value={editForm.preferred_contact} onChange={e => editField('preferred_contact', e.target.value)}>
                        <option value="">None</option>
                        <option value="Phone">Phone</option>
                        <option value="Email">Email</option>
                        <option value="Text">Text</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px', display: 'block' }}>Salesperson</label>
                      <select style={selectStyle} value={editForm.salesperson_id || ''} onChange={e => editField('salesperson_id', e.target.value ? parseInt(e.target.value) : null)}>
                        <option value="">None</option>
                        {employees.filter(e => e.status === 'Active').map(e => (
                          <option key={e.id} value={e.id}>{e.name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px', display: 'block' }}>Marketing Opt-in</label>
                      <select style={selectStyle} value={editForm.marketing_opt_in ? 'yes' : 'no'} onChange={e => editField('marketing_opt_in', e.target.value === 'yes')}>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px', display: 'block' }}>Calendar Display</label>
                      <select style={selectStyle} value={editForm.calendar_display || 'person'} onChange={e => editField('calendar_display', e.target.value)}>
                        <option value="person">Person Name</option>
                        <option value="business">Business Name</option>
                      </select>
                    </div>
                  </div>
                ) : (
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
                    <div>
                      <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>Calendar Display</div>
                      <div style={{ fontSize: '14px', color: theme.text }}>{customer.calendar_display === 'business' ? 'Business Name' : 'Person Name'}</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Secondary Contact */}
              <div style={{ padding: isMobile ? '16px' : '20px', backgroundColor: theme.bg, borderRadius: '10px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: '600', color: theme.textSecondary, marginBottom: isMobile ? '12px' : '16px' }}>
                  Secondary Contact
                </h3>
                {editing ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div>
                      <label style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px', display: 'block' }}>Name</label>
                      <input style={inputStyle} value={editForm.secondary_contact_name} onChange={e => editField('secondary_contact_name', e.target.value)} placeholder="Contact name" />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px', display: 'block' }}>Role</label>
                      <input style={inputStyle} value={editForm.secondary_contact_role} onChange={e => editField('secondary_contact_role', e.target.value)} placeholder="e.g. Office Manager" />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px', display: 'block' }}>Phone</label>
                      <input style={inputStyle} type="tel" value={editForm.secondary_contact_phone} onChange={e => editField('secondary_contact_phone', e.target.value)} placeholder="Phone number" />
                    </div>
                    <div>
                      <label style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px', display: 'block' }}>Email</label>
                      <input style={inputStyle} type="email" value={editForm.secondary_contact_email} onChange={e => editField('secondary_contact_email', e.target.value)} placeholder="Email address" />
                    </div>
                  </div>
                ) : (customer.secondary_contact_name || customer.secondary_contact_email || customer.secondary_contact_phone) ? (
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
                ) : (
                  <div style={{ fontSize: '13px', color: theme.textMuted, fontStyle: 'italic' }}>
                    No secondary contact — click Edit to add
                  </div>
                )}
              </div>

              {/* Notes */}
              <div style={{
                padding: isMobile ? '16px' : '20px',
                backgroundColor: theme.bg,
                borderRadius: '10px',
                gridColumn: isMobile ? 'span 1' : 'span 2'
              }}>
                <h3 style={{ fontSize: '14px', fontWeight: '600', color: theme.textSecondary, marginBottom: '12px' }}>
                  Notes
                </h3>
                {editing ? (
                  <textarea
                    style={{ ...inputStyle, minHeight: '120px', resize: 'vertical', fontFamily: 'inherit' }}
                    value={editForm.notes}
                    onChange={e => editField('notes', e.target.value)}
                    placeholder="Add notes about this customer..."
                  />
                ) : customer.notes ? (
                  <p style={{ fontSize: '14px', color: theme.text, whiteSpace: 'pre-wrap', margin: 0 }}>
                    {customer.notes}
                  </p>
                ) : (
                  <div style={{ fontSize: '13px', color: theme.textMuted, fontStyle: 'italic' }}>
                    No notes — click Edit to add
                  </div>
                )}
              </div>
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
                <h3 style={{ margin: 0, color: theme.text, fontSize: isMobile ? '16px' : '18px' }}>Estimates</h3>
                <p style={{ margin: '4px 0 0', color: theme.textMuted, fontSize: '13px' }}>
                  Create and send estimates to this customer
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
                New Estimate
              </button>
            </div>

            {quotes.length === 0 ? (
              <EmptyState
                icon={FileText}
                iconColor="#3b82f6"
                title="No estimates yet"
                message="Create an estimate to send a price proposal to this customer."
                actionLabel="Create Estimate"
                onAction={openQuoteModal}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {quotes.map(quote => {
                  const statusStyle = quoteStatusColors[quote.status] || quoteStatusColors['Draft']

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
                          onClick={() => navigate(`/estimates/${quote.id}`)}
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
                          <Tooltip text="Mark this estimate as sent to the customer">
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
                onClick={() => navigate('/jobs', { state: { openCreate: true, customerId: parseInt(id) } })}
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
                      {job.details && (
                        <div style={{ fontSize: '13px', color: theme.textSecondary, marginTop: '4px' }}>
                          {job.details.length > 100 ? job.details.substring(0, 100) + '...' : job.details}
                        </div>
                      )}
                      <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '4px' }}>
                        {job.start_date && `Scheduled: ${new Date(job.start_date).toLocaleDateString()}`}
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

        {/* INVOICES TAB */}
        {activeTab === 'invoices' && (
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
                <h3 style={{ margin: 0, color: theme.text, fontSize: isMobile ? '16px' : '18px' }}>Invoices</h3>
                <p style={{ margin: '4px 0 0', color: theme.textMuted, fontSize: '13px' }}>
                  Invoices issued to this customer
                </p>
              </div>
            </div>

            {invoices.length === 0 ? (
              <EmptyState
                icon={DollarSign}
                iconColor="#3b82f6"
                title="No invoices yet"
                message="Invoices will appear here once they are generated for this customer's jobs."
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {invoices.map(inv => {
                  const invStatusStyle = invoiceStatusColors[inv.payment_status] || invoiceStatusColors['Pending']
                  return (
                    <div key={inv.id} style={{
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
                            {inv.invoice_id || `Invoice #${inv.id}`}
                          </div>
                          <span style={{
                            padding: '4px 10px',
                            backgroundColor: invStatusStyle.bg,
                            color: invStatusStyle.text,
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: '600'
                          }}>
                            {inv.payment_status || 'Pending'}
                          </span>
                        </div>
                        <div style={{ fontSize: '13px', color: theme.textSecondary, marginTop: '4px' }}>
                          {inv.job_description || ''}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px', fontSize: '12px', color: theme.textMuted }}>
                          <span style={{ fontWeight: '600', fontSize: '14px', color: theme.text }}>
                            ${parseFloat(inv.amount || 0).toFixed(2)}
                          </span>
                          {inv.created_at && <span>{new Date(inv.created_at).toLocaleDateString()}</span>}
                          {inv.business_unit && <span>{inv.business_unit}</span>}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                        {inv.payment_status !== 'Paid' && (
                          <button
                            onClick={async () => {
                              let portalTk = inv.portal_token
                              if (!portalTk) {
                                const { data: newToken } = await supabase
                                  .from('customer_portal_tokens')
                                  .insert({
                                    document_type: 'invoice',
                                    document_id: inv.id,
                                    company_id: companyId,
                                    customer_id: inv.customer_id || parseInt(id),
                                    expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
                                  })
                                  .select('token')
                                  .single()
                                if (newToken?.token) {
                                  portalTk = newToken.token
                                  await supabase.from('invoices').update({ portal_token: portalTk }).eq('id', inv.id)
                                }
                              }
                              if (portalTk) {
                                window.open(`https://jobscout.appsannex.com/portal/${portalTk}`, '_blank')
                              }
                            }}
                            style={{
                              padding: isMobile ? '10px 14px' : '8px 14px',
                              minHeight: isMobile ? '44px' : 'auto',
                              backgroundColor: '#3b82f620',
                              color: '#3b82f6',
                              border: `1px solid #3b82f640`,
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '13px',
                              fontWeight: '500',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <ExternalLink size={14} />
                            Portal
                          </button>
                        )}
                        <button
                          onClick={() => navigate(`/invoices/${inv.id}`)}
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
                    </div>
                  )
                })}
              </div>
            )}

            {/* Utility Invoices */}
            {utilityInvoices.length > 0 && (
              <div style={{ marginTop: '28px' }}>
                <div style={{ marginBottom: '16px' }}>
                  <h3 style={{ margin: 0, color: theme.text, fontSize: isMobile ? '16px' : '18px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Zap size={18} style={{ color: '#eab308' }} />
                    Utility Invoices
                  </h3>
                  <p style={{ margin: '4px 0 0', color: theme.textMuted, fontSize: '13px' }}>
                    Utility invoices linked to this customer's jobs
                  </p>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {utilityInvoices.map(uInv => {
                    const uStatusStyle = invoiceStatusColors[uInv.payment_status] || invoiceStatusColors['Pending']
                    return (
                      <div key={`util-${uInv.id}`} style={{
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
                              {uInv.utility_invoice_id || `Utility #${uInv.id}`}
                            </div>
                            <span style={{
                              padding: '4px 10px',
                              backgroundColor: uStatusStyle.bg,
                              color: uStatusStyle.text,
                              borderRadius: '6px',
                              fontSize: '12px',
                              fontWeight: '600'
                            }}>
                              {uInv.payment_status || 'Pending'}
                            </span>
                          </div>
                          <div style={{ fontSize: '13px', color: theme.textSecondary, marginTop: '4px' }}>
                            {uInv.utility_name || ''}{uInv.job_description ? ` — ${uInv.job_description}` : ''}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px', fontSize: '12px', color: theme.textMuted }}>
                            <span style={{ fontWeight: '600', fontSize: '14px', color: theme.text }}>
                              ${parseFloat(uInv.amount || 0).toFixed(2)}
                            </span>
                            {uInv.created_at && <span>{new Date(uInv.created_at).toLocaleDateString()}</span>}
                            {uInv.business_unit && <span>{uInv.business_unit}</span>}
                          </div>
                        </div>
                        <button
                          onClick={() => navigate(`/utility-invoices/${uInv.id}`)}
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
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* LEADS TAB */}
        {activeTab === 'leads' && (
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
                <h3 style={{ margin: 0, color: theme.text, fontSize: isMobile ? '16px' : '18px' }}>Leads / Deals</h3>
                <p style={{ margin: '4px 0 0', color: theme.textMuted, fontSize: '13px' }}>
                  Sales pipeline entries for this customer
                </p>
              </div>
            </div>

            {leads.length === 0 ? (
              <EmptyState
                icon={TrendingUp}
                iconColor="#8b5cf6"
                title="No leads yet"
                message="Leads will appear here when created for this customer."
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {leads.map(lead => {
                  const lsColor = lead.status === 'Won' || lead.status === 'Job Complete' || lead.status === 'sold' || lead.status === 'closed_won'
                    ? '#16a34a'
                    : lead.status === 'Lost' || lead.status === 'Cancelled'
                      ? '#dc2626'
                      : '#f59e0b'
                  return (
                    <div key={lead.id} style={{
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
                            {lead.customer_name || lead.lead_id || 'Lead'}
                          </div>
                          <span style={{
                            padding: '4px 10px',
                            backgroundColor: lsColor + '20',
                            color: lsColor,
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: '600'
                          }}>
                            {lead.status}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px', fontSize: '12px', color: theme.textMuted, flexWrap: 'wrap' }}>
                          {lead.service_type && <span>{lead.service_type}</span>}
                          {lead.quote_amount && <span style={{ fontWeight: '600', color: theme.text }}>${parseFloat(lead.quote_amount).toFixed(2)}</span>}
                          {lead.lead_source && <span>Source: {lead.lead_source}</span>}
                          {lead.salesperson && <span>Sales: {lead.salesperson}</span>}
                          {lead.created_at && <span>{new Date(lead.created_at).toLocaleDateString()}</span>}
                        </div>
                      </div>
                      <button
                        onClick={() => navigate(`/leads/${lead.id}`)}
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
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* PAYMENTS TAB */}
        {activeTab === 'payments' && (
          <div>
            {/* Saved Payment Methods */}
            <div style={{
              marginBottom: '24px', padding: '16px', backgroundColor: theme.bg,
              borderRadius: '12px', border: `1px solid ${theme.border}`
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: savedCards.length > 0 ? '12px' : '0' }}>
                <div>
                  <h4 style={{ margin: 0, color: theme.text, fontSize: '14px', fontWeight: '600' }}>Saved Payment Methods</h4>
                  <p style={{ margin: '2px 0 0', color: theme.textMuted, fontSize: '12px' }}>
                    Cards on file for recurring charges
                  </p>
                </div>
                <button
                  onClick={handleAddCard}
                  disabled={loadingCards}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '8px 14px', backgroundColor: theme.accentBg, color: theme.accent,
                    border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '500',
                    cursor: loadingCards ? 'not-allowed' : 'pointer', opacity: loadingCards ? 0.7 : 1,
                    minHeight: '44px'
                  }}
                >
                  <Plus size={14} />
                  {loadingCards ? 'Opening...' : 'Add Card'}
                </button>
              </div>

              {savedCards.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {savedCards.map(card => (
                    <div key={card.id} style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '10px 14px', backgroundColor: theme.bgCard || '#ffffff',
                      borderRadius: '8px', border: `1px solid ${card.is_default ? theme.accent + '40' : theme.border}`
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <CreditCard size={18} style={{ color: theme.accent }} />
                        <div>
                          <div style={{ fontSize: '13px', fontWeight: '500', color: theme.text }}>
                            {(card.brand || 'Card').charAt(0).toUpperCase() + (card.brand || 'card').slice(1)} **** {card.last_four}
                            {card.is_default && (
                              <span style={{
                                marginLeft: '8px', padding: '2px 6px', backgroundColor: theme.accentBg,
                                color: theme.accent, borderRadius: '4px', fontSize: '10px', fontWeight: '600'
                              }}>
                                DEFAULT
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: '11px', color: theme.textMuted }}>
                            Expires {card.exp_month}/{card.exp_year}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {!card.is_default && (
                          <button
                            onClick={() => handleSetDefault(card.id)}
                            style={{
                              padding: '6px 10px', backgroundColor: 'transparent', color: theme.textSecondary,
                              border: `1px solid ${theme.border}`, borderRadius: '6px', fontSize: '11px',
                              cursor: 'pointer', minHeight: '32px'
                            }}
                          >
                            Set Default
                          </button>
                        )}
                        <button
                          onClick={() => handleRemoveCard(card.id)}
                          disabled={removingCardId === card.id}
                          style={{
                            padding: '6px', backgroundColor: 'transparent', color: theme.textMuted,
                            border: 'none', borderRadius: '6px', cursor: 'pointer', minHeight: '32px'
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ margin: 0, color: theme.text, fontSize: isMobile ? '16px' : '18px' }}>Payments</h3>
              <p style={{ margin: '4px 0 0', color: theme.textMuted, fontSize: '13px' }}>
                Payments received from this customer
              </p>
              {payments.length > 0 && (
                <div style={{ marginTop: '8px', fontSize: '15px', fontWeight: '600', color: '#16a34a' }}>
                  Total: ${payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0).toFixed(2)}
                </div>
              )}
            </div>

            {/* Invoice Payments / Stripe Transactions */}
            <div style={{ marginBottom: '24px' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px'
              }}>
                <DollarSign size={18} style={{ color: '#3b82f6' }} />
                <div>
                  <h4 style={{ margin: 0, color: theme.text, fontSize: '15px', fontWeight: '600' }}>Invoice Payments</h4>
                  <p style={{ margin: '2px 0 0', color: theme.textMuted, fontSize: '12px' }}>
                    Payments recorded against invoices, including Stripe transactions
                  </p>
                </div>
                {invoicePayments.length > 0 && (
                  <div style={{ marginLeft: 'auto', fontSize: '15px', fontWeight: '600', color: '#16a34a' }}>
                    ${invoicePayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0).toFixed(2)}
                  </div>
                )}
              </div>

              {invoicePayments.length === 0 ? (
                <div style={{
                  padding: '20px', textAlign: 'center', color: theme.textMuted, fontSize: '13px',
                  backgroundColor: theme.bg, borderRadius: '10px', border: `1px solid ${theme.border}`
                }}>
                  No invoice payments recorded yet
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {invoicePayments.map(pmt => {
                    const isPaid = pmt.status === 'Completed' || pmt.status === 'Paid' || pmt.status === 'succeeded'
                    const pColor = isPaid ? '#16a34a' : pmt.status === 'Failed' ? '#ef4444' : '#f59e0b'
                    const matchingInvoice = invoices.find(inv => inv.id === pmt.invoice_id)
                    return (
                      <div key={`inv-pmt-${pmt.id}`} style={{
                        padding: isMobile ? '14px 16px' : '16px 20px',
                        backgroundColor: theme.bg,
                        borderRadius: '10px',
                        border: `1px solid ${theme.border}`,
                      }}>
                        <div style={{
                          display: 'flex',
                          flexDirection: isMobile ? 'column' : 'row',
                          justifyContent: 'space-between',
                          alignItems: isMobile ? 'stretch' : 'center',
                          gap: isMobile ? '8px' : '16px'
                        }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: isMobile ? '15px' : '16px', fontWeight: '600', color: theme.text }}>
                                ${parseFloat(pmt.amount || 0).toFixed(2)}
                              </span>
                              <span style={{
                                padding: '4px 10px',
                                backgroundColor: pColor + '20',
                                color: pColor,
                                borderRadius: '6px',
                                fontSize: '12px',
                                fontWeight: '600'
                              }}>
                                {pmt.status || 'Pending'}
                              </span>
                              {pmt.method && (
                                <span style={{
                                  padding: '4px 8px',
                                  backgroundColor: theme.accentBg,
                                  color: theme.accent,
                                  borderRadius: '5px',
                                  fontSize: '11px',
                                  fontWeight: '500'
                                }}>
                                  {pmt.method}
                                </span>
                              )}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px', fontSize: '12px', color: theme.textMuted, flexWrap: 'wrap' }}>
                              {pmt.date && <span>{new Date(pmt.date).toLocaleDateString()}</span>}
                              {matchingInvoice && (
                                <span
                                  onClick={() => navigate(`/invoices/${matchingInvoice.id}`)}
                                  style={{ color: theme.accent, cursor: 'pointer', textDecoration: 'underline' }}
                                >
                                  {matchingInvoice.invoice_id || `Invoice #${matchingInvoice.id}`}
                                </span>
                              )}
                              {pmt.payment_id && <span>Ref: {pmt.payment_id}</span>}
                            </div>
                            {pmt.stripe_payment_intent_id && (
                              <div style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                marginTop: '6px', fontSize: '11px', color: theme.textMuted
                              }}>
                                <CreditCard size={12} />
                                <span>Stripe: {pmt.stripe_payment_intent_id.slice(0, 27)}...</span>
                              </div>
                            )}
                            {pmt.notes && (
                              <div style={{ fontSize: '12px', color: theme.textSecondary, marginTop: '4px' }}>
                                {pmt.notes.length > 80 ? pmt.notes.substring(0, 80) + '...' : pmt.notes}
                              </div>
                            )}
                          </div>
                          {matchingInvoice && (
                            <button
                              onClick={() => navigate(`/invoices/${matchingInvoice.id}`)}
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
                                whiteSpace: 'nowrap'
                              }}
                            >
                              View Invoice
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Lead Payments (Sales Deposits) */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px'
              }}>
                <TrendingUp size={18} style={{ color: '#f59e0b' }} />
                <h4 style={{ margin: 0, color: theme.text, fontSize: '15px', fontWeight: '600' }}>Lead/Deal Payments</h4>
              </div>
              <p style={{ margin: '0 0 4px', color: theme.textMuted, fontSize: '12px' }}>
                Deposits and payments from sales deals
              </p>
              {payments.length > 0 && (
                <div style={{ marginTop: '4px', fontSize: '15px', fontWeight: '600', color: '#16a34a' }}>
                  Total: ${payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0).toFixed(2)}
                </div>
              )}
            </div>

            {payments.length === 0 ? (
              <div style={{
                padding: '20px', textAlign: 'center', color: theme.textMuted, fontSize: '13px',
                backgroundColor: theme.bg, borderRadius: '10px', border: `1px solid ${theme.border}`
              }}>
                No lead/deal payments recorded
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {payments.map(pmt => {
                  const pColor = pmt.payment_status === 'Paid' || pmt.payment_status === 'Received' ? '#16a34a' : '#f59e0b'
                  return (
                    <div key={pmt.id} style={{
                      padding: isMobile ? '14px 16px' : '16px 20px',
                      backgroundColor: theme.bg,
                      borderRadius: '10px',
                      border: `1px solid ${theme.border}`,
                      display: 'flex',
                      flexDirection: isMobile ? 'column' : 'row',
                      justifyContent: 'space-between',
                      alignItems: isMobile ? 'stretch' : 'center',
                      gap: isMobile ? '8px' : '16px'
                    }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: isMobile ? '15px' : '16px', fontWeight: '600', color: theme.text }}>
                            ${parseFloat(pmt.amount || 0).toFixed(2)}
                          </span>
                          <span style={{
                            padding: '4px 10px',
                            backgroundColor: pColor + '20',
                            color: pColor,
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: '600'
                          }}>
                            {pmt.payment_status || 'Pending'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px', fontSize: '12px', color: theme.textMuted }}>
                          {pmt.date_created && <span>{new Date(pmt.date_created).toLocaleDateString()}</span>}
                          {pmt.notes && <span>{pmt.notes.length > 60 ? pmt.notes.substring(0, 60) + '...' : pmt.notes}</span>}
                          {pmt.lead_source && <span>{pmt.lead_source}</span>}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* COMMUNICATIONS TAB */}
        {activeTab === 'comms' && (
          <div>
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ margin: 0, color: theme.text, fontSize: isMobile ? '16px' : '18px' }}>Communications</h3>
              <p style={{ margin: '4px 0 0', color: theme.textMuted, fontSize: '13px' }}>
                Emails, calls, and messages with this customer
              </p>
            </div>

            {communications.length === 0 ? (
              <EmptyState
                icon={MessageCircle}
                iconColor="#6366f1"
                title="No communications"
                message="Communication logs will appear here."
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {communications.map(comm => {
                  const typeIcon = comm.type === 'email' ? Mail : comm.type === 'phone' || comm.type === 'call' ? Phone : MessageCircle
                  const TypeIcon = typeIcon
                  return (
                    <div key={comm.id} style={{
                      padding: isMobile ? '14px 16px' : '16px 20px',
                      backgroundColor: theme.bg,
                      borderRadius: '10px',
                      border: `1px solid ${theme.border}`,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                        <TypeIcon size={16} color={theme.accent} />
                        <span style={{ fontSize: '13px', fontWeight: '600', color: theme.text, textTransform: 'capitalize' }}>
                          {comm.type || 'Message'}
                        </span>
                        {comm.status && (
                          <span style={{
                            padding: '2px 8px',
                            backgroundColor: theme.accentBg,
                            color: theme.accent,
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: '500'
                          }}>
                            {comm.status}
                          </span>
                        )}
                        <span style={{ fontSize: '12px', color: theme.textMuted, marginLeft: 'auto' }}>
                          {comm.sent_date ? new Date(comm.sent_date).toLocaleDateString() : comm.created_at ? new Date(comm.created_at).toLocaleDateString() : ''}
                        </span>
                      </div>
                      {comm.recipient && (
                        <div style={{ fontSize: '13px', color: theme.textSecondary }}>
                          To: {comm.recipient}
                        </div>
                      )}
                      {comm.response && (
                        <div style={{ fontSize: '13px', color: theme.textMuted, marginTop: '4px' }}>
                          {comm.response.length > 120 ? comm.response.substring(0, 120) + '...' : comm.response}
                        </div>
                      )}
                      {comm.employee?.name && (
                        <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '4px' }}>
                          By: {comm.employee.name}
                        </div>
                      )}
                    </div>
                  )
                })}
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
                  Create Estimate
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
              {/* Add Product Buttons */}
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
                  onClick={() => setShowProductPicker(true)}
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

              {/* Product Picker Modal */}
              <ProductPickerModal
                isOpen={showProductPicker}
                onClose={() => setShowProductPicker(false)}
                onSelect={handleProductSelect}
              />

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
                  placeholder="Optional notes for this estimate..."
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
                {savingQuote ? 'Saving...' : 'Create Estimate'}
              </button>
            </div>
            <p style={{ fontSize: '11px', color: theme.textMuted, textAlign: 'center', margin: '8px 0 0' }}>
              Estimate will be tracked in your sales pipeline
            </p>
          </div>
        </>
      )}
    </div>
  )
}
