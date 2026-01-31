import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { APPOINTMENT_STATUS } from '../lib/schema'
import AppointmentsCalendar from '../components/AppointmentsCalendar'
import { Plus, X, Trash2 } from 'lucide-react'

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
  const leads = useStore((state) => state.leads)
  const customers = useStore((state) => state.customers)
  const employees = useStore((state) => state.employees)
  const fetchAppointments = useStore((state) => state.fetchAppointments)

  const calendarRef = useRef(null)

  const [showModal, setShowModal] = useState(false)
  const [editingAppointment, setEditingAppointment] = useState(null)
  const [formData, setFormData] = useState(emptyAppointment)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [setterFilter, setSetterFilter] = useState('all')

  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  // Check if user is admin
  const isAdmin = user?.user_role === 'Admin' || user?.user_role === 'Owner' || user?.role === 'Admin' || user?.role === 'Owner'

  useEffect(() => {
    if (!companyId) {
      navigate('/')
    }
  }, [companyId, navigate])

  // Helper to format date for datetime-local input (uses local time, not UTC)
  const formatDateTimeLocal = (date) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day}T${hours}:${minutes}`
  }

  const openAddModal = (date = null, hour = null) => {
    setEditingAppointment(null)
    let defaultDate = ''
    if (date) {
      const d = new Date(date)
      if (hour) d.setHours(hour, 0, 0, 0)
      else d.setHours(9, 0, 0, 0)
      defaultDate = formatDateTimeLocal(d)
    }
    setFormData({ ...emptyAppointment, start_time: defaultDate })
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

    // Add setter_id for new appointments
    if (!editingAppointment) {
      payload.setter_id = user?.id || null
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

    // Refresh calendar and store
    calendarRef.current?.refresh()
    await fetchAppointments()
    closeModal()
    setLoading(false)
  }

  const handleDelete = async (apt) => {
    if (!confirm(`Delete appointment "${apt.title}"?`)) return
    await supabase.from('appointments').delete().eq('id', apt.id)
    calendarRef.current?.refresh()
    await fetchAppointments()
    closeModal()
  }

  // Get filter setter ID
  const filterSetterId = setterFilter === 'my'
    ? user?.id
    : (setterFilter !== 'all' ? parseInt(setterFilter) : null)

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
        marginBottom: '24px',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>
          Appointments
        </h1>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Setter Filter */}
          <select
            value={setterFilter}
            onChange={(e) => setSetterFilter(e.target.value)}
            style={{ ...inputStyle, width: 'auto', minWidth: '150px' }}
          >
            <option value="all">All Appointments</option>
            <option value="my">My Appointments</option>
            {isAdmin && employees.filter(e => e.role === 'Setter' || e.role === 'Sales').map(emp => (
              <option key={emp.id} value={emp.id}>{emp.name}'s</option>
            ))}
          </select>

          <button
            onClick={() => openAddModal()}
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
      </div>

      {/* Shared Calendar Component */}
      <AppointmentsCalendar
        ref={calendarRef}
        viewMode="month"
        filterSetterId={filterSetterId}
        onAppointmentClick={openEditModal}
        onSlotClick={(date, hour) => openAddModal(date, hour)}
        showHeader={true}
      />

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

                {/* Show setter info if editing */}
                {editingAppointment?.setter && (
                  <div style={{
                    padding: '12px',
                    backgroundColor: theme.accentBg,
                    borderRadius: '8px',
                    fontSize: '13px',
                    color: theme.textSecondary
                  }}>
                    Set by: {editingAppointment.setter.name}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                {editingAppointment && (
                  <button
                    type="button"
                    onClick={() => handleDelete(editingAppointment)}
                    style={{
                      padding: '10px 16px',
                      backgroundColor: 'rgba(194,90,90,0.1)',
                      border: 'none',
                      borderRadius: '8px',
                      color: '#c25a5a',
                      fontSize: '14px',
                      cursor: 'pointer'
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                )}
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
