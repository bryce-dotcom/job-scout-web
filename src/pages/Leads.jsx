import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { Plus, Pencil, X, UserPlus, Phone, Mail, Calendar, FileText, UserCheck, Search } from 'lucide-react'

const LEAD_SOURCES = ['Website', 'Referral', 'Cold Call', 'Marketing', 'Google Ads', 'Facebook', 'Door Knock', 'Trade Show', 'Other']
const LEAD_STATUSES = ['New', 'Qualified', 'Appointment Scheduled', 'Waiting', 'Not Qualified', 'Converted']
const SERVICE_TYPES = ['Residential', 'Commercial', 'Industrial', 'Government', 'Other']

const emptyLead = {
  customer_name: '',
  business_name: '',
  email: '',
  phone: '',
  address: '',
  service_type: '',
  lead_source: '',
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
  const leads = useStore((state) => state.leads)
  const employees = useStore((state) => state.employees)
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
  const [editingLead, setEditingLead] = useState(null)
  const [selectedLead, setSelectedLead] = useState(null)
  const [formData, setFormData] = useState(emptyLead)
  const [appointmentData, setAppointmentData] = useState({ title: '', start_time: '', end_time: '', location: '', notes: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchLeads()
  }, [companyId, navigate, fetchLeads])

  const filteredLeads = leads.filter(lead => {
    const matchesSearch = searchTerm === '' ||
      lead.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.business_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      lead.email?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === 'all' || lead.status === statusFilter
    const matchesSource = sourceFilter === 'all' || lead.lead_source === sourceFilter
    return matchesSearch && matchesStatus && matchesSource
  })

  const getStatusStyle = (status) => {
    const styles = {
      'New': { backgroundColor: 'rgba(59,130,246,0.1)', color: '#2563eb' },
      'Qualified': { backgroundColor: 'rgba(34,197,94,0.1)', color: '#16a34a' },
      'Appointment Scheduled': { backgroundColor: 'rgba(249,115,22,0.1)', color: '#ea580c' },
      'Waiting': { backgroundColor: 'rgba(156,163,175,0.1)', color: '#6b7280' },
      'Not Qualified': { backgroundColor: 'rgba(239,68,68,0.1)', color: '#dc2626' },
      'Converted': { backgroundColor: 'rgba(147,51,234,0.1)', color: '#9333ea' }
    }
    return styles[status] || { backgroundColor: theme.bg, color: theme.textMuted }
  }

  const openAddModal = () => {
    setEditingLead(null)
    setFormData(emptyLead)
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
      ...formData,
      company_id: companyId,
      salesperson_id: formData.salesperson_id || null,
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

    const { error } = await supabase.from('appointments').insert([{
      company_id: companyId,
      lead_id: selectedLead.id,
      title: appointmentData.title,
      start_time: appointmentData.start_time,
      end_time: appointmentData.end_time,
      location: appointmentData.location,
      notes: appointmentData.notes,
      status: 'Scheduled'
    }])

    if (!error) {
      await supabase.from('leads').update({
        status: 'Appointment Scheduled',
        appointment_time: appointmentData.start_time,
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
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>Leads</h1>
        <button onClick={openAddModal} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>
          <Plus size={20} />
          Add Lead
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <Search size={20} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: theme.textMuted }} />
          <input type="text" placeholder="Search leads..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ ...inputStyle, paddingLeft: '40px', backgroundColor: theme.bgCard }} />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: '160px', backgroundColor: theme.bgCard }}>
          <option value="all">All Status</option>
          {LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: '140px', backgroundColor: theme.bgCard }}>
          <option value="all">All Sources</option>
          {LEAD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Leads List */}
      {filteredLeads.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px', backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}` }}>
          <UserPlus size={48} style={{ color: theme.textMuted, marginBottom: '16px' }} />
          <p style={{ color: theme.textSecondary }}>No leads found.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '16px' }}>
          {filteredLeads.map((lead) => (
            <div key={lead.id} style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '4px' }}>{lead.customer_name}</h3>
                  {lead.business_name && <p style={{ fontSize: '14px', color: theme.textSecondary }}>{lead.business_name}</p>}
                </div>
                <button onClick={() => openEditModal(lead)} style={{ padding: '6px', backgroundColor: 'transparent', border: 'none', color: theme.textMuted, cursor: 'pointer', borderRadius: '6px' }}>
                  <Pencil size={16} />
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '12px' }}>
                {lead.phone && <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: theme.textSecondary }}><Phone size={14} />{lead.phone}</div>}
                {lead.email && <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: theme.textSecondary }}><Mail size={14} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.email}</span></div>}
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
                {lead.service_type && <span style={{ fontSize: '11px', padding: '3px 8px', backgroundColor: theme.bg, color: theme.textMuted, borderRadius: '4px' }}>{lead.service_type}</span>}
                {lead.lead_source && <span style={{ fontSize: '11px', padding: '3px 8px', backgroundColor: theme.bg, color: theme.textMuted, borderRadius: '4px' }}>{lead.lead_source}</span>}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '12px', borderTop: `1px solid ${theme.border}` }}>
                <span style={{ fontSize: '12px', padding: '4px 10px', borderRadius: '20px', ...getStatusStyle(lead.status) }}>{lead.status}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {lead.salesperson && <span style={{ fontSize: '11px', color: theme.textMuted }}>{lead.salesperson.name}</span>}
                  <span style={{ fontSize: '11px', color: theme.textMuted }}>{formatDate(lead.created_at)}</span>
                </div>
              </div>

              {lead.status !== 'Converted' && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '12px', paddingTop: '12px', borderTop: `1px solid ${theme.border}` }}>
                  <button onClick={() => openAppointmentModal(lead)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', padding: '8px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.textSecondary, fontSize: '12px', cursor: 'pointer' }}>
                    <Calendar size={14} />Appt
                  </button>
                  <button onClick={() => handleCreateQuote(lead)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', padding: '8px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.textSecondary, fontSize: '12px', cursor: 'pointer' }}>
                    <FileText size={14} />Quote
                  </button>
                  <button onClick={() => handleConvertToCustomer(lead)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', padding: '8px', backgroundColor: theme.accentBg, border: 'none', borderRadius: '6px', color: theme.accent, fontSize: '12px', cursor: 'pointer', fontWeight: '500' }}>
                    <UserCheck size={14} />Convert
                  </button>
                </div>
              )}
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
                <div><label style={labelStyle}>Job Title</label><input type="text" name="job_title" value={formData.job_title} onChange={handleChange} style={inputStyle} /></div>
                <div><label style={labelStyle}>Business Unit</label><input type="text" name="business_unit" value={formData.business_unit} onChange={handleChange} style={inputStyle} /></div>
              </div>

              <div style={{ marginBottom: '16px' }}><label style={labelStyle}>Address</label><textarea name="address" value={formData.address} onChange={handleChange} rows={2} style={{ ...inputStyle, resize: 'vertical' }} /></div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '16px' }}>
                <div><label style={labelStyle}>Service Type</label><select name="service_type" value={formData.service_type} onChange={handleChange} style={inputStyle}><option value="">-- Select --</option>{SERVICE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                <div><label style={labelStyle}>Lead Source</label><select name="lead_source" value={formData.lead_source} onChange={handleChange} style={inputStyle}><option value="">-- Select --</option>{LEAD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                <div><label style={labelStyle}>Status</label><select name="status" value={formData.status} onChange={handleChange} style={inputStyle}>{LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                <div><label style={labelStyle}>Salesperson</label><select name="salesperson_id" value={formData.salesperson_id} onChange={handleChange} style={inputStyle}><option value="">-- Select --</option>{employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></div>
              </div>

              <div style={{ marginBottom: '16px' }}><label style={labelStyle}>Appointment Time</label><input type="datetime-local" name="appointment_time" value={formData.appointment_time} onChange={handleChange} style={inputStyle} /></div>
              <div style={{ marginBottom: '24px' }}><label style={labelStyle}>Notes</label><textarea name="notes" value={formData.notes} onChange={handleChange} rows={3} style={{ ...inputStyle, resize: 'vertical' }} /></div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button type="button" onClick={closeModal} style={{ flex: 1, padding: '12px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" disabled={loading} style={{ flex: 1, padding: '12px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', fontSize: '14px', fontWeight: '500', cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1 }}>{loading ? 'Saving...' : (editingLead ? 'Update' : 'Add Lead')}</button>
              </div>
            </form>
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
    </div>
  )
}
