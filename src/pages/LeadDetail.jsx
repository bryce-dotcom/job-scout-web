import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { toast } from '../lib/toast'
import {
  ArrowLeft, Calendar, FileText, Clipboard, Plus, Send, Phone, Mail,
  MapPin, Building2, User, Clock, Edit3, ExternalLink, CheckCircle2, Lightbulb,
  CalendarDays, ClipboardList, X, Save, DollarSign, Inbox, Trash2, Package, Grid3X3,
  Paperclip, Download, Briefcase
} from 'lucide-react'
import Tooltip from '../components/Tooltip'
import FlowIndicator from '../components/FlowIndicator'
import DealBreadcrumb from '../components/DealBreadcrumb'
import EmptyState from '../components/EmptyState'
import ProductPickerModal from '../components/ProductPickerModal'

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

export default function LeadDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const employees = useStore((state) => state.employees)
  const createQuote = useStore((state) => state.createQuote)
  const createQuoteLine = useStore((state) => state.createQuoteLine)
  const updateLead = useStore((state) => state.updateLead)
  const updateQuote = useStore((state) => state.updateQuote)
  const serviceTypes = useStore((state) => state.serviceTypes)
  const leadSources = useStore((state) => state.leadSources)

  const [lead, setLead] = useState(null)
  const [audits, setAudits] = useState([])
  const [quotes, setQuotes] = useState([])
  const [appointment, setAppointment] = useState(null)
  const [activeTab, setActiveTab] = useState('info')
  const [loading, setLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [isMobile, setIsMobile] = useState(false)

  // Quote creation modal state
  const [showQuoteModal, setShowQuoteModal] = useState(false)
  const [quoteLines, setQuoteLines] = useState([])
  const [quoteDiscount, setQuoteDiscount] = useState(0)
  const [quoteNotes, setQuoteNotes] = useState('')
  const [savingQuote, setSavingQuote] = useState(false)
  const [showProductPicker, setShowProductPicker] = useState(false)
  const [attachments, setAttachments] = useState([])
  const [convertingToJob, setConvertingToJob] = useState(false)

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
      fetchLeadData()
    }
  }, [id, companyId])

  const fetchLeadData = async () => {
    setLoading(true)

    // Fetch lead with relations
    const { data: leadData, error: leadError } = await supabase
      .from('leads')
      .select(`
        *,
        lead_owner:employees!leads_lead_owner_id_fkey(id, name),
        setter_owner:employees!leads_setter_owner_id_fkey(id, name)
      `)
      .eq('id', id)
      .single()

    if (leadError) {
      console.error('Error fetching lead:', leadError)
      setLoading(false)
      return
    }

    setLead(leadData)

    // Fetch appointment if exists
    if (leadData?.appointment_id) {
      const { data: aptData } = await supabase
        .from('appointments')
        .select('*, salesperson:employees!salesperson_id(id, name)')
        .eq('id', leadData.appointment_id)
        .single()
      setAppointment(aptData)
    } else {
      // Try to find appointment by lead_id
      const { data: aptData } = await supabase
        .from('appointments')
        .select('*, salesperson:employees!salesperson_id(id, name)')
        .eq('lead_id', id)
        .order('start_time', { ascending: false })
        .limit(1)
        .single()
      setAppointment(aptData || null)
    }

    // Fetch audits linked to this lead
    const { data: auditData } = await supabase
      .from('lighting_audits')
      .select('*')
      .eq('lead_id', id)
      .order('created_at', { ascending: false })
    setAudits(auditData || [])

    // Fetch quotes linked to this lead
    const { data: quoteData } = await supabase
      .from('quotes')
      .select('*, quote_lines(*)')
      .eq('lead_id', id)
      .order('created_at', { ascending: false })
    setQuotes(quoteData || [])

    // Fetch file attachments linked to this lead
    const { data: attachData } = await supabase
      .from('file_attachments')
      .select('*')
      .eq('lead_id', id)
      .order('created_at', { ascending: false })
    setAttachments(attachData || [])

    setLoading(false)
  }

  // Create quote from audit
  const handleCreateQuoteFromAudit = async (audit) => {
    const quoteTempId = await createQuote({
      company_id: companyId,
      lead_id: lead.id,
      audit_id: audit.id,
      audit_type: 'lighting',
      quote_amount: audit.est_project_cost || 0,
      utility_incentive: audit.estimated_rebate || 0,
      status: 'Draft'
    })

    // Update lead with quote
    await updateLead(lead.id, { quote_id: quoteTempId })

    // Use audit areas from store instead of fetching from supabase
    const storeAuditAreas = useStore.getState().auditAreas
    const areas = storeAuditAreas.filter(a => String(a.audit_id) === String(audit.id))

    if (areas.length > 0) {
      for (const area of areas) {
        const qty = area.fixture_count || 1
        const unitPrice = (((area.existing_wattage || 0) - (area.led_wattage || 0)) * 5)
        await createQuoteLine({
          quote_id: quoteTempId,
          item_name: `${area.area_name} - LED Retrofit`,
          item_id: area.led_replacement_id || null,
          quantity: qty,
          price: Math.round(unitPrice * 100) / 100,
          line_total: Math.round(qty * unitPrice * 100) / 100
        })
      }
    }

    navigate(`/quotes/${quoteTempId}`)
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

    const quoteTempId = await createQuote({
      company_id: companyId,
      lead_id: lead.id,
      quote_amount: quoteTotal,
      discount: parseFloat(quoteDiscount) || 0,
      status: 'Draft',
      notes: quoteNotes || null
    })

    // Create quote lines
    for (const line of quoteLines) {
      await createQuoteLine({
        quote_id: quoteTempId,
        item_id: line.product_id,
        item_name: line.description,
        quantity: parseFloat(line.quantity) || 1,
        price: parseFloat(line.unit_price) || 0,
        line_total: line.line_total || 0
      })
    }

    // Update lead with quote_id and status
    await updateLead(lead.id, {
      quote_id: quoteTempId,
      status: 'Quote Sent',
      updated_at: new Date().toISOString()
    })

    setSavingQuote(false)
    setShowQuoteModal(false)
    await fetchLeadData()
  }

  // Mark quote as sent
  const handleSendQuote = async (quoteId) => {
    await updateQuote(quoteId, { status: 'Sent', sent_at: new Date().toISOString() })
    await updateLead(lead.id, { status: 'Quote Sent' })
    await fetchLeadData()
    alert('Quote marked as sent!')
  }

  // Start new audit
  const handleNewAudit = () => {
    navigate(`/audits/new?lead_id=${lead.id}`)
  }

  // Download attached file via signed URL
  const handleDownloadFile = async (att) => {
    try {
      const { data, error } = await supabase.storage
        .from(att.storage_bucket)
        .createSignedUrl(att.file_path, 3600)
      if (error || !data?.signedUrl) {
        alert('Could not generate download link')
        return
      }
      window.open(data.signedUrl, '_blank')
    } catch (err) {
      alert('Download failed: ' + (err.message || 'Unknown error'))
    }
  }

  // Convert Won lead to Job & Customer
  const handleConvertToJob = async () => {
    if (!confirm('Convert this lead to a Job & Customer?')) return
    setConvertingToJob(true)
    try {
      // 1. Find or create customer
      let customerId = null
      const { data: existingCustomers } = await supabase
        .from('customers')
        .select('id')
        .eq('company_id', companyId)
        .ilike('name', lead.customer_name.trim())
        .limit(1)

      if (existingCustomers?.length > 0) {
        customerId = existingCustomers[0].id
      } else {
        const { data: newCustomer, error: custError } = await supabase
          .from('customers')
          .insert({
            company_id: companyId,
            name: lead.customer_name.trim(),
            phone: lead.phone || null,
            email: lead.email || null,
            address: lead.address || null,
          })
          .select()
          .single()
        if (custError) throw custError
        customerId = newCustomer.id
      }

      // 2. Create job from lead data
      const audit = audits[0]
      const jobNumber = `JOB-${Date.now().toString(36).toUpperCase()}`

      const { data: newJob, error: jobError } = await supabase
        .from('jobs')
        .insert({
          company_id: companyId,
          job_id: jobNumber,
          job_title: `${lead.customer_name} - ${lead.service_type || 'Lighting Retrofit'}`,
          customer_id: customerId,
          lead_id: parseInt(id),
          salesperson_id: lead.lead_owner?.id || null,
          job_address: lead.address || null,
          status: 'Scheduled',
          details: lead.notes || null,
          contract_amount: audit?.est_project_cost || 0,
          utility_incentive: audit?.estimated_rebate || 0,
          start_date: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (jobError) throw jobError

      // Advance lead to Job Scheduled in the delivery pipeline
      await updateLead(lead.id, { status: 'Job Scheduled', updated_at: new Date().toISOString() })

      // 3. Link file attachments to the new job
      if (attachments.length > 0) {
        for (const att of attachments) {
          await supabase
            .from('file_attachments')
            .update({ job_id: newJob.id })
            .eq('id', att.id)
        }
      }

      // 4. Navigate to the new job
      toast.success('Moved to delivery pipeline')
      setConvertingToJob(false)
      navigate(`/jobs/${newJob.id}`)
    } catch (err) {
      console.error('Convert to job error:', err)
      alert('Failed to convert: ' + (err.message || 'Unknown error'))
      setConvertingToJob(false)
    }
  }

  // Inline edit handlers for Info tab
  const handleStartEdit = () => {
    setEditForm({
      customer_name: lead.customer_name || '',
      business_name: lead.business_name || '',
      phone: lead.phone || '',
      email: lead.email || '',
      address: lead.address || '',
      lead_source: lead.lead_source || '',
      service_type: lead.service_type || '',
      lead_owner_id: lead.lead_owner_id || '',
      setter_owner_id: lead.setter_owner_id || '',
      notes: lead.notes || ''
    })
    setIsEditing(true)
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
    setEditForm({})
  }

  const handleSaveEdit = async () => {
    await updateLead(lead.id, {
      customer_name: editForm.customer_name,
      business_name: editForm.business_name || null,
      phone: editForm.phone || null,
      email: editForm.email || null,
      address: editForm.address || null,
      lead_source: editForm.lead_source || null,
      service_type: editForm.service_type || null,
      lead_owner_id: editForm.lead_owner_id || null,
      setter_owner_id: editForm.setter_owner_id || null,
      notes: editForm.notes || null,
      updated_at: new Date().toISOString()
    })
    setIsEditing(false)
    setEditForm({})
    await fetchLeadData()
  }

  // Styles
  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    border: `1px solid ${theme.border}`,
    borderRadius: '8px',
    fontSize: '14px',
    color: theme.text,
    backgroundColor: theme.bgCard
  }

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: theme.textMuted }}>
        Loading...
      </div>
    )
  }

  if (!lead) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: theme.textMuted }}>
        Lead not found
      </div>
    )
  }

  const tabs = [
    { id: 'info', label: 'Info', icon: FileText, hint: 'Basic contact information' },
    { id: 'appointment', label: 'Appointment', icon: Calendar, hint: 'Scheduled meetings with this lead' },
    { id: 'audits', label: `Audits (${audits.length})`, icon: Clipboard, hint: 'Site surveys - Lenard can help with lighting' },
    { id: 'quotes', label: `Quotes (${quotes.length})`, icon: FileText, hint: 'Price proposals from audits' },
    { id: 'documents', label: `Docs (${attachments.length})`, icon: Paperclip, hint: 'Attached files and documents' }
  ]

  const getStatusColor = (status) => {
    const colors = {
      'New': '#3b82f6',
      'Contacted': '#8b5cf6',
      'Appointment Set': '#10b981',
      'Qualified': '#059669',
      'Quote Sent': '#6366f1',
      'Negotiation': '#f59e0b',
      'Won': '#10b981',
      'Job Scheduled': '#0ea5e9',
      'In Progress': '#f97316',
      'Job Complete': '#22c55e',
      'Invoiced': '#8b5cf6',
      'Closed': '#6b7280',
      'Lost': '#64748b'
    }
    return colors[status] || theme.accent
  }

  return (
    <div style={{ padding: isMobile ? '12px' : '24px', minHeight: '100vh', maxWidth: '100%', overflowX: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        marginBottom: isMobile ? '16px' : '24px'
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', minWidth: 0 }}>
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
              justifyContent: 'center',
              flexShrink: 0
            }}
          >
            <ArrowLeft size={20} />
          </button>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: isMobile ? '18px' : '24px', fontWeight: '700', color: theme.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: isMobile ? 'calc(100vw - 140px)' : 'none' }}>
                {lead.customer_name}
              </h1>
              <span style={{
                padding: '3px 8px',
                backgroundColor: getStatusColor(lead.status) + '20',
                color: getStatusColor(lead.status),
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '600',
                flexShrink: 0
              }}>
                {lead.status}
              </span>
            </div>
            <div style={{ fontSize: '13px', color: theme.textMuted, display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {lead.service_type && <span>{lead.service_type}</span>}
              {lead.lead_source && <span>Source: {lead.lead_source}</span>}
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {lead.phone && (
            <a
              href={`tel:${lead.phone}`}
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
          {lead.email && (
            <a
              href={`mailto:${lead.email}`}
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
          {lead.status === 'Won' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: isMobile ? 'stretch' : 'flex-start', flex: isMobile ? '1 1 100%' : 'none' }}>
              <button
                onClick={handleConvertToJob}
                disabled={convertingToJob}
                style={{
                  padding: isMobile ? '12px 16px' : '10px 14px',
                  minHeight: isMobile ? '44px' : 'auto',
                  backgroundColor: convertingToJob ? '#9ca3af' : '#7c3aed',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: convertingToJob ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  fontSize: '14px',
                  fontWeight: '600',
                  width: '100%'
                }}
              >
                <Briefcase size={16} />
                {convertingToJob ? 'Converting...' : 'Convert to Job & Customer'}
              </button>
              <span style={{ fontSize: '10px', color: '#7c3aed', marginTop: '4px', textAlign: 'center' }}>Moves to delivery pipeline</span>
            </div>
          )}
        </div>
      </div>

      {/* Lead Journey Flow Indicator */}
      <div style={{ maxWidth: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        <FlowIndicator currentStatus={lead.status} showCompact={isMobile} />
      </div>

      {/* Deal Breadcrumb */}
      <DealBreadcrumb
        current="lead"
        leadId={lead.id}
        quoteId={lead.quote_id}
        customerId={lead.converted_customer_id}
      />

      {/* Tabs */}
      <div style={{
        overflowX: 'auto',
        overflowY: 'visible',
        WebkitOverflowScrolling: 'touch',
        marginBottom: isMobile ? '16px' : '24px',
        borderBottom: `1px solid ${theme.border}`,
        paddingBottom: '12px',
        marginLeft: isMobile ? '-12px' : 0,
        marginRight: isMobile ? '-12px' : 0,
        paddingLeft: isMobile ? '12px' : 0,
        paddingRight: isMobile ? '12px' : 0
      }}>
        <div style={{
          display: 'flex',
          gap: '6px',
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
        padding: isMobile ? '12px' : '24px',
        maxWidth: '100%',
        overflowX: 'hidden'
      }}>

        {/* INFO TAB */}
        {activeTab === 'info' && (
          <div>
            {/* Edit / Save / Cancel bar */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginBottom: '16px' }}>
              {isEditing ? (
                <>
                  <button
                    onClick={handleCancelEdit}
                    style={{ padding: '8px 16px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, fontSize: '13px', fontWeight: '500', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <X size={14} /> Cancel
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    style={{ padding: '8px 16px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', fontSize: '13px', fontWeight: '500', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Save size={14} /> Save
                  </button>
                </>
              ) : (
                <button
                  onClick={handleStartEdit}
                  style={{ padding: '8px 16px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, fontSize: '13px', fontWeight: '500', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Edit3 size={14} /> Edit
                </button>
              )}
            </div>

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
                    <User size={16} color={theme.textMuted} style={{ flexShrink: 0 }} />
                    {isEditing ? (
                      <input type="text" value={editForm.customer_name} onChange={(e) => setEditForm({ ...editForm, customer_name: e.target.value })} style={inputStyle} placeholder="Customer Name" />
                    ) : (
                      <span style={{ color: theme.text }}>{lead.customer_name}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Building2 size={16} color={theme.textMuted} style={{ flexShrink: 0 }} />
                    {isEditing ? (
                      <input type="text" value={editForm.business_name} onChange={(e) => setEditForm({ ...editForm, business_name: e.target.value })} style={inputStyle} placeholder="Business Name" />
                    ) : (
                      <span style={{ color: theme.text }}>{lead.business_name || '-'}</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Phone size={16} color={theme.textMuted} style={{ flexShrink: 0 }} />
                    {isEditing ? (
                      <input type="tel" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} style={inputStyle} placeholder="Phone" />
                    ) : (
                      lead.phone ? <a href={`tel:${lead.phone}`} style={{ color: theme.accent }}>{lead.phone}</a> : <span style={{ color: theme.textMuted }}>-</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Mail size={16} color={theme.textMuted} style={{ flexShrink: 0 }} />
                    {isEditing ? (
                      <input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} style={inputStyle} placeholder="Email" />
                    ) : (
                      lead.email ? <a href={`mailto:${lead.email}`} style={{ color: theme.accent }}>{lead.email}</a> : <span style={{ color: theme.textMuted }}>-</span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                    <MapPin size={16} color={theme.textMuted} style={{ marginTop: '2px', flexShrink: 0 }} />
                    {isEditing ? (
                      <textarea value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} rows={2} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Address" />
                    ) : (
                      <span style={{ color: theme.text }}>{lead.address || '-'}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Lead Details */}
              <div style={{
                padding: isMobile ? '16px' : '20px',
                backgroundColor: theme.bg,
                borderRadius: '10px'
              }}>
                <h3 style={{ fontSize: '14px', fontWeight: '600', color: theme.textSecondary, marginBottom: isMobile ? '12px' : '16px' }}>
                  Lead Details
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>Source</div>
                    {isEditing ? (
                      <select value={editForm.lead_source} onChange={(e) => setEditForm({ ...editForm, lead_source: e.target.value })} style={inputStyle}>
                        <option value="">-- Select --</option>
                        {(leadSources || []).map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : (
                      <div style={{ fontSize: '14px', color: theme.text }}>{lead.lead_source || '-'}</div>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>Service Type</div>
                    {isEditing ? (
                      <select value={editForm.service_type} onChange={(e) => setEditForm({ ...editForm, service_type: e.target.value })} style={inputStyle}>
                        <option value="">-- Select --</option>
                        {(serviceTypes || []).map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    ) : (
                      <div style={{ fontSize: '14px', color: theme.text }}>{lead.service_type || '-'}</div>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>Lead Owner</div>
                    {isEditing ? (
                      <select value={editForm.lead_owner_id} onChange={(e) => setEditForm({ ...editForm, lead_owner_id: e.target.value })} style={inputStyle}>
                        <option value="">-- Select --</option>
                        {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                      </select>
                    ) : (
                      <div style={{ fontSize: '14px', color: theme.text }}>{lead.lead_owner?.name || '-'}</div>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>Setter</div>
                    {isEditing ? (
                      <select value={editForm.setter_owner_id} onChange={(e) => setEditForm({ ...editForm, setter_owner_id: e.target.value })} style={inputStyle}>
                        <option value="">-- Select --</option>
                        {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                      </select>
                    ) : (
                      <div style={{ fontSize: '14px', color: theme.text }}>{lead.setter_owner?.name || '-'}</div>
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>Contact Attempts</div>
                    <div style={{ fontSize: '14px', color: theme.text }}>{lead.contact_attempts || 0}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>Last Contact</div>
                    <div style={{ fontSize: '14px', color: theme.text }}>
                      {lead.last_contact_at ? new Date(lead.last_contact_at).toLocaleDateString() : '-'}
                    </div>
                  </div>
                </div>
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
                {isEditing ? (
                  <textarea value={editForm.notes} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} rows={4} style={{ ...inputStyle, resize: 'vertical' }} placeholder="Notes about this lead..." />
                ) : (
                  <p style={{ fontSize: '14px', color: theme.text, whiteSpace: 'pre-wrap', margin: 0 }}>
                    {lead.notes || '-'}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* APPOINTMENT TAB */}
        {activeTab === 'appointment' && (
          <div>
            {appointment ? (
              <div style={{
                padding: isMobile ? '16px' : '24px',
                backgroundColor: '#dcfce7',
                borderRadius: '12px',
                border: '1px solid #86efac'
              }}>
                <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', gap: '12px', marginBottom: '16px' }}>
                  <Calendar size={isMobile ? 20 : 24} color="#166534" style={{ flexShrink: 0, marginTop: isMobile ? '2px' : 0 }} />
                  <div>
                    <div style={{ fontSize: isMobile ? '16px' : '20px', fontWeight: '700', color: '#166534' }}>
                      {new Date(appointment.start_time).toLocaleDateString('en-US', {
                        weekday: isMobile ? 'short' : 'long',
                        month: isMobile ? 'short' : 'long',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </div>
                    <div style={{ fontSize: isMobile ? '14px' : '16px', color: '#15803d' }}>
                      {new Date(appointment.start_time).toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                      {appointment.end_time && (
                        <>
                          {' - '}
                          {new Date(appointment.end_time).toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? '12px' : '16px' }}>
                  <div>
                    <div style={{ fontSize: '12px', color: '#15803d', marginBottom: '4px' }}>Status</div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#166534' }}>
                      {appointment.status}
                    </div>
                  </div>
                  {appointment.salesperson && (
                    <div>
                      <div style={{ fontSize: '12px', color: '#15803d', marginBottom: '4px' }}>Salesperson</div>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: '#166534' }}>
                        {appointment.salesperson.name}
                      </div>
                    </div>
                  )}
                  {appointment.location && (
                    <div style={{ gridColumn: isMobile ? 'span 1' : 'span 2' }}>
                      <div style={{ fontSize: '12px', color: '#15803d', marginBottom: '4px' }}>Location</div>
                      <div style={{ fontSize: '14px', color: '#166534' }}>
                        {appointment.location}
                      </div>
                    </div>
                  )}
                  {appointment.notes && (
                    <div style={{ gridColumn: isMobile ? 'span 1' : 'span 2' }}>
                      <div style={{ fontSize: '12px', color: '#15803d', marginBottom: '4px' }}>Notes</div>
                      <div style={{ fontSize: '14px', color: '#166534' }}>
                        {appointment.notes}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <EmptyState
                icon={CalendarDays}
                iconColor="#22c55e"
                title="No appointment scheduled"
                message="Schedule a meeting with this lead to move them forward in the sales process."
                actionLabel="Go to Lead Setter"
                onAction={() => navigate('/lead-setter')}
              />
            )}
          </div>
        )}

        {/* AUDITS TAB */}
        {activeTab === 'audits' && (
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
                <h3 style={{ margin: 0, color: theme.text, fontSize: isMobile ? '16px' : '18px' }}>Audits & Takeoffs</h3>
                <p style={{ margin: '4px 0 0', color: theme.textMuted, fontSize: '13px' }}>
                  Create lighting audits to generate accurate quotes
                </p>
              </div>
              <button
                onClick={handleNewAudit}
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
                New Lighting Audit
              </button>
            </div>

            {audits.length === 0 ? (
              <EmptyState
                icon={Lightbulb}
                iconColor="#8b5cf6"
                title="No audits yet"
                message="Create a lighting audit to calculate energy savings, find rebates, and generate a professional quote automatically."
                actionLabel="Start Lighting Audit"
                onAction={handleNewAudit}
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {audits.map(audit => (
                  <div key={audit.id} style={{
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
                      <div style={{ fontWeight: '600', color: theme.text, fontSize: isMobile ? '15px' : '16px' }}>
                        {audit.audit_name || audit.location_name || 'Lighting Audit'}
                      </div>
                      <div style={{ fontSize: isMobile ? '13px' : '14px', color: theme.textMuted, marginTop: '4px' }}>
                        {audit.total_fixtures || 0} fixtures
                        {audit.est_project_cost > 0 && (
                          <> • ${(audit.est_project_cost || 0).toLocaleString()} estimated</>
                        )}
                      </div>
                      <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>
                        Created {new Date(audit.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => navigate(`/audits/${audit.id}`)}
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
                        View
                      </button>
                      <Tooltip text="Generate a quote with line items from this audit">
                        <button
                          onClick={() => handleCreateQuoteFromAudit(audit)}
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
                            flex: isMobile ? 1 : 'none'
                          }}
                        >
                          Create Quote
                        </button>
                      </Tooltip>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
                  Create and send quotes to convert this lead
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
                icon={ClipboardList}
                iconColor="#3b82f6"
                title="No quotes yet"
                message={audits.length > 0
                  ? "You have audits available! Create a quote from an audit to auto-fill line items and pricing."
                  : "Create a quote manually, or go to the Audits tab first to generate one automatically."}
                actionLabel="Create Quote"
                onAction={openQuoteModal}
                secondaryLabel={audits.length === 0 ? "Create Audit First" : undefined}
                onSecondaryAction={audits.length === 0 ? () => setActiveTab('audits') : undefined}
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
                          {quote.audit_id ? 'Generated from audit' : 'Manual quote'}
                          {quote.quote_lines?.length > 0 && ` • ${quote.quote_lines.length} line items`}
                        </div>
                        <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>
                          Created {new Date(quote.created_at).toLocaleDateString()}
                          {quote.sent_at && ` • Sent ${new Date(quote.sent_at).toLocaleDateString()}`}
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

        {/* DOCUMENTS TAB */}
        {activeTab === 'documents' && (
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
                <h3 style={{ margin: 0, color: theme.text, fontSize: isMobile ? '16px' : '18px' }}>Documents & Attachments</h3>
                <p style={{ margin: '4px 0 0', color: theme.textMuted, fontSize: '13px' }}>
                  Files attached from Lenard audits and contract signing
                </p>
              </div>
            </div>

            {attachments.length === 0 ? (
              <EmptyState
                icon={Paperclip}
                iconColor="#6366f1"
                title="No documents yet"
                message="Documents will appear here when files are attached from Lenard's audit and contract flow."
              />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {attachments.map(att => {
                  const ext = (att.file_name || '').split('.').pop()?.toLowerCase()
                  const iconColor = ext === 'pdf' ? '#dc2626' : ext === 'xlsx' ? '#16a34a' : '#6366f1'
                  const sizeKB = att.file_size ? Math.round(att.file_size / 1024) : null

                  return (
                    <div key={att.id} style={{
                      padding: isMobile ? '14px 16px' : '14px 20px',
                      backgroundColor: theme.bg,
                      borderRadius: '10px',
                      border: `1px solid ${theme.border}`,
                      display: 'flex',
                      alignItems: isMobile ? 'flex-start' : 'center',
                      gap: '14px',
                      flexDirection: isMobile ? 'column' : 'row',
                      justifyContent: 'space-between'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                        <div style={{
                          width: '40px', height: '40px',
                          backgroundColor: iconColor + '18',
                          borderRadius: '8px',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          <FileText size={20} color={iconColor} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{
                            fontWeight: '600', color: theme.text, fontSize: '14px',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                          }}>
                            {att.file_name}
                          </div>
                          <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>
                            {ext?.toUpperCase()}{sizeKB ? ` \u2022 ${sizeKB}KB` : ''}
                            {' \u2022 '}{new Date(att.created_at).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDownloadFile(att)}
                        style={{
                          padding: isMobile ? '10px 16px' : '8px 14px',
                          minHeight: isMobile ? '44px' : 'auto',
                          backgroundColor: theme.accentBg,
                          color: theme.accent,
                          border: `1px solid ${theme.accent}`,
                          borderRadius: '8px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          fontSize: '13px',
                          fontWeight: '500',
                          whiteSpace: 'nowrap',
                          width: isMobile ? '100%' : 'auto',
                          justifyContent: 'center'
                        }}
                      >
                        <Download size={14} />
                        Download
                      </button>
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
                  Create Quote
                </h2>
                <p style={{ fontSize: '13px', color: theme.textMuted, margin: '4px 0 0' }}>
                  {lead.customer_name}
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
