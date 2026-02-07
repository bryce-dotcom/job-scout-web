import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { supabase } from '../lib/supabase'
import { ArrowLeft, Clock, Play, Square, Plus, Search, Filter, Calendar } from 'lucide-react'

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

const categoryColors = {
  'Regular': '#5a6349',
  'Overtime': '#c28b38',
  'Travel': '#4a7c59',
  'Break': '#7d8a7f'
}

export default function TimeLog() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const timeLogs = useStore((state) => state.timeLogs)
  const employees = useStore((state) => state.employees)
  const jobs = useStore((state) => state.jobs)
  const fetchTimeLogs = useStore((state) => state.fetchTimeLogs)

  const [searchTerm, setSearchTerm] = useState('')
  const [filterEmployee, setFilterEmployee] = useState('all')
  const [filterJob, setFilterJob] = useState('all')
  const [filterCategory, setFilterCategory] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({
    employee_id: '',
    job_id: '',
    date: new Date().toISOString().split('T')[0],
    category: 'Regular',
    hours: '',
    clock_in_time: '',
    clock_out_time: '',
    notes: ''
  })

  // Theme with fallback
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchTimeLogs()
  }, [companyId, navigate, fetchTimeLogs])

  // Filter time logs
  const filteredLogs = timeLogs.filter(log => {
    // Search filter
    const employee = employees.find(e => e.id === log.employee_id)
    const job = jobs.find(j => j.id === log.job_id)
    const employeeName = employee ? `${employee?.name || ''}`.toLowerCase() : ''
    const jobTitle = job?.job_title?.toLowerCase() || ''
    const searchLower = searchTerm.toLowerCase()

    if (searchTerm && !employeeName.includes(searchLower) && !jobTitle.includes(searchLower)) {
      return false
    }

    // Employee filter
    if (filterEmployee !== 'all' && log.employee_id !== filterEmployee) {
      return false
    }

    // Job filter
    if (filterJob !== 'all' && log.job_id !== filterJob) {
      return false
    }

    // Category filter
    if (filterCategory !== 'all' && log.category !== filterCategory) {
      return false
    }

    // Date range filter
    if (dateFrom && log.date < dateFrom) {
      return false
    }
    if (dateTo && log.date > dateTo) {
      return false
    }

    return true
  })

  // Sort by date descending
  const sortedLogs = [...filteredLogs].sort((a, b) =>
    new Date(b.date) - new Date(a.date) ||
    new Date(b.clock_in_time || 0) - new Date(a.clock_in_time || 0)
  )

  // Get currently clocked in entries
  const clockedInEntries = timeLogs.filter(log => log.is_clocked_in)

  // Calculate stats
  const totalHoursToday = timeLogs
    .filter(log => log.date === new Date().toISOString().split('T')[0])
    .reduce((sum, log) => sum + (log.hours || 0), 0)

  const totalHoursWeek = (() => {
    const today = new Date()
    const weekStart = new Date(today)
    weekStart.setDate(today.getDate() - today.getDay())
    const weekStartStr = weekStart.toISOString().split('T')[0]

    return timeLogs
      .filter(log => log.date >= weekStartStr)
      .reduce((sum, log) => sum + (log.hours || 0), 0)
  })()

  const clockIn = async (employeeId, jobId) => {
    const now = new Date()
    const { error } = await supabase.from('time_log').insert({
      company_id: companyId,
      employee_id: employeeId,
      job_id: jobId,
      date: now.toISOString().split('T')[0],
      clock_in_time: now.toISOString(),
      is_clocked_in: true,
      category: 'Regular'
    })

    if (error) {
      alert('Error clocking in: ' + error.message)
    } else {
      fetchTimeLogs()
    }
  }

  const clockOut = async (logId) => {
    const log = timeLogs.find(l => l.id === logId)
    if (!log) return

    const now = new Date()
    const clockIn = new Date(log.clock_in_time)
    const hours = (now - clockIn) / (1000 * 60 * 60) // Convert ms to hours

    const { error } = await supabase
      .from('time_log')
      .update({
        clock_out_time: now.toISOString(),
        is_clocked_in: false,
        hours: Math.round(hours * 100) / 100
      })
      .eq('id', logId)

    if (error) {
      alert('Error clocking out: ' + error.message)
    } else {
      fetchTimeLogs()
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    const insertData = {
      company_id: companyId,
      employee_id: formData.employee_id,
      job_id: formData.job_id || null,
      date: formData.date,
      category: formData.category,
      hours: parseFloat(formData.hours) || 0,
      notes: formData.notes || null,
      is_clocked_in: false
    }

    if (formData.clock_in_time) {
      insertData.clock_in_time = `${formData.date}T${formData.clock_in_time}:00`
    }
    if (formData.clock_out_time) {
      insertData.clock_out_time = `${formData.date}T${formData.clock_out_time}:00`
    }

    const { error } = await supabase.from('time_log').insert(insertData)

    if (error) {
      alert('Error adding time entry: ' + error.message)
    } else {
      setShowModal(false)
      setFormData({
        employee_id: '',
        job_id: '',
        date: new Date().toISOString().split('T')[0],
        category: 'Regular',
        hours: '',
        clock_in_time: '',
        clock_out_time: '',
        notes: ''
      })
      fetchTimeLogs()
    }
  }

  const formatTime = (isoString) => {
    if (!isoString) return '-'
    const date = new Date(isoString)
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const activeEmployees = employees.filter(e => e.active !== false)
  const activeJobs = jobs.filter(j => j.status === 'In Progress' || j.status === 'Scheduled')

  return (
    <div style={{ padding: '24px' }}>
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
            Time Tracking
          </h1>
        </div>

        <button
          onClick={() => setShowModal(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 20px',
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
          Manual Entry
        </button>
      </div>

      {/* Stats Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div style={{
          backgroundColor: theme.bgCard,
          padding: '20px',
          borderRadius: '12px',
          border: `1px solid ${theme.border}`
        }}>
          <div style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '4px' }}>
            Currently Clocked In
          </div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: '#c28b38' }}>
            {clockedInEntries.length}
          </div>
        </div>

        <div style={{
          backgroundColor: theme.bgCard,
          padding: '20px',
          borderRadius: '12px',
          border: `1px solid ${theme.border}`
        }}>
          <div style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '4px' }}>
            Hours Today
          </div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: theme.accent }}>
            {totalHoursToday.toFixed(1)}
          </div>
        </div>

        <div style={{
          backgroundColor: theme.bgCard,
          padding: '20px',
          borderRadius: '12px',
          border: `1px solid ${theme.border}`
        }}>
          <div style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '4px' }}>
            Hours This Week
          </div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: '#4a7c59' }}>
            {totalHoursWeek.toFixed(1)}
          </div>
        </div>

        <div style={{
          backgroundColor: theme.bgCard,
          padding: '20px',
          borderRadius: '12px',
          border: `1px solid ${theme.border}`
        }}>
          <div style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '4px' }}>
            Total Entries
          </div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: theme.text }}>
            {filteredLogs.length}
          </div>
        </div>
      </div>

      {/* Quick Clock In Section */}
      {activeEmployees.length > 0 && activeJobs.length > 0 && (
        <div style={{
          backgroundColor: theme.bgCard,
          padding: '20px',
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          marginBottom: '24px'
        }}>
          <h3 style={{
            fontSize: '16px',
            fontWeight: '600',
            color: theme.text,
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <Clock size={18} />
            Quick Clock In/Out
          </h3>

          {/* Currently Clocked In */}
          {clockedInEntries.length > 0 && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '8px' }}>
                Currently Working:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {clockedInEntries.map(entry => {
                  const employee = employees.find(e => e.id === entry.employee_id)
                  const job = jobs.find(j => j.id === entry.job_id)
                  return (
                    <div
                      key={entry.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '10px 16px',
                        backgroundColor: 'rgba(194,139,56,0.1)',
                        borderRadius: '8px',
                        border: '1px solid rgba(194,139,56,0.3)'
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>
                          {employee ? `${employee?.name || ''}` : 'Unknown'}
                        </div>
                        <div style={{ fontSize: '12px', color: theme.textMuted }}>
                          {job?.job_title || 'No job'} - Started {formatTime(entry.clock_in_time)}
                        </div>
                      </div>
                      <button
                        onClick={() => clockOut(entry.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          padding: '6px 12px',
                          backgroundColor: '#8b5a5a',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: '500',
                          cursor: 'pointer'
                        }}
                      >
                        <Square size={14} />
                        Clock Out
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Clock In Form */}
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <select
              id="quick-employee"
              style={{
                padding: '10px 12px',
                borderRadius: '8px',
                border: `1px solid ${theme.border}`,
                backgroundColor: theme.bg,
                color: theme.text,
                fontSize: '14px',
                minWidth: '200px'
              }}
            >
              <option value="">Select Employee</option>
              {activeEmployees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.name}
                </option>
              ))}
            </select>

            <select
              id="quick-job"
              style={{
                padding: '10px 12px',
                borderRadius: '8px',
                border: `1px solid ${theme.border}`,
                backgroundColor: theme.bg,
                color: theme.text,
                fontSize: '14px',
                minWidth: '200px'
              }}
            >
              <option value="">Select Job</option>
              {activeJobs.map(job => (
                <option key={job.id} value={job.id}>
                  {job.job_title || `Job #${job.job_id}`}
                </option>
              ))}
            </select>

            <button
              onClick={() => {
                const empSelect = document.getElementById('quick-employee')
                const jobSelect = document.getElementById('quick-job')
                if (empSelect.value && jobSelect.value) {
                  clockIn(empSelect.value, jobSelect.value)
                } else {
                  alert('Please select an employee and job')
                }
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 20px',
                backgroundColor: '#4a7c59',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              <Play size={16} />
              Clock In
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '20px',
        flexWrap: 'wrap'
      }}>
        <div style={{ position: 'relative', flex: '1', minWidth: '200px' }}>
          <Search size={18} style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: theme.textMuted
          }} />
          <input
            type="text"
            placeholder="Search by employee or job..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px 10px 40px',
              borderRadius: '8px',
              border: `1px solid ${theme.border}`,
              backgroundColor: theme.bgCard,
              color: theme.text,
              fontSize: '14px'
            }}
          />
        </div>

        <select
          value={filterEmployee}
          onChange={(e) => setFilterEmployee(e.target.value)}
          style={{
            padding: '10px 12px',
            borderRadius: '8px',
            border: `1px solid ${theme.border}`,
            backgroundColor: theme.bgCard,
            color: theme.text,
            fontSize: '14px',
            minWidth: '150px'
          }}
        >
          <option value="all">All Employees</option>
          {employees.map(emp => (
            <option key={emp.id} value={emp.id}>
              {emp.name}
            </option>
          ))}
        </select>

        <select
          value={filterJob}
          onChange={(e) => setFilterJob(e.target.value)}
          style={{
            padding: '10px 12px',
            borderRadius: '8px',
            border: `1px solid ${theme.border}`,
            backgroundColor: theme.bgCard,
            color: theme.text,
            fontSize: '14px',
            minWidth: '150px'
          }}
        >
          <option value="all">All Jobs</option>
          {jobs.map(job => (
            <option key={job.id} value={job.id}>
              {job.job_title || `Job #${job.job_id}`}
            </option>
          ))}
        </select>

        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          style={{
            padding: '10px 12px',
            borderRadius: '8px',
            border: `1px solid ${theme.border}`,
            backgroundColor: theme.bgCard,
            color: theme.text,
            fontSize: '14px'
          }}
        >
          <option value="all">All Categories</option>
          <option value="Regular">Regular</option>
          <option value="Overtime">Overtime</option>
          <option value="Travel">Travel</option>
          <option value="Break">Break</option>
        </select>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Calendar size={16} style={{ color: theme.textMuted }} />
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            style={{
              padding: '10px 12px',
              borderRadius: '8px',
              border: `1px solid ${theme.border}`,
              backgroundColor: theme.bgCard,
              color: theme.text,
              fontSize: '14px'
            }}
          />
          <span style={{ color: theme.textMuted }}>to</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            style={{
              padding: '10px 12px',
              borderRadius: '8px',
              border: `1px solid ${theme.border}`,
              backgroundColor: theme.bgCard,
              color: theme.text,
              fontSize: '14px'
            }}
          />
        </div>
      </div>

      {/* Time Log Table */}
      <div style={{
        backgroundColor: theme.bgCard,
        borderRadius: '12px',
        border: `1px solid ${theme.border}`,
        overflow: 'hidden'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: theme.accentBg }}>
              <th style={{
                padding: '14px 16px',
                textAlign: 'left',
                fontSize: '13px',
                fontWeight: '600',
                color: theme.textMuted,
                borderBottom: `1px solid ${theme.border}`
              }}>Date</th>
              <th style={{
                padding: '14px 16px',
                textAlign: 'left',
                fontSize: '13px',
                fontWeight: '600',
                color: theme.textMuted,
                borderBottom: `1px solid ${theme.border}`
              }}>Employee</th>
              <th style={{
                padding: '14px 16px',
                textAlign: 'left',
                fontSize: '13px',
                fontWeight: '600',
                color: theme.textMuted,
                borderBottom: `1px solid ${theme.border}`
              }}>Job</th>
              <th style={{
                padding: '14px 16px',
                textAlign: 'left',
                fontSize: '13px',
                fontWeight: '600',
                color: theme.textMuted,
                borderBottom: `1px solid ${theme.border}`
              }}>Category</th>
              <th style={{
                padding: '14px 16px',
                textAlign: 'left',
                fontSize: '13px',
                fontWeight: '600',
                color: theme.textMuted,
                borderBottom: `1px solid ${theme.border}`
              }}>Clock In</th>
              <th style={{
                padding: '14px 16px',
                textAlign: 'left',
                fontSize: '13px',
                fontWeight: '600',
                color: theme.textMuted,
                borderBottom: `1px solid ${theme.border}`
              }}>Clock Out</th>
              <th style={{
                padding: '14px 16px',
                textAlign: 'right',
                fontSize: '13px',
                fontWeight: '600',
                color: theme.textMuted,
                borderBottom: `1px solid ${theme.border}`
              }}>Hours</th>
              <th style={{
                padding: '14px 16px',
                textAlign: 'center',
                fontSize: '13px',
                fontWeight: '600',
                color: theme.textMuted,
                borderBottom: `1px solid ${theme.border}`
              }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {sortedLogs.length === 0 ? (
              <tr>
                <td colSpan="8" style={{
                  padding: '40px',
                  textAlign: 'center',
                  color: theme.textMuted
                }}>
                  No time entries found
                </td>
              </tr>
            ) : (
              sortedLogs.map(log => {
                const employee = employees.find(e => e.id === log.employee_id)
                const job = jobs.find(j => j.id === log.job_id)

                return (
                  <tr
                    key={log.id}
                    style={{
                      borderBottom: `1px solid ${theme.border}`,
                      backgroundColor: log.is_clocked_in ? 'rgba(194,139,56,0.05)' : 'transparent'
                    }}
                  >
                    <td style={{ padding: '14px 16px', fontSize: '14px', color: theme.text }}>
                      {formatDate(log.date)}
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: '14px', color: theme.text }}>
                      {employee ? `${employee?.name || ''}` : '-'}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      {job ? (
                        <span
                          onClick={() => navigate(`/jobs/${job.id}`)}
                          style={{
                            fontSize: '14px',
                            color: theme.accent,
                            cursor: 'pointer',
                            textDecoration: 'underline'
                          }}
                        >
                          {job.job_title || `Job #${job.job_id}`}
                        </span>
                      ) : (
                        <span style={{ fontSize: '14px', color: theme.textMuted }}>-</span>
                      )}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{
                        display: 'inline-block',
                        padding: '4px 10px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: '500',
                        backgroundColor: `${categoryColors[log.category] || categoryColors['Regular']}20`,
                        color: categoryColors[log.category] || categoryColors['Regular']
                      }}>
                        {log.category || 'Regular'}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: '14px', color: theme.text }}>
                      {formatTime(log.clock_in_time)}
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: '14px', color: theme.text }}>
                      {formatTime(log.clock_out_time)}
                    </td>
                    <td style={{
                      padding: '14px 16px',
                      fontSize: '14px',
                      fontWeight: '600',
                      color: theme.text,
                      textAlign: 'right'
                    }}>
                      {log.hours ? log.hours.toFixed(2) : '-'}
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                      {log.is_clocked_in ? (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '4px 10px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: '500',
                          backgroundColor: 'rgba(194,139,56,0.15)',
                          color: '#c28b38'
                        }}>
                          <span style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            backgroundColor: '#c28b38',
                            animation: 'pulse 1.5s infinite'
                          }} />
                          Working
                        </span>
                      ) : (
                        <span style={{
                          display: 'inline-block',
                          padding: '4px 10px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: '500',
                          backgroundColor: 'rgba(74,124,89,0.15)',
                          color: '#4a7c59'
                        }}>
                          Complete
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Manual Entry Modal */}
      {showModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '16px',
            padding: '24px',
            width: '100%',
            maxWidth: '500px',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <h2 style={{
              fontSize: '20px',
              fontWeight: '700',
              color: theme.text,
              marginBottom: '20px'
            }}>
              Add Time Entry
            </h2>

            <form onSubmit={handleSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: theme.textSecondary,
                    marginBottom: '6px'
                  }}>
                    Employee *
                  </label>
                  <select
                    value={formData.employee_id}
                    onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
                    required
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: `1px solid ${theme.border}`,
                      backgroundColor: theme.bg,
                      color: theme.text,
                      fontSize: '14px'
                    }}
                  >
                    <option value="">Select Employee</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: theme.textSecondary,
                    marginBottom: '6px'
                  }}>
                    Job
                  </label>
                  <select
                    value={formData.job_id}
                    onChange={(e) => setFormData({ ...formData, job_id: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: `1px solid ${theme.border}`,
                      backgroundColor: theme.bg,
                      color: theme.text,
                      fontSize: '14px'
                    }}
                  >
                    <option value="">No Job</option>
                    {jobs.map(job => (
                      <option key={job.id} value={job.id}>
                        {job.job_title || `Job #${job.job_id}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: '500',
                      color: theme.textSecondary,
                      marginBottom: '6px'
                    }}>
                      Date *
                    </label>
                    <input
                      type="date"
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      required
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: `1px solid ${theme.border}`,
                        backgroundColor: theme.bg,
                        color: theme.text,
                        fontSize: '14px'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: '500',
                      color: theme.textSecondary,
                      marginBottom: '6px'
                    }}>
                      Category
                    </label>
                    <select
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: `1px solid ${theme.border}`,
                        backgroundColor: theme.bg,
                        color: theme.text,
                        fontSize: '14px'
                      }}
                    >
                      <option value="Regular">Regular</option>
                      <option value="Overtime">Overtime</option>
                      <option value="Travel">Travel</option>
                      <option value="Break">Break</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: theme.textSecondary,
                    marginBottom: '6px'
                  }}>
                    Hours *
                  </label>
                  <input
                    type="number"
                    step="0.25"
                    min="0"
                    value={formData.hours}
                    onChange={(e) => setFormData({ ...formData, hours: e.target.value })}
                    required
                    placeholder="e.g., 8.5"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: `1px solid ${theme.border}`,
                      backgroundColor: theme.bg,
                      color: theme.text,
                      fontSize: '14px'
                    }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: '500',
                      color: theme.textSecondary,
                      marginBottom: '6px'
                    }}>
                      Clock In Time
                    </label>
                    <input
                      type="time"
                      value={formData.clock_in_time}
                      onChange={(e) => setFormData({ ...formData, clock_in_time: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: `1px solid ${theme.border}`,
                        backgroundColor: theme.bg,
                        color: theme.text,
                        fontSize: '14px'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: '500',
                      color: theme.textSecondary,
                      marginBottom: '6px'
                    }}>
                      Clock Out Time
                    </label>
                    <input
                      type="time"
                      value={formData.clock_out_time}
                      onChange={(e) => setFormData({ ...formData, clock_out_time: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: `1px solid ${theme.border}`,
                        backgroundColor: theme.bg,
                        color: theme.text,
                        fontSize: '14px'
                      }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: theme.textSecondary,
                    marginBottom: '6px'
                  }}>
                    Notes
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={3}
                    placeholder="Optional notes about this time entry..."
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: `1px solid ${theme.border}`,
                      backgroundColor: theme.bg,
                      color: theme.text,
                      fontSize: '14px',
                      resize: 'vertical'
                    }}
                  />
                </div>
              </div>

              <div style={{
                display: 'flex',
                gap: '12px',
                marginTop: '24px',
                justifyContent: 'flex-end'
              }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: theme.bg,
                    color: theme.text,
                    border: `1px solid ${theme.border}`,
                    borderRadius: '8px',
                    fontSize: '14px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '10px 20px',
                    backgroundColor: theme.accent,
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  Add Entry
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Pulse animation style */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}
