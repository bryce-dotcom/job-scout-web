import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { APPOINTMENT_STATUS } from '../lib/schema'
import { Plus, Pencil, Trash2, X, Calendar, Search, Clock, MapPin, User, Filter } from 'lucide-react'

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
  'Scheduled': { bg: 'rgba(90,155,213,0.12)', color: '#5a9bd5' },
  'Confirmed': { bg: 'rgba(74,124,89,0.12)', color: '#4a7c59' },
  'Completed': { bg: 'rgba(90,99,73,0.12)', color: '#5a6349' },
  'Cancelled': { bg: 'rgba(194,90,90,0.12)', color: '#c25a5a' },
  'No Show': { bg: 'rgba(212,148,10,0.12)', color: '#d4940a' }
}

const emptyAppointment = {
  title: '',
  lead_id: '',
  customer_id: '',
  employee_id: '',
  start_time: '',
  end_time: '',
  location: '',
  status: 'Scheduled',
  appointment_type: '',
  notes: ''
}

export default function Appointments() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const user = useStore((state) => state.user)
  const appointments = useStore((state) => state.appointments)
  const leads = useStore((state) => state.leads)
  const customers = useStore((state) => state.customers)
  const employees = useStore((state) => state.employees)
  const fetchAppointments = useStore((state) => state.fetchAppointments)

  const [showModal, setShowModal] = useState(false)
  const [editingAppointment, setEditingAppointment] = useState(null)
  const [formData, setFormData] = useState(emptyAppointment)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [setterFilter, setSetterFilter] = useState('all') // 'all', 'my', or employee id

  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchAppointments()
  }, [companyId, navigate, fetchAppointments])

  // Check if user is admin
  const isAdmin = user?.user_role === 'Admin' || user?.user_role === 'Owner' || user?.role === 'Admin' || user?.role === 'Owner'

  const filteredAppointments = appointments.filter(apt => {
    const matchesSearch = searchTerm === '' ||
      apt.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      apt.lead?.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      apt.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === 'all' || apt.status === statusFilter

    // Setter filter - 'my' shows appointments the current user set
    let matchesSetter = true
    if (setterFilter === 'my') {
      matchesSetter = apt.setter_id === user?.id
    } else if (setterFilter !== 'all') {
      matchesSetter = apt.setter_id === parseInt(setterFilter)
    }

    return matchesSearch && matchesStatus && matchesSetter
  })

  const openAddModal = () => {
    setEditingAppointment(null)
    setFormData(emptyAppointment)
    setError(null)
    setShowModal(true)
  }

  const openEditModal = (apt) => {
    setEditingAppointment(apt)
    setFormData({
      title: apt.title || '',
      lead_id: apt.lead_id || '',
      customer_id: apt.customer_id || '',
      employee_id: apt.employee_id || '',
      start_time: apt.start_time ? apt.start_time.slice(0, 16) : '',
      end_time: apt.end_time ? apt.end_time.slice(0, 16) : '',
      location: apt.location || '',
      status: apt.status || 'Scheduled',
      appointment_type: apt.appointment_type || '',
      notes: apt.notes || ''
    })
    setError(null)
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingAppointment(null)
    setFormData(emptyAppointment)
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
      title: formData.title,
      lead_id: formData.lead_id || null,
      customer_id: formData.customer_id || null,
      employee_id: formData.employee_id || null,
      start_time: formData.start_time || null,
      end_time: formData.end_time || null,
      location: formData.location || null,
      status: formData.status,
      appointment_type: formData.appointment_type || null,
      notes: formData.notes || null,
      updated_at: new Date().toISOString()
    }

    let result
    if (editingAppointment) {
      result = await supabase.from('appointments').update(payload).eq('id', editingAppointment.id)
    } else {
      result = await supabase.from('appointments').insert([payload])
    }

    if (result.error) {
      setError(result.error.message)
      setLoading(false)
      return
    }

    await fetchAppointments()
    closeModal()
    setLoading(false)
  }

  const handleDelete = async (apt) => {
    if (!confirm(`Delete appointment "${apt.title}"?`)) return
    await supabase.from('appointments').delete().eq('id', apt.id)
    await fetchAppointments()
  }

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit'
    })
  }

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
          Appointments
        </h1>
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
          Add Appointment
        </button>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '24px',
        flexWrap: 'wrap',
        alignItems: 'center'
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
            placeholder="Search appointments..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ ...inputStyle, paddingLeft: '40px' }}
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ ...inputStyle, width: 'auto', minWidth: '150px' }}
        >
          <option value="all">All Statuses</option>
          {APPOINTMENT_STATUS.map(status => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>

        {/* Setter Filter - Show "My Appointments" option for all users */}
        <select
          value={setterFilter}
          onChange={(e) => setSetterFilter(e.target.value)}
          style={{ ...inputStyle, width: 'auto', minWidth: '160px' }}
        >
          <option value="all">All Appointments</option>
          <option value="my">My Appointments</option>
          {isAdmin && employees.filter(e => e.role === 'Setter' || e.role === 'Sales').map(emp => (
            <option key={emp.id} value={emp.id}>{emp.name}'s Appointments</option>
          ))}
        </select>
      </div>

      {/* Appointments Grid */}
      {filteredAppointments.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '48px 24px',
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`
        }}>
          <Calendar size={48} style={{ color: theme.textMuted, marginBottom: '16px', opacity: 0.5 }} />
          <p style={{ color: theme.textSecondary, fontSize: '15px' }}>
            No appointments found. Schedule your first appointment.
          </p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: '16px'
        }}>
          {filteredAppointments.map((apt) => {
            const statusStyle = statusColors[apt.status] || statusColors['Scheduled']
            return (
              <div
                key={apt.id}
                style={{
                  backgroundColor: theme.bgCard,
                  borderRadius: '12px',
                  border: `1px solid ${theme.border}`,
                  padding: '20px',
                  transition: 'box-shadow 0.2s'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '600', color: theme.text }}>
                    {apt.title || 'Untitled Appointment'}
                  </h3>
                  <span style={{
                    padding: '4px 10px',
                    backgroundColor: statusStyle.bg,
                    color: statusStyle.color,
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: '500'
                  }}>
                    {apt.status}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: theme.textSecondary }}>
                    <Clock size={16} />
                    {formatDateTime(apt.start_time)}
                  </div>
                  {apt.location && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: theme.textSecondary }}>
                      <MapPin size={16} />
                      {apt.location}
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: theme.textSecondary }}>
                    <User size={16} />
                    {apt.lead?.customer_name || apt.customer?.name || 'No contact'}
                  </div>
                </div>

                {(apt.employee || apt.setter) && (
                  <div style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '12px' }}>
                    {apt.employee && <div>Assigned to: {apt.employee.name}</div>}
                    {apt.setter && <div>Set by: {apt.setter.name}</div>}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '8px', borderTop: `1px solid ${theme.border}`, paddingTop: '12px' }}>
                  <button
                    onClick={() => openEditModal(apt)}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      padding: '8px',
                      backgroundColor: theme.accentBg,
                      border: 'none',
                      borderRadius: '6px',
                      color: theme.accent,
                      fontSize: '13px',
                      cursor: 'pointer'
                    }}
                  >
                    <Pencil size={14} /> Edit
                  </button>
                  <button
                    onClick={() => handleDelete(apt)}
                    style={{
                      padding: '8px 12px',
                      backgroundColor: 'rgba(194,90,90,0.1)',
                      border: 'none',
                      borderRadius: '6px',
                      color: '#c25a5a',
                      cursor: 'pointer'
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
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
                {editingAppointment ? 'Edit Appointment' : 'New Appointment'}
              </h2>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', padding: '8px', cursor: 'pointer', color: theme.textMuted }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
              {error && (
                <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '14px' }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>Title *</label>
                  <input type="text" name="title" value={formData.title} onChange={handleChange} required style={inputStyle} placeholder="Appointment title" />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Start Time *</label>
                    <input type="datetime-local" name="start_time" value={formData.start_time} onChange={handleChange} required style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>End Time</label>
                    <input type="datetime-local" name="end_time" value={formData.end_time} onChange={handleChange} style={inputStyle} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Lead</label>
                    <select name="lead_id" value={formData.lead_id} onChange={handleChange} style={inputStyle}>
                      <option value="">Select lead</option>
                      {leads.map(lead => (
                        <option key={lead.id} value={lead.id}>{lead.customer_name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Customer</label>
                    <select name="customer_id" value={formData.customer_id} onChange={handleChange} style={inputStyle}>
                      <option value="">Select customer</option>
                      {customers.map(cust => (
                        <option key={cust.id} value={cust.id}>{cust.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Assigned To</label>
                    <select name="employee_id" value={formData.employee_id} onChange={handleChange} style={inputStyle}>
                      <option value="">Select employee</option>
                      {employees.map(emp => (
                        <option key={emp.id} value={emp.id}>{emp.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Status</label>
                    <select name="status" value={formData.status} onChange={handleChange} style={inputStyle}>
                      {APPOINTMENT_STATUS.map(status => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Location</label>
                  <input type="text" name="location" value={formData.location} onChange={handleChange} style={inputStyle} placeholder="Address or meeting location" />
                </div>

                <div>
                  <label style={labelStyle}>Type</label>
                  <select name="appointment_type" value={formData.appointment_type} onChange={handleChange} style={inputStyle}>
                    <option value="">Select type</option>
                    <option value="Sales Call">Sales Call</option>
                    <option value="Estimate">Estimate</option>
                    <option value="Site Visit">Site Visit</option>
                    <option value="Follow-up">Follow-up</option>
                    <option value="Consultation">Consultation</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Notes</label>
                  <textarea name="notes" value={formData.notes} onChange={handleChange} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
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
                  {loading ? 'Saving...' : (editingAppointment ? 'Update' : 'Create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
