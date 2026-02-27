import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { ChevronLeft, ChevronRight, ArrowLeft, Calendar, Wrench, AlertTriangle } from 'lucide-react'

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

export default function FleetCalendar() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const fleet = useStore((state) => state.fleet)
  const fleetRentals = useStore((state) => state.fleetRentals)
  const fetchFleet = useStore((state) => state.fetchFleet)
  const fetchFleetRentals = useStore((state) => state.fetchFleetRentals)

  const [currentDate, setCurrentDate] = useState(new Date())

  // Theme with fallback
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchFleet()
    fetchFleetRentals()
  }, [companyId, navigate, fetchFleet, fetchFleetRentals])

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  const firstDayOfMonth = new Date(year, month, 1)
  const lastDayOfMonth = new Date(year, month + 1, 0)
  const startDay = firstDayOfMonth.getDay()
  const daysInMonth = lastDayOfMonth.getDate()

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1))
  }

  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1))
  }

  const goToToday = () => {
    setCurrentDate(new Date())
  }

  const getEventsForDate = (day) => {
    const date = new Date(year, month, day)
    const dateStr = date.toISOString().split('T')[0]
    const events = []

    // PM due dates
    fleet.forEach(asset => {
      if (asset.next_pm_due) {
        const pmDate = new Date(asset.next_pm_due).toISOString().split('T')[0]
        if (pmDate === dateStr) {
          const isOverdue = new Date(asset.next_pm_due) < new Date()
          events.push({
            type: 'pm',
            asset,
            label: `${asset.name} PM`,
            color: isOverdue ? '#c25a5a' : '#c28b38',
            isOverdue
          })
        }
      }
    })

    // Rentals - show on start, end, and in-between dates
    fleetRentals.forEach(rental => {
      if (!rental.start_date) return
      const asset = fleet.find(a => a.id === rental.asset_id)
      if (!asset) return

      const startDate = new Date(rental.start_date).toISOString().split('T')[0]
      const endDate = rental.end_date ? new Date(rental.end_date).toISOString().split('T')[0] : null

      // Check if this date falls within the rental period
      if (dateStr === startDate || (endDate && dateStr === endDate) ||
          (dateStr >= startDate && (!endDate || dateStr <= endDate))) {
        events.push({
          type: 'rental',
          asset,
          rental,
          label: `${asset.name} - ${rental.rental_customer}`,
          color: rental.status === 'Active' ? '#5a6349' : '#7d8a7f',
          isStart: dateStr === startDate,
          isEnd: dateStr === endDate
        })
      }
    })

    // Out of service assets
    fleet.forEach(asset => {
      if (asset.status === 'Out of Service') {
        events.push({
          type: 'outOfService',
          asset,
          label: `${asset.name} - Out of Service`,
          color: '#c25a5a'
        })
      }
    })

    return events
  }

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

  // Build calendar grid
  const calendarDays = []

  // Empty cells for days before the first day of month
  for (let i = 0; i < startDay; i++) {
    calendarDays.push(null)
  }

  // Days of the month
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(day)
  }

  // Count upcoming PM and active rentals
  const upcomingPM = fleet.filter(a => {
    if (!a.next_pm_due) return false
    const pmDate = new Date(a.next_pm_due)
    const weekFromNow = new Date()
    weekFromNow.setDate(weekFromNow.getDate() + 7)
    return pmDate <= weekFromNow
  }).length

  const activeRentals = fleetRentals.filter(r => r.status === 'Active').length

  return (
    <div style={{ padding: '24px', maxWidth: '100%', overflowX: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={() => navigate('/fleet')}
            style={{
              padding: '10px',
              backgroundColor: theme.bgCard,
              border: `1px solid ${theme.border}`,
              borderRadius: '8px',
              cursor: 'pointer',
              color: theme.textSecondary
            }}
          >
            <ArrowLeft size={20} />
          </button>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>
            Fleet Calendar
          </h1>
        </div>

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
          <span style={{
            width: '160px',
            textAlign: 'center',
            fontSize: '16px',
            fontWeight: '600',
            color: theme.text
          }}>
            {monthNames[month]} {year}
          </span>
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
      </div>

      {/* Stats */}
      <div style={{
        display: 'flex',
        gap: '16px',
        marginBottom: '16px'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 16px',
          backgroundColor: upcomingPM > 0 ? 'rgba(194,139,56,0.1)' : theme.bgCard,
          borderRadius: '8px',
          border: `1px solid ${upcomingPM > 0 ? 'rgba(194,139,56,0.3)' : theme.border}`
        }}>
          <Wrench size={18} style={{ color: '#c28b38' }} />
          <span style={{ fontSize: '14px', color: theme.text }}>
            <strong>{upcomingPM}</strong> PM due this week
          </span>
        </div>

        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 16px',
          backgroundColor: theme.bgCard,
          borderRadius: '8px',
          border: `1px solid ${theme.border}`
        }}>
          <Calendar size={18} style={{ color: theme.accent }} />
          <span style={{ fontSize: '14px', color: theme.text }}>
            <strong>{activeRentals}</strong> active rentals
          </span>
        </div>
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex',
        gap: '16px',
        marginBottom: '16px',
        flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{
            width: '12px',
            height: '12px',
            borderRadius: '4px',
            backgroundColor: '#c28b38'
          }} />
          <span style={{ fontSize: '13px', color: theme.textSecondary }}>PM Due</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{
            width: '12px',
            height: '12px',
            borderRadius: '4px',
            backgroundColor: '#c25a5a'
          }} />
          <span style={{ fontSize: '13px', color: theme.textSecondary }}>PM Overdue / Out of Service</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{
            width: '12px',
            height: '12px',
            borderRadius: '4px',
            backgroundColor: '#5a6349'
          }} />
          <span style={{ fontSize: '13px', color: theme.textSecondary }}>Active Rental</span>
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
            const dayEvents = day ? getEventsForDate(day) : []
            // De-duplicate events by type+asset to avoid repetition
            const uniqueEvents = dayEvents.reduce((acc, event) => {
              const key = `${event.type}-${event.asset.id}`
              if (!acc.find(e => `${e.type}-${e.asset.id}` === key)) {
                acc.push(event)
              }
              return acc
            }, [])

            return (
              <div
                key={index}
                style={{
                  minHeight: '100px',
                  borderBottom: `1px solid ${theme.border}`,
                  borderRight: (index + 1) % 7 !== 0 ? `1px solid ${theme.border}` : 'none',
                  padding: '8px',
                  backgroundColor: day ? (isToday(day) ? 'rgba(90,99,73,0.08)' : 'transparent') : theme.accentBg
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      {uniqueEvents.slice(0, 3).map((event, i) => (
                        <div
                          key={i}
                          onClick={() => navigate(`/fleet/${event.asset.id}`)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            backgroundColor: event.color,
                            color: '#ffffff',
                            fontSize: '10px',
                            padding: '3px 6px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                          title={event.label}
                        >
                          {event.type === 'pm' && <Wrench size={10} />}
                          {event.type === 'outOfService' && <AlertTriangle size={10} />}
                          {event.type === 'rental' && <Calendar size={10} />}
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {event.asset.name}
                          </span>
                        </div>
                      ))}
                      {uniqueEvents.length > 3 && (
                        <div style={{
                          fontSize: '10px',
                          color: theme.textMuted,
                          padding: '2px 4px'
                        }}>
                          +{uniqueEvents.length - 3} more
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
    </div>
  )
}
