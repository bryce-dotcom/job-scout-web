import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { ChevronLeft, ChevronRight, List, Route } from 'lucide-react'

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

const statusColors = {
  'Planned': { bg: 'rgba(90,155,213,0.9)', text: '#fff' },
  'In Progress': { bg: 'rgba(212,148,10,0.9)', text: '#fff' },
  'Completed': { bg: 'rgba(74,124,89,0.9)', text: '#fff' },
  'Cancelled': { bg: 'rgba(194,90,90,0.9)', text: '#fff' }
}

export default function RoutesCalendar() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const routes = useStore((state) => state.routes)
  const fetchRoutes = useStore((state) => state.fetchRoutes)

  const [currentDate, setCurrentDate] = useState(new Date())

  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchRoutes()
  }, [companyId, navigate, fetchRoutes])

  const calendarDays = useMemo(() => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const startPadding = firstDay.getDay()
    const days = []

    // Previous month padding
    for (let i = startPadding - 1; i >= 0; i--) {
      const date = new Date(year, month, -i)
      days.push({ date, isCurrentMonth: false })
    }

    // Current month
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push({ date: new Date(year, month, i), isCurrentMonth: true })
    }

    // Next month padding
    const remaining = 42 - days.length
    for (let i = 1; i <= remaining; i++) {
      days.push({ date: new Date(year, month + 1, i), isCurrentMonth: false })
    }

    return days
  }, [currentDate])

  const getRoutesForDate = (date) => {
    const dateStr = date.toISOString().split('T')[0]
    return routes.filter(r => r.date?.startsWith(dateStr))
  }

  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1))
  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1))
  const today = () => setCurrentDate(new Date())

  const isToday = (date) => {
    const t = new Date()
    return date.getDate() === t.getDate() && date.getMonth() === t.getMonth() && date.getFullYear() === t.getFullYear()
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
          Routes Calendar
        </h1>
        <button
          onClick={() => navigate('/routes')}
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
          <List size={18} />
          List View
        </button>
      </div>

      {/* Calendar Navigation */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '24px',
        backgroundColor: theme.bgCard,
        borderRadius: '12px',
        border: `1px solid ${theme.border}`,
        padding: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={prevMonth} style={{
            padding: '8px',
            backgroundColor: theme.accentBg,
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            color: theme.accent
          }}>
            <ChevronLeft size={20} />
          </button>
          <button onClick={nextMonth} style={{
            padding: '8px',
            backgroundColor: theme.accentBg,
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            color: theme.accent
          }}>
            <ChevronRight size={20} />
          </button>
          <button onClick={today} style={{
            padding: '8px 16px',
            backgroundColor: theme.accent,
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            cursor: 'pointer'
          }}>
            Today
          </button>
        </div>
        <h2 style={{ fontSize: '20px', fontWeight: '600', color: theme.text }}>
          {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </h2>
        <div style={{ width: '120px' }}></div>
      </div>

      {/* Calendar Grid */}
      <div style={{
        backgroundColor: theme.bgCard,
        borderRadius: '12px',
        border: `1px solid ${theme.border}`,
        overflow: 'hidden'
      }}>
        {/* Weekday Headers */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(7, 1fr)',
          borderBottom: `1px solid ${theme.border}`
        }}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} style={{
              padding: '12px',
              textAlign: 'center',
              fontSize: '13px',
              fontWeight: '600',
              color: theme.textMuted,
              textTransform: 'uppercase'
            }}>
              {day}
            </div>
          ))}
        </div>

        {/* Days Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
          {calendarDays.map((day, idx) => {
            const dayRoutes = getRoutesForDate(day.date)
            return (
              <div
                key={idx}
                style={{
                  minHeight: '100px',
                  padding: '8px',
                  borderRight: (idx + 1) % 7 !== 0 ? `1px solid ${theme.border}` : 'none',
                  borderBottom: idx < 35 ? `1px solid ${theme.border}` : 'none',
                  backgroundColor: day.isCurrentMonth ? 'transparent' : theme.bg,
                  opacity: day.isCurrentMonth ? 1 : 0.5
                }}
              >
                <div style={{
                  fontSize: '14px',
                  fontWeight: isToday(day.date) ? '700' : '500',
                  color: isToday(day.date) ? theme.accent : theme.text,
                  marginBottom: '4px',
                  width: '28px',
                  height: '28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '50%',
                  backgroundColor: isToday(day.date) ? theme.accentBg : 'transparent'
                }}>
                  {day.date.getDate()}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {dayRoutes.slice(0, 3).map(route => {
                    const style = statusColors[route.status] || statusColors['Planned']
                    return (
                      <div
                        key={route.id}
                        onClick={() => navigate('/routes')}
                        style={{
                          padding: '2px 6px',
                          backgroundColor: style.bg,
                          color: style.text,
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: '500',
                          cursor: 'pointer',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {route.route_id}
                      </div>
                    )
                  })}
                  {dayRoutes.length > 3 && (
                    <div style={{ fontSize: '11px', color: theme.textMuted, paddingLeft: '4px' }}>
                      +{dayRoutes.length - 3} more
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div style={{
        display: 'flex',
        gap: '16px',
        marginTop: '16px',
        justifyContent: 'center',
        flexWrap: 'wrap'
      }}>
        {Object.entries(statusColors).map(([status, colors]) => (
          <div key={status} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{
              width: '12px',
              height: '12px',
              borderRadius: '3px',
              backgroundColor: colors.bg
            }} />
            <span style={{ fontSize: '13px', color: theme.textSecondary }}>{status}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
