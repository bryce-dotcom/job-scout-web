import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { ChevronLeft, ChevronRight, ArrowLeft } from 'lucide-react'

const statusColors = {
  'Scheduled': 'bg-blue-500',
  'In Progress': 'bg-orange-500',
  'Completed': 'bg-green-500',
  'Cancelled': 'bg-red-500',
  'On Hold': 'bg-yellow-500'
}

export default function JobCalendar() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const jobs = useStore((state) => state.jobs)
  const fetchJobs = useStore((state) => state.fetchJobs)

  const [currentDate, setCurrentDate] = useState(new Date())

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
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/jobs')}
            className="p-2 hover:bg-gray-100 rounded-md"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Job Calendar</h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={goToToday}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Today
          </button>
          <button
            onClick={prevMonth}
            className="p-2 hover:bg-gray-100 rounded-md"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="text-lg font-medium w-40 text-center">
            {monthNames[month]} {year}
          </span>
          <button
            onClick={nextMonth}
            className="p-2 hover:bg-gray-100 rounded-md"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 mb-4 text-sm">
        {Object.entries(statusColors).map(([status, color]) => (
          <div key={status} className="flex items-center gap-1">
            <div className={`w-3 h-3 rounded ${color}`} />
            <span className="text-gray-600">{status}</span>
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {/* Day Headers */}
        <div className="grid grid-cols-7 bg-gray-50 border-b">
          {dayNames.map(day => (
            <div key={day} className="px-2 py-3 text-center text-sm font-medium text-gray-600">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Days */}
        <div className="grid grid-cols-7">
          {calendarDays.map((day, index) => {
            const dayJobs = day ? getJobsForDate(day) : []

            return (
              <div
                key={index}
                className={`min-h-[120px] border-b border-r p-1 ${
                  day ? 'bg-white' : 'bg-gray-50'
                } ${isToday(day) ? 'bg-blue-50' : ''}`}
              >
                {day && (
                  <>
                    <div className={`text-sm font-medium mb-1 ${
                      isToday(day) ? 'text-blue-600' : 'text-gray-900'
                    }`}>
                      {day}
                    </div>
                    <div className="space-y-1">
                      {dayJobs.slice(0, 3).map(job => (
                        <div
                          key={job.id}
                          onClick={() => navigate(`/jobs/${job.id}`)}
                          className={`${statusColors[job.status]} text-white text-xs px-1.5 py-1 rounded truncate cursor-pointer hover:opacity-80`}
                          title={job.job_title || job.customer?.name || 'Untitled'}
                        >
                          {job.job_title || job.customer?.name || 'Untitled'}
                        </div>
                      ))}
                      {dayJobs.length > 3 && (
                        <div className="text-xs text-gray-500 px-1">
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
