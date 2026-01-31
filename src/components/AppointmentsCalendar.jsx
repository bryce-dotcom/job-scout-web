import { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from './Layout'
import { ChevronLeft, ChevronRight, Calendar, Clock, MapPin, User, RefreshCw } from 'lucide-react'

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

// Helper to get week start (Sunday)
const getWeekStart = (date) => {
  const d = new Date(date)
  const day = d.getDay()
  d.setDate(d.getDate() - day)
  d.setHours(0, 0, 0, 0)
  return d
}

// Helper to get week days array
const getWeekDays = (weekStart) => {
  const days = []
  for (let i = 0; i < 7; i++) {
    const day = new Date(weekStart)
    day.setDate(day.getDate() + i)
    days.push(day)
  }
  return days
}

const AppointmentsCalendar = forwardRef(({
  viewMode = 'week', // 'week' or 'month'
  onAppointmentClick,
  onSlotClick,
  onDragOver,
  onDrop,
  enableDragDrop = false,
  showHeader = true,
  filterSetterId = null, // Filter by setter
  height = 'auto'
}, ref) => {
  const companyId = useStore((state) => state.companyId)
  const user = useStore((state) => state.user)

  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  const [appointments, setAppointments] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentDate, setCurrentDate] = useState(new Date())
  const [refreshKey, setRefreshKey] = useState(0)

  // Fetch appointments from database
  const fetchAppointments = useCallback(async () => {
    if (!companyId) return

    setLoading(true)

    let startDate, endDate
    if (viewMode === 'week') {
      startDate = getWeekStart(currentDate)
      endDate = new Date(startDate)
      endDate.setDate(endDate.getDate() + 7)
    } else {
      // Month view
      startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
      endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0)
      endDate.setDate(endDate.getDate() + 1)
    }

    let query = supabase
      .from('appointments')
      .select('*, lead:leads(id, customer_name, phone, address, service_type), setter:employees!setter_id(id, name), salesperson:employees!salesperson_id(id, name)')
      .eq('company_id', companyId)
      .gte('start_time', startDate.toISOString())
      .lt('start_time', endDate.toISOString())
      .order('start_time')

    // Filter by setter if specified
    if (filterSetterId) {
      query = query.eq('setter_id', filterSetterId)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching appointments:', error)
    } else {
      console.log('Appointments fetched:', data?.length || 0)
      setAppointments(data || [])
    }

    setLoading(false)
  }, [companyId, currentDate, viewMode, filterSetterId])

  // Expose refresh method via ref and window
  useImperativeHandle(ref, () => ({
    refresh: () => {
      console.log('Calendar refresh triggered via ref')
      setRefreshKey(k => k + 1)
    }
  }))

  // Also expose globally for easy access
  useEffect(() => {
    window.refreshAppointmentsCalendar = () => {
      console.log('Calendar refresh triggered via window')
      setRefreshKey(k => k + 1)
    }
    return () => {
      delete window.refreshAppointmentsCalendar
    }
  }, [])

  // Fetch on mount and when dependencies change
  useEffect(() => {
    fetchAppointments()
  }, [fetchAppointments, refreshKey])

  // Navigation
  const goToToday = () => setCurrentDate(new Date())

  const goPrev = () => {
    if (viewMode === 'week') {
      setCurrentDate(d => {
        const newDate = new Date(d)
        newDate.setDate(newDate.getDate() - 7)
        return newDate
      })
    } else {
      setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))
    }
  }

  const goNext = () => {
    if (viewMode === 'week') {
      setCurrentDate(d => {
        const newDate = new Date(d)
        newDate.setDate(newDate.getDate() + 7)
        return newDate
      })
    } else {
      setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))
    }
  }

  // Get appointments for a specific slot (week view)
  const getAppointmentsForSlot = (date, hour) => {
    return appointments.filter(apt => {
      const aptDate = new Date(apt.start_time)
      return aptDate.toDateString() === date.toDateString() && aptDate.getHours() === hour
    })
  }

  // Get appointments for a specific date (month view)
  const getAppointmentsForDate = (date) => {
    const dateStr = date.toISOString().split('T')[0]
    return appointments.filter(apt => {
      if (!apt.start_time) return false
      const aptDate = new Date(apt.start_time).toISOString().split('T')[0]
      return aptDate === dateStr
    })
  }

  const isToday = (date) => {
    const today = new Date()
    return date.toDateString() === today.toDateString()
  }

  const formatTime = (dateStr) => {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  }

  const formatHour = (hour) => {
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const h = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour)
    return `${h} ${ampm}`
  }

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  // Week view data
  const weekStart = getWeekStart(currentDate)
  const weekDays = getWeekDays(weekStart)
  const hours = Array.from({ length: 12 }, (_, i) => i + 7) // 7 AM to 6 PM

  // Month view data
  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const firstDayOfMonth = new Date(year, month, 1)
  const lastDayOfMonth = new Date(year, month + 1, 0)
  const startDay = firstDayOfMonth.getDay()
  const daysInMonth = lastDayOfMonth.getDate()

  const calendarDays = []
  for (let i = 0; i < startDay; i++) calendarDays.push(null)
  for (let day = 1; day <= daysInMonth; day++) calendarDays.push(day)

  // Render appointment chip
  const renderAppointmentChip = (apt, compact = false) => {
    const colors = statusColors[apt.status] || statusColors['Scheduled']
    return (
      <div
        key={apt.id}
        onClick={(e) => {
          e.stopPropagation()
          onAppointmentClick?.(apt)
        }}
        style={{
          backgroundColor: colors.bg,
          color: colors.text,
          fontSize: compact ? '10px' : '11px',
          padding: compact ? '2px 4px' : '4px 6px',
          borderRadius: '4px',
          cursor: 'pointer',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          marginBottom: '2px'
        }}
        title={`${formatTime(apt.start_time)} - ${apt.title || apt.lead?.customer_name || 'Appointment'}`}
      >
        {!compact && <span style={{ opacity: 0.8, marginRight: '4px' }}>{formatTime(apt.start_time)}</span>}
        <span>{apt.lead?.customer_name || apt.title || 'Appointment'}</span>
      </div>
    )
  }

  if (loading && appointments.length === 0) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: theme.textMuted }}>
        Loading calendar...
      </div>
    )
  }

  return (
    <div style={{ height }}>
      {/* Header */}
      {showHeader && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
          flexWrap: 'wrap',
          gap: '12px'
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
              onClick={goPrev}
              style={{
                padding: '8px',
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
              onClick={goNext}
              style={{
                padding: '8px',
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

          <span style={{ fontSize: '16px', fontWeight: '600', color: theme.text }}>
            {viewMode === 'week'
              ? `${monthNames[weekStart.getMonth()]} ${weekStart.getDate()} - ${weekDays[6].getDate()}, ${weekStart.getFullYear()}`
              : `${monthNames[month]} ${year}`
            }
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => fetchAppointments()}
              style={{
                padding: '8px',
                backgroundColor: theme.bgCard,
                border: `1px solid ${theme.border}`,
                borderRadius: '8px',
                cursor: 'pointer',
                color: theme.textSecondary
              }}
              title="Refresh"
            >
              <RefreshCw size={18} />
            </button>
            {/* Google Calendar placeholder */}
            <button
              disabled
              style={{
                padding: '8px 12px',
                backgroundColor: theme.bg,
                border: `1px solid ${theme.border}`,
                borderRadius: '8px',
                fontSize: '12px',
                color: theme.textMuted,
                cursor: 'not-allowed',
                opacity: 0.6
              }}
              title="Coming in Phase 2"
            >
              <Calendar size={14} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
              Connect Google (Soon)
            </button>
          </div>
        </div>
      )}

      {/* Week View */}
      {viewMode === 'week' && (
        <div style={{
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          overflow: 'auto'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
            <thead>
              <tr>
                <th style={{
                  width: '60px',
                  padding: '12px 8px',
                  borderBottom: `1px solid ${theme.border}`,
                  backgroundColor: theme.accentBg,
                  fontSize: '12px',
                  color: theme.textMuted,
                  fontWeight: '500'
                }}>
                  Time
                </th>
                {weekDays.map((day, i) => (
                  <th
                    key={i}
                    style={{
                      padding: '12px 8px',
                      borderBottom: `1px solid ${theme.border}`,
                      borderLeft: `1px solid ${theme.border}`,
                      backgroundColor: isToday(day) ? theme.accentBg : theme.bg,
                      textAlign: 'center'
                    }}
                  >
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>
                      {dayNames[i]}
                    </div>
                    <div style={{
                      fontSize: '16px',
                      fontWeight: isToday(day) ? '700' : '500',
                      color: isToday(day) ? theme.accent : theme.text
                    }}>
                      {day.getDate()}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hours.map(hour => (
                <tr key={hour}>
                  <td style={{
                    padding: '4px 8px',
                    borderBottom: `1px solid ${theme.border}`,
                    fontSize: '11px',
                    color: theme.textMuted,
                    textAlign: 'right',
                    verticalAlign: 'top'
                  }}>
                    {formatHour(hour)}
                  </td>
                  {weekDays.map((day, i) => {
                    const slotAppointments = getAppointmentsForSlot(day, hour)

                    return (
                      <td
                        key={i}
                        onClick={() => onSlotClick?.(day, hour)}
                        onDragOver={enableDragDrop ? (e) => {
                          e.preventDefault()
                          onDragOver?.(e, day, hour)
                        } : undefined}
                        onDrop={enableDragDrop ? (e) => onDrop?.(e, day, hour) : undefined}
                        style={{
                          padding: '2px',
                          borderBottom: `1px solid ${theme.border}`,
                          borderLeft: `1px solid ${theme.border}`,
                          height: '50px',
                          verticalAlign: 'top',
                          backgroundColor: isToday(day) ? 'rgba(90,99,73,0.04)' : 'transparent',
                          cursor: onSlotClick ? 'pointer' : 'default'
                        }}
                      >
                        {slotAppointments.map(apt => renderAppointmentChip(apt, true))}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Month View */}
      {viewMode === 'month' && (
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
              const dayDate = day ? new Date(year, month, day) : null
              const dayAppointments = dayDate ? getAppointmentsForDate(dayDate) : []

              return (
                <div
                  key={index}
                  onClick={() => dayDate && onSlotClick?.(dayDate, 9)}
                  style={{
                    minHeight: '100px',
                    borderBottom: `1px solid ${theme.border}`,
                    borderRight: (index + 1) % 7 !== 0 ? `1px solid ${theme.border}` : 'none',
                    padding: '8px',
                    backgroundColor: day
                      ? (dayDate && isToday(dayDate) ? 'rgba(90,99,73,0.08)' : 'transparent')
                      : theme.bg,
                    cursor: day && onSlotClick ? 'pointer' : 'default'
                  }}
                >
                  {day && (
                    <>
                      <div style={{
                        fontSize: '14px',
                        fontWeight: isToday(dayDate) ? '600' : '500',
                        color: isToday(dayDate) ? theme.accent : theme.text,
                        marginBottom: '6px'
                      }}>
                        {day}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {dayAppointments.slice(0, 3).map(apt => renderAppointmentChip(apt))}
                        {dayAppointments.length > 3 && (
                          <div style={{ fontSize: '11px', color: theme.textMuted, padding: '2px 4px' }}>
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
      )}

      {/* Legend */}
      <div style={{
        display: 'flex',
        gap: '16px',
        marginTop: '12px',
        flexWrap: 'wrap',
        justifyContent: 'center'
      }}>
        {Object.entries(statusColors).map(([status, colors]) => (
          <div key={status} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{
              width: '12px',
              height: '12px',
              borderRadius: '3px',
              backgroundColor: colors.bg
            }} />
            <span style={{ fontSize: '12px', color: theme.textMuted }}>{status}</span>
          </div>
        ))}
      </div>
    </div>
  )
})

AppointmentsCalendar.displayName = 'AppointmentsCalendar'

export default AppointmentsCalendar
