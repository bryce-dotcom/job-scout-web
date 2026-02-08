import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import {
  Plus, Search, Briefcase, X, Calendar, Clock, MapPin,
  Play, CheckCircle, FileText, ChevronRight, User
} from 'lucide-react'
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
  'Scheduled': { bg: 'rgba(90,99,73,0.12)', text: '#5a6349' },
  'In Progress': { bg: 'rgba(194,139,56,0.12)', text: '#c28b38' },
  'Completed': { bg: 'rgba(74,124,89,0.12)', text: '#4a7c59' },
  'Cancelled': { bg: 'rgba(139,90,90,0.12)', text: '#8b5a5a' },
  'On Hold': { bg: 'rgba(125,138,127,0.12)', text: '#7d8a7f' }
}

const invoiceStatusColors = {
  'Not Invoiced': { bg: 'rgba(125,138,127,0.12)', text: '#7d8a7f' },
  'Invoiced': { bg: 'rgba(90,99,73,0.12)', text: '#5a6349' },
  'Paid': { bg: 'rgba(74,124,89,0.12)', text: '#4a7c59' }
}

const emptyJob = {
  job_title: '',
  job_address: '',
  gps_location: '',
  customer_id: '',
  salesperson_id: '',
  quote_id: '',
  status: 'Scheduled',
  assigned_team: '',
  business_unit: '',
  start_date: '',
  end_date: '',
  allotted_time_hours: '',
  details: '',
  notes: '',
  recurrence: 'None',
  utility_incentive: '',
  discount: '',
  discount_description: ''
}

export default function Jobs() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const jobs = useStore((state) => state.jobs)
  const customers = useStore((state) => state.customers)
  const employees = useStore((state) => state.employees)
  const quotes = useStore((state) => state.quotes)
  const businessUnits = useStore((state) => state.businessUnits)
  const fetchJobs = useStore((state) => state.fetchJobs)

  const [showModal, setShowModal] = useState(false)
  const [editingJob, setEditingJob] = useState(null)
  const [formData, setFormData] = useState(emptyJob)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [teamFilter, setTeamFilter] = useState('all')

  // Theme with fallback
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchJobs()
  }, [companyId, navigate, fetchJobs])

  // Get unique teams for filter
  const teams = [...new Set(jobs.map(j => j.assigned_team).filter(Boolean))]

  const filteredJobs = jobs.filter(job => {
    const matchesSearch = searchTerm === '' ||
      job.job_title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.job_address?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.job_id?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesStatus = statusFilter === 'all' || job.status === statusFilter
    const matchesTeam = teamFilter === 'all' || job.assigned_team === teamFilter

    return matchesSearch && matchesStatus && matchesTeam
  })

  const openAddModal = () => {
    setEditingJob(null)
    setFormData(emptyJob)
    setError(null)
    setShowModal(true)
  }

  const openEditModal = (job) => {
    setEditingJob(job)
    setFormData({
      job_title: job.job_title || '',
      job_address: job.job_address || '',
      gps_location: job.gps_location || '',
      customer_id: job.customer_id || '',
      salesperson_id: job.salesperson_id || '',
      quote_id: job.quote_id || '',
      status: job.status || 'Scheduled',
      assigned_team: job.assigned_team || '',
      business_unit: job.business_unit || '',
      start_date: job.start_date ? job.start_date.slice(0, 16) : '',
      end_date: job.end_date ? job.end_date.slice(0, 16) : '',
      allotted_time_hours: job.allotted_time_hours || '',
      details: job.details || '',
      notes: job.notes || '',
      recurrence: job.recurrence || 'None',
      utility_incentive: job.utility_incentive || '',
      discount: job.discount || '',
      discount_description: job.discount_description || ''
    })
    setError(null)
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingJob(null)
    setError(null)
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))

    // Auto-fill address from customer
    if (name === 'customer_id' && value) {
      const customer = customers.find(c => c.id === parseInt(value))
      if (customer?.address) {
        setFormData(prev => ({ ...prev, job_address: customer.address }))
      }
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const jobNumber = editingJob ? editingJob.job_id : `JOB-${Date.now().toString(36).toUpperCase()}`

    const payload = {
      company_id: companyId,
      job_id: jobNumber,
      job_title: formData.job_title,
      job_address: formData.job_address || null,
      gps_location: formData.gps_location || null,
      customer_id: formData.customer_id || null,
      salesperson_id: formData.salesperson_id || null,
      quote_id: formData.quote_id || null,
      status: formData.status,
      assigned_team: formData.assigned_team || null,
      business_unit: formData.business_unit || null,
      start_date: formData.start_date || null,
      end_date: formData.end_date || null,
      allotted_time_hours: formData.allotted_time_hours || null,
      details: formData.details || null,
      notes: formData.notes || null,
      recurrence: formData.recurrence || 'None',
      utility_incentive: formData.utility_incentive || null,
      discount: formData.discount || null,
      discount_description: formData.discount_description || null,
      updated_at: new Date().toISOString()
    }

    let result
    if (editingJob) {
      result = await supabase
        .from('jobs')
        .update(payload)
        .eq('id', editingJob.id)
    } else {
      result = await supabase
        .from('jobs')
        .insert([payload])
    }

    if (result.error) {
      setError(result.error.message)
      setLoading(false)
      return
    }

    await fetchJobs()
    closeModal()
    setLoading(false)
  }

  const startJob = async (job) => {
    await supabase
      .from('jobs')
      .update({
        status: 'In Progress',
        start_date: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', job.id)
    await fetchJobs()
  }

  const completeJob = async (job) => {
    await supabase
      .from('jobs')
      .update({
        status: 'Completed',
        end_date: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', job.id)
    await fetchJobs()
  }

  const openMap = (address) => {
    if (address) {
      window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`, '_blank')
    }
  }

  const formatDate = (date) => {
    if (!date) return '-'
    return new Date(date).toLocaleDateString()
  }

  // Stats
  const scheduledCount = jobs.filter(j => j.status === 'Scheduled').length
  const inProgressCount = jobs.filter(j => j.status === 'In Progress').length
  const completedCount = jobs.filter(j => j.status === 'Completed').length

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
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        marginBottom: '24px',
        flexWrap: 'wrap'
      }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>
          Jobs
        </h1>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => navigate('/jobs/calendar')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 16px',
              backgroundColor: theme.bgCard,
              color: theme.text,
              border: `1px solid ${theme.border}`,
              borderRadius: '8px',
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            <Calendar size={18} />
            Calendar
          </button>
          <button
            onClick={openAddModal}
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
            Add Job
          </button>
        </div>
      </div>

      {/* Stats */}
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
          <p style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '4px' }}>Scheduled</p>
          <p style={{ fontSize: '24px', fontWeight: '600', color: theme.text }}>{scheduledCount}</p>
        </div>
        <div style={{
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          padding: '16px',
          textAlign: 'center'
        }}>
          <p style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '4px' }}>In Progress</p>
          <p style={{ fontSize: '24px', fontWeight: '600', color: '#c28b38' }}>{inProgressCount}</p>
        </div>
        <div style={{
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          padding: '16px',
          textAlign: 'center'
        }}>
          <p style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '4px' }}>Completed</p>
          <p style={{ fontSize: '24px', fontWeight: '600', color: '#4a7c59' }}>{completedCount}</p>
        </div>
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
            placeholder="Search jobs..."
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
          <option value="Scheduled">Scheduled</option>
          <option value="In Progress">In Progress</option>
          <option value="Completed">Completed</option>
          <option value="On Hold">On Hold</option>
          <option value="Cancelled">Cancelled</option>
        </select>
        {teams.length > 0 && (
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            style={{ ...inputStyle, width: 'auto', minWidth: '140px' }}
          >
            <option value="all">All Teams</option>
            {teams.map(team => (
              <option key={team} value={team}>{team}</option>
            ))}
          </select>
        )}
      </div>

      {/* Jobs List */}
      {filteredJobs.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '48px 24px',
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`
        }}>
          <Briefcase size={48} style={{ color: theme.textMuted, marginBottom: '16px', opacity: 0.5 }} />
          <p style={{ color: theme.textSecondary, fontSize: '15px' }}>
            {searchTerm || statusFilter !== 'all' ? 'No jobs match your search.' : 'No jobs yet.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredJobs.map((job) => {
            const statusStyle = statusColors[job.status] || statusColors['Scheduled']
            const invoiceStyle = invoiceStatusColors[job.invoice_status] || invoiceStatusColors['Not Invoiced']

            return (
              <EntityCard
                key={job.id}
                name={job.customer?.name}
                businessName={job.customer?.business_name}
                onClick={() => navigate(`/jobs/${job.id}`)}
                style={{ padding: '16px 20px' }}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                  {/* Main Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                      <span style={{ fontWeight: '600', color: theme.accent, fontSize: '13px' }}>
                        {job.job_id}
                      </span>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: '500',
                        backgroundColor: statusStyle.bg,
                        color: statusStyle.text
                      }}>
                        {job.status}
                      </span>
                      {job.invoice_status && (
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: '500',
                          backgroundColor: invoiceStyle.bg,
                          color: invoiceStyle.text
                        }}>
                          {job.invoice_status}
                        </span>
                      )}
                    </div>
                    <p style={{
                      fontWeight: '500',
                      color: theme.text,
                      fontSize: '15px',
                      marginBottom: '4px'
                    }}>
                      {job.job_title || 'Untitled Job'}
                    </p>
                    <p style={{ fontSize: '14px', color: theme.textSecondary }}>
                      {job.customer?.name || 'No customer'}
                    </p>
                    {job.job_address && (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        marginTop: '6px',
                        color: theme.textMuted,
                        fontSize: '13px'
                      }}>
                        <MapPin size={14} />
                        <span>{job.job_address}</span>
                      </div>
                    )}
                  </div>

                  {/* Date & Time */}
                  <div style={{ textAlign: 'right', minWidth: '120px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px', color: theme.textSecondary, fontSize: '13px' }}>
                      <Calendar size={14} />
                      <span>{formatDate(job.start_date)}</span>
                    </div>
                    {job.allotted_time_hours && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px', marginTop: '4px', color: theme.textMuted, fontSize: '12px' }}>
                        <Clock size={12} />
                        <span>{job.allotted_time_hours}h allotted</span>
                      </div>
                    )}
                    {job.assigned_team && (
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px', marginTop: '4px', color: theme.textMuted, fontSize: '12px' }}>
                        <User size={12} />
                        <span>{job.assigned_team}</span>
                      </div>
                    )}
                  </div>

                  {/* Quick Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {job.status === 'Scheduled' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); startJob(job); }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '6px 10px',
                          backgroundColor: '#c28b38',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '12px',
                          cursor: 'pointer'
                        }}
                      >
                        <Play size={14} />
                        Start
                      </button>
                    )}
                    {job.status === 'In Progress' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); completeJob(job); }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '6px 10px',
                          backgroundColor: '#4a7c59',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '12px',
                          cursor: 'pointer'
                        }}
                      >
                        <CheckCircle size={14} />
                        Complete
                      </button>
                    )}
                    {job.job_address && (
                      <button
                        onClick={(e) => { e.stopPropagation(); openMap(job.job_address); }}
                        style={{
                          padding: '6px',
                          backgroundColor: theme.accentBg,
                          color: theme.accent,
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer'
                        }}
                      >
                        <MapPin size={16} />
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

      {/* Add/Edit Modal */}
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
            maxWidth: '600px',
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
                {editingJob ? 'Edit Job' : 'Add Job'}
              </h2>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', padding: '8px', cursor: 'pointer', color: theme.textMuted }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
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
                  <label style={labelStyle}>Job Title *</label>
                  <input type="text" name="job_title" value={formData.job_title} onChange={handleChange} required style={inputStyle} />
                </div>

                <div>
                  <label style={labelStyle}>Job Address</label>
                  <input type="text" name="job_address" value={formData.job_address} onChange={handleChange} style={inputStyle} placeholder="123 Main St, City, State" />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Customer</label>
                    <select name="customer_id" value={formData.customer_id} onChange={handleChange} style={inputStyle}>
                      <option value="">-- Select --</option>
                      {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Salesperson</label>
                    <select name="salesperson_id" value={formData.salesperson_id} onChange={handleChange} style={inputStyle}>
                      <option value="">-- Select --</option>
                      {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Status</label>
                    <select name="status" value={formData.status} onChange={handleChange} style={inputStyle}>
                      <option value="Scheduled">Scheduled</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Completed">Completed</option>
                      <option value="On Hold">On Hold</option>
                      <option value="Cancelled">Cancelled</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Quote (optional)</label>
                    <select name="quote_id" value={formData.quote_id} onChange={handleChange} style={inputStyle}>
                      <option value="">-- None --</option>
                      {quotes.filter(q => q.status === 'Approved').map(q => (
                        <option key={q.id} value={q.id}>{q.quote_id} - {q.customer?.name || q.lead?.customer_name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Assigned Team</label>
                    <input type="text" name="assigned_team" value={formData.assigned_team} onChange={handleChange} style={inputStyle} placeholder="Team A" />
                  </div>
                  <div>
                    <label style={labelStyle}>Business Unit</label>
                    <select name="business_unit" value={formData.business_unit} onChange={handleChange} style={inputStyle}>
                      <option value="">-- Select --</option>
                      {businessUnits.map(bu => <option key={bu} value={bu}>{bu}</option>)}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Start Date/Time</label>
                    <input type="datetime-local" name="start_date" value={formData.start_date} onChange={handleChange} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>End Date/Time</label>
                    <input type="datetime-local" name="end_date" value={formData.end_date} onChange={handleChange} style={inputStyle} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Allotted Hours</label>
                    <input type="number" name="allotted_time_hours" value={formData.allotted_time_hours} onChange={handleChange} step="0.25" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Recurrence</label>
                    <select name="recurrence" value={formData.recurrence} onChange={handleChange} style={inputStyle}>
                      <option value="None">None</option>
                      <option value="Daily">Daily</option>
                      <option value="Weekly">Weekly</option>
                      <option value="Monthly">Monthly</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Utility Incentive</label>
                    <input type="number" name="utility_incentive" value={formData.utility_incentive} onChange={handleChange} step="0.01" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Discount</label>
                    <input type="number" name="discount" value={formData.discount} onChange={handleChange} step="0.01" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Discount Desc</label>
                    <input type="text" name="discount_description" value={formData.discount_description} onChange={handleChange} style={inputStyle} />
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Details</label>
                  <textarea name="details" value={formData.details} onChange={handleChange} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                </div>

                <div>
                  <label style={labelStyle}>Notes</label>
                  <textarea name="notes" value={formData.notes} onChange={handleChange} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button type="button" onClick={closeModal} style={{
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
                  {loading ? 'Saving...' : (editingJob ? 'Update' : 'Add Job')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
