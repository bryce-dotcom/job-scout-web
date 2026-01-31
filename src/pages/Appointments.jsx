import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { APPOINTMENT_STATUS } from '../lib/schema'
import {
  Plus, Pencil, Trash2, X, Calendar, Search, Clock, MapPin, User,
  ChevronLeft, ChevronRight, Filter
} from 'lucide-react'

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
  'Scheduled': { bg: '#5a9bd5', text: '#ffffff' },
  'Confirmed': { bg: '#4a7c59', text: '#ffffff' },
  'Completed': { bg: '#5a6349', text: '#ffffff' },
  'Cancelled': { bg: '#c25a5a', text: '#ffffff' },
  'No Show': { bg: '#d4940a', text: '#ffffff' }
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

  const [currentDate, setCurrentDate] = useState(new Date())
  const [showModal, setShowModal] = useState(false)
  const [editingAppointment, setEditingAppointment] = useState(null)
  const [formData, setFormData] = useState(emptyAppointment)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [setterFilter, setSetterFilter] = useState('all')

  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  // Check if user is admin
  const isAdmin = user?.user_role === 'Admin' || user?.user_role === 'Owner' || user?.role === 'Admin' || user?.role === 'Owner'

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchAppointments()
  }, [companyId, navigate, fetchAppointments])

  // Calendar helpers
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const firstDayOfMonth = new Date(year, month, 1)
  const lastDayOfMonth = new Date(year, month + 1, 0)
  const startDay = firstDayOfMonth.getDay()
  const daysInMonth = lastDayOfMonth.getDate()

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1))
  const goToToday = () => setCurrentDate(new Date())

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  const today = new Date()
  const isToday = (day) => {
    return today.getFullYear() === year &&
           today.getMonth() === month &&
           today.getDate() === day
  }

  // Filter appointments
  const filteredAppointments = appointments.filter(apt => {
    const matchesStatus = statusFilter === 'all' || apt.status === statusFilter
    let matchesSetter = true
    if (setterFilter === 'my') {
      matchesSetter = apt.setter_id === user?.id
    } else if (setterFilter !== 'all') {
      matchesSetter = apt.setter_id === parseInt(setterFilter)
    }
    return matchesStatus && matchesSetter
  })

  const getAppointmentsForDate = (day) => {
    const date = new Date(year, month, day)
    const dateStr = date.toISOString().split('T')[0]

    return filteredAppointments.filter(apt => {
      if (!apt.start_time) return false
      const aptDate = new Date(apt.start_time).toISOString().split('T')[0]
      return aptDate === dateStr
    })
  }

  // Build calendar grid
  const calendarDays = []
  for (let i = 0; i < startDay; i++) {
    calendarDays.push(null)
  }
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(day)
  }

  const openAddModal = (day = null) => {
    setEditingAppointment(null)
    const defaultDate = day
      ? new Date(year, month, day, 9, 0).toISOString().slice(0, 16)
      : ''
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

    await fetchAppointments()
    closeModal()
    setLoading(false)
  }

  const handleDelete = async (apt, e) => {
    e.stopPropagation()
    if (!confirm(`Delete appointment "${apt.title}"?`)) return
    await supabase.from('appointments').delete().eq('id', apt.id)
    await fetchAppointments()
  }

  const formatTime = (dateStr) => {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
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
        marginBottom: '24px',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>
          Appointments
        </h1>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Filters */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ ...inputStyle, width: 'auto', minWidth: '130px' }}
          >
            <option value="all">All Statuses</option>
            {APPOINTMENT_STATUS.map(status => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>

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

      {/* Calendar Navigation */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={goToToday}
            style={{
              padding: '8px 16px',
              backgroundColor: theme.bgCard,
              border: `1px solid ${theme.border}`,
              borderRadius: '8px',
              fontSize: '14px',
              color: theme.text,
              cursor: 'pointer'
            }}
          >
            Today
          </button>
          <button
            onClick={prevMonth}
            style={{
              padding: '10px',
              backgroundColor: theme.bgCard,
              border: `1px solid ${theme.border}`,
              borderRadius: '8px',
              cursor: 'pointer',
              color: theme.textSecondary
            }}
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={nextMonth}
            style={{
              padding: '10px',
              backgroundColor: theme.bgCard,
              border: `1px solid ${theme.border}`,
              borderRadius: '8px',
              cursor: 'pointer',
              color: theme.textSecondary
            }}
          >
            <ChevronRight size={20} />
          </button>
        </div>

        <span style={{
          fontSize: '18px',
          fontWeight: '600',
          color: theme.text
        }}>
          {monthNames[month]} {year}
        </span>

        {/* Legend */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {Object.entries(statusColors).slice(0, 4).map(([status, colors]) => (
            <div key={status} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{
                width: '10px',
                height: '10px',
                borderRadius: '3px',
                backgroundColor: colors.bg
              }} />
              <span style={{ fontSize: '12px', color: theme.textMuted }}>{status}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Calendar Grid */}
      <div style={{
        backgroundColor: theme.bgCard,
        borderRadius: '12px',
        border: `1px solid ${theme.border}`,
        overflow: 'hidden'
      }}>
        {/* Day Headers */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          backgroundColor: theme.accentBg,
          borderBottom: `1px solid ${theme.border}`
        }}>
          {dayNames.map(day => (
            <div key={day} style={{
              padding: '12px 8px',
              textAlign: 'center',
              fontSize: '13px',
              fontWeight: '600',
              color: theme.textMuted
            }}>
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Days */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)'
        }}>
          {calendarDays.map((day, index) => {
            const dayAppointments = day ? getAppointmentsForDate(day) : []

            return (
              <div
                key={index}
                onClick={() => day && openAddModal(day)}
                style={{
                  minHeight: '120px',
                  borderBottom: `1px solid ${theme.border}`,
                  borderRight: (index + 1) % 7 !== 0 ? `1px solid ${theme.border}` : 'none',
                  padding: '8px',
                  backgroundColor: day ? (isToday(day) ? 'rgba(90,99,73,0.08)' : 'transparent') : theme.accentBg,
                  cursor: day ? 'pointer' : 'default'
                }}
              >
                {day && (
                  <>
                    <div style={{
                      fontSize: '14px',
                      fontWeight: isToday(day) ? '600' : '500',
                      color: isToday(day) ? theme.accent : theme.text,
                      marginBottom: '6px'
                    }}>
                      {day}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {dayAppointments.slice(0, 3).map(apt => {
                        const colors = statusColors[apt.status] || statusColors['Scheduled']
                        return (
                          <div
                            key={apt.id}
                            onClick={(e) => {
                              e.stopPropagation()
                              openEditModal(apt)
                            }}
                            style={{
                              backgroundColor: colors.bg,
                              color: colors.text,
                              fontSize: '11px',
                              padding: '4px 6px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                            title={`${formatTime(apt.start_time)} - ${apt.title || apt.lead?.customer_name || 'Untitled'}`}
                          >
                            <span style={{ opacity: 0.8 }}>{formatTime(apt.start_time)}</span>
                            <span>{apt.title || apt.lead?.customer_name || 'Untitled'}</span>
                          </div>
                        )
                      })}
                      {dayAppointments.length > 3 && (
                        <div style={{
                          fontSize: '11px',
                          color: theme.textMuted,
                          padding: '2px 4px'
                        }}>
                          +{dayAppointments.length - 3} more
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

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
                    onClick={(e) => handleDelete(editingAppointment, e)}
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
