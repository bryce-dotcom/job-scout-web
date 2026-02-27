import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { ChevronLeft, ChevronRight, ArrowLeft, Calendar } from 'lucide-react'

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
  'Scheduled': '#5a6349',
  'In Progress': '#c28b38',
  'Completed': '#4a7c59',
  'Cancelled': '#8b5a5a',
  'On Hold': '#7d8a7f'
}

export default function JobCalendar() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const jobs = useStore((state) => state.jobs)
  const fetchJobs = useStore((state) => state.fetchJobs)

  const [currentDate, setCurrentDate] = useState(new Date())

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

  const getJobsForDate = (day) => {
    const date = new Date(year, month, day)
    const dateStr = date.toISOString().split('T')[0]

    return jobs.filter(job => {
      if (!job.start_date) return false
      const jobDate = new Date(job.start_date).toISOString().split('T')[0]
      return jobDate === dateStr
    })
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
            onClick={() => navigate('/jobs')}
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
            Job Calendar
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

      {/* Legend */}
      <div style={{
        display: 'flex',
        gap: '16px',
        marginBottom: '16px',
        flexWrap: 'wrap'
      }}>
        {Object.entries(statusColors).map(([status, color]) => (
          <div key={status} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div style={{
              width: '12px',
              height: '12px',
              borderRadius: '4px',
              backgroundColor: color
            }} />
            <span style={{ fontSize: '13px', color: theme.textSecondary }}>{status}</span>
          </div>
        ))}
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
            const dayJobs = day ? getJobsForDate(day) : []

            return (
              <div
                key={index}
                style={{
                  minHeight: '120px',
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
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {dayJobs.slice(0, 3).map(job => (
                        <div
                          key={job.id}
                          onClick={() => navigate(`/jobs/${job.id}`)}
                          style={{
                            backgroundColor: statusColors[job.status] || statusColors['Scheduled'],
                            color: '#ffffff',
                            fontSize: '11px',
                            padding: '4px 6px',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap'
                          }}
                          title={job.job_title || job.customer?.name || 'Untitled'}
                        >
                          {job.job_title || job.customer?.name || 'Untitled'}
                        </div>
                      ))}
                      {dayJobs.length > 3 && (
                        <div style={{
                          fontSize: '11px',
                          color: theme.textMuted,
                          padding: '2px 4px'
                        }}>
                          +{dayJobs.length - 3} more
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
