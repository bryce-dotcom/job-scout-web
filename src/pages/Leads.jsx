import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { Plus, Pencil, X, UserPlus, Phone, Mail, Calendar, FileText, UserCheck, Search, Trash2, Upload, Download, Users, Send } from 'lucide-react'

const LEAD_STATUSES = ['New', 'Assigned', 'Contacted', 'Callback', 'Appointment Set', 'Qualified', 'Not Qualified', 'Converted']

const emptyLead = {
  customer_name: '',
  business_name: '',
  email: '',
  phone: '',
  address: '',
  service_type: '',
  lead_source: '',
  lead_owner_id: '',
  setter_owner_id: '',
  status: 'New',
  salesperson_id: '',
  notes: '',
  appointment_time: '',
  job_title: '',
  business_unit: ''
}

export default function Leads() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const user = useStore((state) => state.user)
  const leads = useStore((state) => state.leads)
  const employees = useStore((state) => state.employees)
  const serviceTypes = useStore((state) => state.serviceTypes)
  const leadSources = useStore((state) => state.leadSources)
  const fetchLeads = useStore((state) => state.fetchLeads)
  const fetchCustomers = useStore((state) => state.fetchCustomers)

  const themeContext = useTheme()
  const theme = themeContext?.theme || {
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

  const [showModal, setShowModal] = useState(false)
  const [showAppointmentModal, setShowAppointmentModal] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showAssignModal, setShowAssignModal] = useState(false)
  const [editingLead, setEditingLead] = useState(null)
  const [selectedLead, setSelectedLead] = useState(null)
  const [formData, setFormData] = useState(emptyLead)
  const [appointmentData, setAppointmentData] = useState({ title: '', start_time: '', end_time: '', location: '', notes: '' })
  const [assignSetterId, setAssignSetterId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [importData, setImportData] = useState('')
  const [importError, setImportError] = useState(null)
  const [importSuccess, setImportSuccess] = useState(null)
  const [isMobile, setIsMobile] = useState(false)
  const [ownerFilter, setOwnerFilter] = useState('all')

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchLeads()
  }, [companyId, navigate, fetchLeads])

  // Get active employees for owner filter
  const activeEmployees = employees.filter(e => e.active !== false)

  const filteredLeads = leads.filter(lead => {
    const matchesSearch = searchTerm === '' ||
      lead.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.business_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.email?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === 'all' || lead.status === statusFilter
    const matchesSource = sourceFilter === 'all' || lead.lead_source === sourceFilter
    const matchesOwner = ownerFilter === 'all' ||
      (ownerFilter === 'unassigned' ? !lead.lead_owner_id : lead.lead_owner_id === parseInt(ownerFilter))
    return matchesSearch && matchesStatus && matchesSource && matchesOwner
  })

  // Status colors for badges
  const statusColors = {
    'New': { bg: '#e0e7ff', text: '#4338ca' },
    'Assigned': { bg: '#f3e8ff', text: '#7c3aed' },
    'Contacted': { bg: '#fef3c7', text: '#d97706' },
    'Callback': { bg: '#fce7f3', text: '#db2777' },
    'Appointment Set': { bg: '#d1fae5', text: '#059669' },
    'Qualified': { bg: '#dbeafe', text: '#2563eb' },
    'Quote Sent': { bg: '#e0e7ff', text: '#4f46e5' },
    'Negotiation': { bg: '#ffedd5', text: '#ea580c' },
    'Won': { bg: '#d1fae5', text: '#059669' },
    'Lost': { bg: '#f3f4f6', text: '#6b7280' },
    'Not Qualified': { bg: '#fee2e2', text: '#dc2626' },
    'Converted': { bg: '#f3e8ff', text: '#9333ea' }
  }

  const getStatusStyle = (status) => {
    const colors = statusColors[status] || { bg: theme.bg, text: theme.textMuted }
    return { backgroundColor: colors.bg, color: colors.text }
  }

  const getSourceLabel = (value) => {
    return value || '-'
  }

  const openAddModal = () => {
    setEditingLead(null)
    setFormData({
      ...emptyLead,
      lead_owner_id: user?.id || ''
    })
    setError(null)
    setShowModal(true)
  }

  const openEditModal = (lead) => {
    setEditingLead(lead)
    setFormData({
      customer_name: lead.customer_name || '',
      business_name: lead.business_name || '',
      email: lead.email || '',
      phone: lead.phone || '',
      address: lead.address || '',
      service_type: lead.service_type || '',
      lead_source: lead.lead_source || '',
      lead_owner_id: lead.lead_owner_id || '',
      setter_owner_id: lead.setter_owner_id || '',
      status: lead.status || 'New',
      salesperson_id: lead.salesperson_id || '',
      notes: lead.notes || '',
      appointment_time: lead.appointment_time || '',
      job_title: lead.job_title || '',
      business_unit: lead.business_unit || ''
    })
    setError(null)
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingLead(null)
    setFormData(emptyLead)
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
      customer_name: formData.customer_name,
      business_name: formData.business_name || null,
      email: formData.email || null,
      phone: formData.phone || null,
      address: formData.address || null,
      service_type: formData.service_type || null,
      lead_source: formData.lead_source || null,
      lead_owner_id: formData.lead_owner_id || null,
      setter_owner_id: formData.setter_owner_id || null,
      status: formData.status || 'New',
      salesperson_id: formData.salesperson_id || null,
      notes: formData.notes || null,
      updated_at: new Date().toISOString()
    }

    let result
    if (editingLead) {
      result = await supabase.from('leads').update(payload).eq('id', editingLead.id)
    } else {
      result = await supabase.from('leads').insert([payload])
    }

    if (result.error) {
      setError(result.error.message)
      setLoading(false)
      return
    }

    await fetchLeads()
    closeModal()
    setLoading(false)
  }

  // Open assign to setter modal
  const openAssignModal = (lead) => {
    setSelectedLead(lead)
    setAssignSetterId(lead.setter_owner_id || '')
    setShowAssignModal(true)
  }

  // Assign lead to setter
  const handleAssignToSetter = async () => {
    if (!selectedLead || !assignSetterId) return
    setLoading(true)

    const { error } = await supabase.from('leads').update({
      setter_owner_id: parseInt(assignSetterId),
      status: 'Assigned',
      updated_at: new Date().toISOString()
    }).eq('id', selectedLead.id)

    if (!error) {
      await fetchLeads()
    }

    setShowAssignModal(false)
    setSelectedLead(null)
    setAssignSetterId('')
    setLoading(false)
  }

  const openAppointmentModal = (lead) => {
    setSelectedLead(lead)
    setAppointmentData({
      title: `Appointment with ${lead.customer_name}`,
      start_time: '',
      end_time: '',
      location: lead.address || '',
      notes: ''
    })
    setShowAppointmentModal(true)
  }

  const handleCreateAppointment = async (e) => {
    e.preventDefault()
    setLoading(true)

    const startTime = new Date(appointmentData.start_time)
    const endTime = appointmentData.end_time ? new Date(appointmentData.end_time) : new Date(startTime.getTime() + 60 * 60 * 1000)

    const { data: appointment, error } = await supabase.from('appointments').insert([{
      company_id: companyId,
      lead_id: selectedLead.id,
      title: appointmentData.title,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      duration_minutes: Math.round((endTime - startTime) / 60000),
      location: appointmentData.location || null,
      notes: appointmentData.notes || null,
      setter_id: user?.id,
      lead_owner_id: selectedLead.lead_owner_id,
      status: 'Scheduled'
    }]).select().single()

    if (!error && appointment) {
      await supabase.from('leads').update({
        status: 'Appointment Set',
        appointment_time: startTime.toISOString(),
        appointment_id: appointment.id,
        updated_at: new Date().toISOString()
      }).eq('id', selectedLead.id)
      await fetchLeads()
    }

    setShowAppointmentModal(false)
    setSelectedLead(null)
    setLoading(false)
  }

  const handleCreateQuote = (lead) => {
    navigate(`/quotes/new?lead_id=${lead.id}`)
  }

  const handleConvertToCustomer = async (lead) => {
    if (!confirm(`Convert ${lead.customer_name} to a customer?`)) return

    const { data: customer, error } = await supabase.from('customers').insert([{
      company_id: companyId,
      name: lead.customer_name,
      business_name: lead.business_name,
      email: lead.email,
      phone: lead.phone,
      address: lead.address,
      job_title: lead.job_title,
      salesperson_id: lead.salesperson_id,
      status: 'Active',
      notes: lead.notes
    }]).select().single()

    if (!error && customer) {
      await supabase.from('leads').update({
        status: 'Converted',
        customer_id: customer.id,
        updated_at: new Date().toISOString()
      }).eq('id', lead.id)
      await fetchLeads()
      await fetchCustomers()
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleDateString()
  }

  const handleDelete = async (lead) => {
    if (!confirm(`Delete lead "${lead.customer_name}"? This cannot be undone.`)) return

    const { error } = await supabase.from('leads').delete().eq('id', lead.id)
    if (!error) {
      await fetchLeads()
    }
  }

  // CSV Import
  const handleImport = async () => {
    setImportError(null)
    setImportSuccess(null)
    setLoading(true)

    try {
      const lines = importData.trim().split('\n')
      if (lines.length < 2) {
        setImportError('CSV must have a header row and at least one data row')
        setLoading(false)
        return
      }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/['"]/g, ''))

      const headerMap = {
        'name': 'customer_name',
        'customer': 'customer_name',
        'customer_name': 'customer_name',
        'company': 'business_name',
        'business': 'business_name',
        'business_name': 'business_name',
        'email': 'email',
        'phone': 'phone',
        'telephone': 'phone',
        'address': 'address',
        'source': 'lead_source',
        'lead_source': 'lead_source',
        'service': 'service_type',
        'service_type': 'service_type',
        'notes': 'notes',
        'status': 'status'
      }

      const mappedHeaders = headers.map(h => headerMap[h] || h)

      if (!mappedHeaders.includes('customer_name')) {
        setImportError('CSV must have a "name" or "customer_name" column')
        setLoading(false)
        return
      }

      const leadsToInsert = []
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line) continue

        const values = []
        let current = ''
        let inQuotes = false
        for (let j = 0; j < line.length; j++) {
          const char = line[j]
          if (char === '"') {
            inQuotes = !inQuotes
          } else if (char === ',' && !inQuotes) {
            values.push(current.trim())
            current = ''
          } else {
            current += char
          }
        }
        values.push(current.trim())

        const lead = { company_id: companyId, status: 'New', lead_source: 'purchased_list' }
        mappedHeaders.forEach((header, idx) => {
          if (values[idx] && ['customer_name', 'business_name', 'email', 'phone', 'address', 'lead_source', 'service_type', 'notes', 'status'].includes(header)) {
            lead[header] = values[idx]
          }
        })

        if (lead.customer_name) {
          leadsToInsert.push(lead)
        }
      }

      if (leadsToInsert.length === 0) {
        setImportError('No valid leads found in CSV')
        setLoading(false)
        return
      }

      const batchSize = 100
      let imported = 0
      for (let i = 0; i < leadsToInsert.length; i += batchSize) {
        const batch = leadsToInsert.slice(i, i + batchSize)
        const { error } = await supabase.from('leads').insert(batch)
        if (error) {
          setImportError(`Error importing batch: ${error.message}`)
          setLoading(false)
          return
        }
        imported += batch.length
      }

      setImportSuccess(`Successfully imported ${imported} leads!`)
      await fetchLeads()
      setTimeout(() => {
        setShowImportModal(false)
        setImportData('')
        setImportSuccess(null)
      }, 2000)
    } catch (err) {
      setImportError(`Import failed: ${err.message}`)
    }
    setLoading(false)
  }

  const downloadTemplate = () => {
    const template = 'customer_name,business_name,email,phone,address,lead_source,service_type,notes\nJohn Doe,Acme Corp,john@acme.com,555-1234,123 Main St,website,Commercial,Interested in lighting audit'
    const blob = new Blob([template], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'leads_template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  // Get employees who can be setters
  const setterEmployees = employees.filter(e =>
    e.role === 'Setter' || e.role === 'Sales' || e.role === 'Admin' || e.role === 'Manager' || e.role === 'Owner'
  )

  const getEmployeeName = (id) => {
    const emp = employees.find(e => e.id === id)
    return emp?.name || '-'
  }

  // Quick inline update for lead owner
  const handleQuickOwnerChange = async (lead, newOwnerId) => {
    const { error } = await supabase.from('leads').update({
      lead_owner_id: newOwnerId ? parseInt(newOwnerId) : null,
      updated_at: new Date().toISOString()
    }).eq('id', lead.id)
    if (!error) await fetchLeads()
  }

  // Quick inline update for setter
  const handleQuickSetterChange = async (lead, newSetterId) => {
    const updates = {
      setter_owner_id: newSetterId ? parseInt(newSetterId) : null,
      updated_at: new Date().toISOString()
    }
    // If assigning a setter and status is New, change to Assigned
    if (newSetterId && lead.status === 'New') {
      updates.status = 'Assigned'
    }
    const { error } = await supabase.from('leads').update(updates).eq('id', lead.id)
    if (!error) await fetchLeads()
  }

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    backgroundColor: theme.bg,
    border: `1px solid ${theme.border}`,
    borderRadius: '8px',
    color: theme.text,
    fontSize: '14px',
    outline: 'none'
  }

  const labelStyle = {
    display: 'block',
    marginBottom: '6px',
    fontSize: '14px',
    fontWeight: '500',
    color: theme.text
  }

  return (
    <div style={{ padding: isMobile ? '16px' : '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <h1 style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: '700', color: theme.text }}>Leads</h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowImportModal(true)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: isMobile ? '10px' : '10px 16px', minHeight: isMobile ? '44px' : 'auto', backgroundColor: 'transparent', color: theme.accent, border: `1px solid ${theme.border}`, borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>
            <Upload size={18} />
            {!isMobile && 'Import CSV'}
          </button>
          <button onClick={openAddModal} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', padding: isMobile ? '10px 14px' : '10px 16px', minHeight: isMobile ? '44px' : 'auto', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>
            <Plus size={20} />
            {isMobile ? 'Add' : 'Add Lead'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: isMobile ? '8px' : '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: isMobile ? '100%' : '200px' }}>
          <Search size={20} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: theme.textMuted }} />
          <input type="text" placeholder="Search leads..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ ...inputStyle, paddingLeft: '40px', backgroundColor: theme.bgCard, minHeight: isMobile ? '44px' : 'auto' }} />
        </div>
        <select value={ownerFilter} onChange={(e) => setOwnerFilter(e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: isMobile ? 'auto' : '140px', flex: isMobile ? 1 : 'none', backgroundColor: theme.bgCard, minHeight: isMobile ? '44px' : 'auto' }}>
          <option value="all">All Owners</option>
          <option value="unassigned">Unassigned</option>
          {activeEmployees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: isMobile ? 'auto' : '140px', flex: isMobile ? 1 : 'none', backgroundColor: theme.bgCard, minHeight: isMobile ? '44px' : 'auto' }}>
          <option value="all">All Status</option>
          {LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: isMobile ? 'auto' : '140px', flex: isMobile ? 1 : 'none', backgroundColor: theme.bgCard, minHeight: isMobile ? '44px' : 'auto' }}>
          <option value="all">All Sources</option>
          {leadSources.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Leads List */}
      {filteredLeads.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px', backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}` }}>
          <UserPlus size={48} style={{ color: theme.textMuted, marginBottom: '16px' }} />
          <p style={{ color: theme.textSecondary }}>No leads found.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))', gap: '12px' }}>
          {filteredLeads.map((lead) => (
            <div
              key={lead.id}
              onClick={() => navigate(`/leads/${lead.id}`)}
              style={{
                backgroundColor: theme.bgCard,
                border: `1px solid ${theme.border}`,
                borderRadius: '8px',
                padding: '16px',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = theme.accent
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = theme.border
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              {/* TOP ROW: Name + Status Badge */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '8px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, margin: 0, lineHeight: 1.3 }}>
                  {lead.customer_name}
                </h3>
                <span style={{
                  padding: '4px 10px',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: '600',
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                  ...getStatusStyle(lead.status)
                }}>
                  {lead.status}
                </span>
              </div>

              {/* Business Name */}
              {lead.business_name && (
                <div style={{ fontSize: '13px', color: theme.textSecondary, marginBottom: '10px' }}>
                  {lead.business_name}
                </div>
              )}

              {/* Contact Info: Phone & Email */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '13px', color: theme.textMuted, marginBottom: '12px', flexWrap: 'wrap' }}>
                {lead.phone && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <Phone size={13} />
                    <span>{lead.phone}</span>
                  </div>
                )}
                {lead.phone && lead.email && <span style={{ color: theme.border }}>|</span>}
                {lead.email && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '5px', overflow: 'hidden' }}>
                    <Mail size={13} style={{ flexShrink: 0 }} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.email}</span>
                  </div>
                )}
              </div>

              {/* BOTTOM ROW: Service type + Appointment + Quote indicators */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                {lead.service_type && (
                  <span style={{
                    fontSize: '11px',
                    padding: '4px 8px',
                    backgroundColor: theme.bg,
                    color: theme.textSecondary,
                    borderRadius: '4px',
                    fontWeight: '500'
                  }}>
                    {lead.service_type}
                  </span>
                )}
                {lead.appointment_time && (
                  <span style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '11px',
                    padding: '4px 8px',
                    backgroundColor: '#d1fae5',
                    color: '#059669',
                    borderRadius: '4px',
                    fontWeight: '500'
                  }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#059669' }} />
                    <Calendar size={11} />
                    {new Date(lead.appointment_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                )}
                {lead.quote_id && (
                  <span style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    fontSize: '11px',
                    padding: '4px 8px',
                    backgroundColor: '#dbeafe',
                    color: '#2563eb',
                    borderRadius: '4px',
                    fontWeight: '500'
                  }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#2563eb' }} />
                    <FileText size={11} />
                    Quote
                  </span>
                )}
                {lead.estimated_value > 0 && (
                  <span style={{
                    fontSize: '11px',
                    padding: '4px 8px',
                    backgroundColor: '#fef3c7',
                    color: '#d97706',
                    borderRadius: '4px',
                    fontWeight: '600'
                  }}>
                    ${lead.estimated_value.toLocaleString()}
                  </span>
                )}
              </div>

              {/* Quick Actions - shown below with separator */}
              <div style={{
                display: 'flex',
                gap: '8px',
                marginTop: '12px',
                paddingTop: '12px',
                borderTop: `1px solid ${theme.border}`
              }}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={(e) => { e.stopPropagation(); openEditModal(lead); }}
                  style={{
                    padding: isMobile ? '10px' : '8px 12px',
                    minHeight: isMobile ? '44px' : 'auto',
                    backgroundColor: 'transparent',
                    border: `1px solid ${theme.border}`,
                    borderRadius: '6px',
                    color: theme.textSecondary,
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Pencil size={14} />
                  Edit
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); openAppointmentModal(lead); }}
                  style={{
                    flex: 1,
                    padding: isMobile ? '10px' : '8px',
                    minHeight: isMobile ? '44px' : 'auto',
                    backgroundColor: 'transparent',
                    border: `1px solid ${theme.border}`,
                    borderRadius: '6px',
                    color: theme.textSecondary,
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px'
                  }}
                >
                  <Calendar size={14} />
                  Appt
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleCreateQuote(lead); }}
                  style={{
                    flex: 1,
                    padding: isMobile ? '10px' : '8px',
                    minHeight: isMobile ? '44px' : 'auto',
                    backgroundColor: 'transparent',
                    border: `1px solid ${theme.border}`,
                    borderRadius: '6px',
                    color: theme.textSecondary,
                    fontSize: '12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px'
                  }}
                >
                  <FileText size={14} />
                  Quote
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lead Modal */}
      {showModal && (
        <>
          <div onClick={closeModal} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 50 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}`, width: '100%', maxWidth: '600px', maxHeight: '90vh', overflow: 'auto', zIndex: 51 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px', borderBottom: `1px solid ${theme.border}`, position: 'sticky', top: 0, backgroundColor: theme.bgCard }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>{editingLead ? 'Edit Lead' : 'Add Lead'}</h2>
              <button onClick={closeModal} style={{ padding: '4px', backgroundColor: 'transparent', border: 'none', color: theme.textMuted, cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
              {error && <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: '8px', color: '#b91c1c', fontSize: '14px' }}>{error}</div>}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '16px' }}>
                <div><label style={labelStyle}>Customer Name *</label><input type="text" name="customer_name" value={formData.customer_name} onChange={handleChange} required style={inputStyle} /></div>
                <div><label style={labelStyle}>Business Name</label><input type="text" name="business_name" value={formData.business_name} onChange={handleChange} style={inputStyle} /></div>
                <div><label style={labelStyle}>Email</label><input type="email" name="email" value={formData.email} onChange={handleChange} style={inputStyle} /></div>
                <div><label style={labelStyle}>Phone</label><input type="tel" name="phone" value={formData.phone} onChange={handleChange} style={inputStyle} /></div>
              </div>

              <div style={{ marginBottom: '16px' }}><label style={labelStyle}>Address</label><textarea name="address" value={formData.address} onChange={handleChange} rows={2} style={{ ...inputStyle, resize: 'vertical' }} /></div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '16px' }}>
                <div><label style={labelStyle}>Service Type</label><select name="service_type" value={formData.service_type} onChange={handleChange} style={inputStyle}><option value="">-- Select --</option>{serviceTypes.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                <div>
                  <label style={labelStyle}>Lead Source</label>
                  <select name="lead_source" value={formData.lead_source} onChange={handleChange} style={inputStyle}>
                    <option value="">-- Select --</option>
                    {leadSources.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={labelStyle}>Lead Owner</label>
                  <select
                    name="lead_owner_id"
                    value={formData.lead_owner_id}
                    onChange={handleChange}
                    style={inputStyle}
                  >
                    <option value="">-- Select --</option>
                    {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Status</label>
                  <select name="status" value={formData.status} onChange={handleChange} style={inputStyle}>
                    {LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '24px' }}><label style={labelStyle}>Notes</label><textarea name="notes" value={formData.notes} onChange={handleChange} rows={3} style={{ ...inputStyle, resize: 'vertical' }} /></div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button type="button" onClick={closeModal} style={{ flex: 1, padding: '12px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" disabled={loading} style={{ flex: 1, padding: '12px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', fontSize: '14px', fontWeight: '500', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>{loading ? 'Saving...' : (editingLead ? 'Update' : 'Add Lead')}</button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* Assign to Setter Modal */}
      {showAssignModal && selectedLead && (
        <>
          <div onClick={() => setShowAssignModal(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 50 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}`, width: '100%', maxWidth: '400px', zIndex: 51 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px', borderBottom: `1px solid ${theme.border}` }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>Assign to Setter</h2>
              <button onClick={() => setShowAssignModal(false)} style={{ padding: '4px', backgroundColor: 'transparent', border: 'none', color: theme.textMuted, cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <div style={{ padding: '20px' }}>
              <p style={{ fontSize: '14px', color: theme.textSecondary, marginBottom: '16px' }}>
                Assign <strong>{selectedLead.customer_name}</strong> to a setter for scheduling
              </p>
              <div style={{ marginBottom: '24px' }}>
                <label style={labelStyle}>Select Setter</label>
                <select
                  value={assignSetterId}
                  onChange={(e) => setAssignSetterId(e.target.value)}
                  style={inputStyle}
                >
                  <option value="">-- Select Setter --</option>
                  {setterEmployees.map(e => (
                    <option key={e.id} value={e.id}>{e.name} {e.role ? `(${e.role})` : ''}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  style={{ flex: 1, padding: '12px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, fontSize: '14px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleAssignToSetter}
                  disabled={!assignSetterId || loading}
                  style={{ flex: 1, padding: '12px', backgroundColor: '#7c3aed', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '14px', fontWeight: '500', cursor: !assignSetterId || loading ? 'not-allowed' : 'pointer', opacity: !assignSetterId || loading ? 0.6 : 1 }}
                >
                  {loading ? 'Assigning...' : 'Assign'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Appointment Modal */}
      {showAppointmentModal && (
        <>
          <div onClick={() => setShowAppointmentModal(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 50 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}`, width: '100%', maxWidth: '480px', zIndex: 51 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px', borderBottom: `1px solid ${theme.border}` }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>Schedule Appointment</h2>
              <button onClick={() => setShowAppointmentModal(false)} style={{ padding: '4px', backgroundColor: 'transparent', border: 'none', color: theme.textMuted, cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleCreateAppointment} style={{ padding: '20px' }}>
              <div style={{ marginBottom: '16px' }}><label style={labelStyle}>Title</label><input type="text" value={appointmentData.title} onChange={(e) => setAppointmentData({ ...appointmentData, title: e.target.value })} required style={inputStyle} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div><label style={labelStyle}>Start Time *</label><input type="datetime-local" value={appointmentData.start_time} onChange={(e) => setAppointmentData({ ...appointmentData, start_time: e.target.value })} required style={inputStyle} /></div>
                <div><label style={labelStyle}>End Time</label><input type="datetime-local" value={appointmentData.end_time} onChange={(e) => setAppointmentData({ ...appointmentData, end_time: e.target.value })} style={inputStyle} /></div>
              </div>
              <div style={{ marginBottom: '16px' }}><label style={labelStyle}>Location</label><input type="text" value={appointmentData.location} onChange={(e) => setAppointmentData({ ...appointmentData, location: e.target.value })} style={inputStyle} /></div>
              <div style={{ marginBottom: '24px' }}><label style={labelStyle}>Notes</label><textarea value={appointmentData.notes} onChange={(e) => setAppointmentData({ ...appointmentData, notes: e.target.value })} rows={2} style={{ ...inputStyle, resize: 'vertical' }} /></div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button type="button" onClick={() => setShowAppointmentModal(false)} style={{ flex: 1, padding: '12px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, fontSize: '14px', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" disabled={loading} style={{ flex: 1, padding: '12px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>Schedule</button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* Import CSV Modal */}
      {showImportModal && (
        <>
          <div onClick={() => { setShowImportModal(false); setImportData(''); setImportError(null); setImportSuccess(null); }} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 50 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}`, width: '100%', maxWidth: '600px', maxHeight: '90vh', overflow: 'auto', zIndex: 51 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px', borderBottom: `1px solid ${theme.border}`, position: 'sticky', top: 0, backgroundColor: theme.bgCard }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>Import Leads from CSV</h2>
              <button onClick={() => { setShowImportModal(false); setImportData(''); setImportError(null); setImportSuccess(null); }} style={{ padding: '4px', backgroundColor: 'transparent', border: 'none', color: theme.textMuted, cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <div style={{ padding: '20px' }}>
              {importError && (
                <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.2)', borderRadius: '8px', color: '#b91c1c', fontSize: '14px' }}>{importError}</div>
              )}
              {importSuccess && (
                <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '8px', color: '#16a34a', fontSize: '14px' }}>{importSuccess}</div>
              )}

              <div style={{ marginBottom: '16px' }}>
                <p style={{ fontSize: '14px', color: theme.textSecondary, marginBottom: '12px' }}>
                  Paste your CSV data below. The first row should be headers. Required column: <strong>customer_name</strong> (or "name")
                </p>
                <button onClick={downloadTemplate} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', backgroundColor: theme.accentBg, border: 'none', borderRadius: '6px', color: theme.accent, fontSize: '13px', cursor: 'pointer', marginBottom: '12px' }}>
                  <Download size={14} />
                  Download Template
                </button>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>CSV Data</label>
                <textarea
                  value={importData}
                  onChange={(e) => setImportData(e.target.value)}
                  placeholder={`customer_name,business_name,email,phone,address,lead_source,service_type,notes\nJohn Doe,Acme Corp,john@acme.com,555-1234,123 Main St,website,Commercial,Notes here`}
                  rows={10}
                  style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '12px', resize: 'vertical' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button type="button" onClick={() => { setShowImportModal(false); setImportData(''); setImportError(null); setImportSuccess(null); }} style={{ flex: 1, padding: '12px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, fontSize: '14px', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button onClick={handleImport} disabled={loading || !importData.trim()} style={{ flex: 1, padding: '12px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', fontSize: '14px', fontWeight: '500', cursor: loading || !importData.trim() ? 'not-allowed' : 'pointer', opacity: loading || !importData.trim() ? 0.6 : 1 }}>
                  {loading ? 'Importing...' : 'Import Leads'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
