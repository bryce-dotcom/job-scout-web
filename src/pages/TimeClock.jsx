import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import {
  Clock, Play, Square, Coffee, MapPin, Calendar, AlertTriangle,
  Plus, X, ChevronRight
} from 'lucide-react'

const AVATAR_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e'
]

export default function TimeClock() {
  const { theme } = useTheme()
  const companyId = useStore((state) => state.companyId)
  const user = useStore((state) => state.user)
  const employees = useStore((state) => state.employees)

  const [timeEntries, setTimeEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [showPTOModal, setShowPTOModal] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [ptoForm, setPtoForm] = useState({
    start_date: '',
    end_date: '',
    request_type: 'pto',
    reason: ''
  })
  const [savingPTO, setSavingPTO] = useState(false)

  // Update current time every second
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (companyId) fetchTimeEntries()
  }, [companyId])

  const fetchTimeEntries = async () => {
    setLoading(true)
    try {
      // Get entries from last 7 days
      const weekAgo = new Date()
      weekAgo.setDate(weekAgo.getDate() - 7)

      const { data, error } = await supabase
        .from('time_clock')
        .select('*')
        .eq('company_id', companyId)
        .gte('clock_in', weekAgo.toISOString())
        .order('clock_in', { ascending: false })

      if (error) throw error
      setTimeEntries(data || [])
    } catch (err) {
      console.error('Error fetching time entries:', err)
    } finally {
      setLoading(false)
    }
  }

  const getLocation = () => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ lat: null, lng: null, address: null })
        return
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords
          // Reverse geocode using OpenStreetMap Nominatim
          try {
            const res = await fetch(
              `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
            )
            const data = await res.json()
            resolve({
              lat: latitude,
              lng: longitude,
              address: data.display_name || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
            })
          } catch {
            resolve({
              lat: latitude,
              lng: longitude,
              address: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
            })
          }
        },
        () => resolve({ lat: null, lng: null, address: null }),
        { timeout: 10000 }
      )
    })
  }

  const handleClockIn = async (employeeId) => {
    const location = await getLocation()

    try {
      const { error } = await supabase.from('time_clock').insert({
        company_id: companyId,
        employee_id: employeeId,
        clock_in: new Date().toISOString(),
        clock_in_lat: location.lat,
        clock_in_lng: location.lng,
        clock_in_address: location.address
      })

      if (error) throw error
      await fetchTimeEntries()
    } catch (err) {
      alert('Error clocking in: ' + err.message)
    }
  }

  const handleClockOut = async (entryId) => {
    const location = await getLocation()
    const entry = timeEntries.find(e => e.id === entryId)
    if (!entry) return

    const clockIn = new Date(entry.clock_in)
    const clockOut = new Date()
    let totalHours = (clockOut - clockIn) / (1000 * 60 * 60)

    // Subtract lunch if taken
    if (entry.lunch_start && entry.lunch_end) {
      const lunchDuration = (new Date(entry.lunch_end) - new Date(entry.lunch_start)) / (1000 * 60 * 60)
      totalHours -= lunchDuration
    }

    try {
      const { error } = await supabase
        .from('time_clock')
        .update({
          clock_out: clockOut.toISOString(),
          clock_out_lat: location.lat,
          clock_out_lng: location.lng,
          clock_out_address: location.address,
          total_hours: Math.round(totalHours * 100) / 100
        })
        .eq('id', entryId)

      if (error) throw error
      await fetchTimeEntries()
    } catch (err) {
      alert('Error clocking out: ' + err.message)
    }
  }

  const handleLunchStart = async (entryId) => {
    try {
      const { error } = await supabase
        .from('time_clock')
        .update({ lunch_start: new Date().toISOString() })
        .eq('id', entryId)

      if (error) throw error
      await fetchTimeEntries()
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  const handleLunchEnd = async (entryId) => {
    try {
      const { error } = await supabase
        .from('time_clock')
        .update({ lunch_end: new Date().toISOString() })
        .eq('id', entryId)

      if (error) throw error
      await fetchTimeEntries()
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  const handlePTOSubmit = async (e) => {
    e.preventDefault()
    if (!selectedEmployee) return
    setSavingPTO(true)

    try {
      const { error } = await supabase.from('time_off_requests').insert({
        company_id: companyId,
        employee_id: selectedEmployee.id,
        start_date: ptoForm.start_date,
        end_date: ptoForm.end_date,
        request_type: ptoForm.request_type,
        reason: ptoForm.reason,
        status: 'pending'
      })

      if (error) throw error

      setShowPTOModal(false)
      setPtoForm({ start_date: '', end_date: '', request_type: 'pto', reason: '' })
      setSelectedEmployee(null)
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setSavingPTO(false)
    }
  }

  const getActiveEntry = (employeeId) => {
    return timeEntries.find(e => e.employee_id === employeeId && !e.clock_out)
  }

  const getWeekTotal = (employeeId) => {
    return timeEntries
      .filter(e => e.employee_id === employeeId && e.total_hours)
      .reduce((sum, e) => sum + (e.total_hours || 0), 0)
  }

  const getRecentSessions = (employeeId) => {
    return timeEntries
      .filter(e => e.employee_id === employeeId && e.clock_out)
      .slice(0, 3)
  }

  const formatElapsedTime = (clockIn) => {
    const start = new Date(clockIn)
    const diff = Math.floor((currentTime - start) / 1000)
    const hours = Math.floor(diff / 3600)
    const minutes = Math.floor((diff % 3600) / 60)
    const seconds = diff % 60
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`
  }

  const formatDuration = (hours) => {
    if (!hours) return '0h 0m'
    const h = Math.floor(hours)
    const m = Math.round((hours - h) * 60)
    return `${h}h ${m}m`
  }

  const getAvatarColor = (name) => {
    let hash = 0
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
  }

  const calculateBusinessDays = (start, end) => {
    if (!start || !end) return 0
    const startDate = new Date(start)
    const endDate = new Date(end)
    let count = 0
    const current = new Date(startDate)
    while (current <= endDate) {
      const day = current.getDay()
      if (day !== 0 && day !== 6) count++
      current.setDate(current.getDate() + 1)
    }
    return count
  }

  if (loading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: theme.textMuted }}>
        Loading...
      </div>
    )
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px'
      }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text, marginBottom: '4px' }}>
            Time Clock
          </h1>
          <p style={{ color: theme.textMuted, fontSize: '14px' }}>
            {currentTime.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div style={{
          fontSize: '32px',
          fontWeight: '700',
          fontFamily: 'monospace',
          color: theme.accent
        }}>
          {currentTime.toLocaleTimeString()}
        </div>
      </div>

      {/* Employee Cards Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: '20px'
      }}>
        {employees.filter(e => e.active).map(employee => {
          const activeEntry = getActiveEntry(employee.id)
          const weekTotal = getWeekTotal(employee.id)
          const recentSessions = getRecentSessions(employee.id)
          const isClockedIn = !!activeEntry
          const isOnLunch = activeEntry?.lunch_start && !activeEntry?.lunch_end

          // Calculate elapsed hours for progress bar
          let elapsedHours = 0
          if (activeEntry) {
            elapsedHours = (currentTime - new Date(activeEntry.clock_in)) / (1000 * 60 * 60)
          }

          return (
            <div
              key={employee.id}
              style={{
                backgroundColor: theme.bgCard,
                border: `1px solid ${theme.border}`,
                borderRadius: '16px',
                padding: '20px',
                boxShadow: isClockedIn ? '0 0 30px rgba(34,197,94,0.2)' : theme.shadow,
                transition: 'all 0.3s ease'
              }}
            >
              {/* Employee Header */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '16px'
              }}>
                {/* Avatar */}
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  backgroundColor: getAvatarColor(employee.name || employee.email),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  fontWeight: '600',
                  fontSize: '18px',
                  position: 'relative'
                }}>
                  {(employee.name || employee.email).charAt(0).toUpperCase()}
                  {/* Status indicator */}
                  <div style={{
                    position: 'absolute',
                    bottom: '-2px',
                    right: '-2px',
                    width: '14px',
                    height: '14px',
                    borderRadius: '50%',
                    backgroundColor: isClockedIn ? '#22c55e' : '#71717a',
                    border: '2px solid ' + theme.bgCard,
                    animation: isClockedIn ? 'pulse 2s infinite' : 'none'
                  }} />
                </div>

                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '600', color: theme.text }}>
                    {employee.name || employee.email}
                  </div>
                  <div style={{ fontSize: '13px', color: theme.textMuted }}>
                    {employee.role || 'Employee'}
                  </div>
                </div>

                {/* Week total */}
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '12px', color: theme.textMuted }}>This Week</div>
                  <div style={{ fontWeight: '600', color: theme.text }}>
                    {formatDuration(weekTotal)}
                  </div>
                </div>
              </div>

              {/* PTO Balance Badge */}
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                backgroundColor: 'rgba(139, 92, 246, 0.1)',
                borderRadius: '20px',
                fontSize: '12px',
                color: '#8b5cf6',
                marginBottom: '16px'
              }}>
                <Calendar size={12} />
                PTO: {employee.pto_accrued - (employee.pto_used || 0) || 0} days
              </div>

              {/* Timer / Clock In Area */}
              {isClockedIn ? (
                <div>
                  {/* Timer Display */}
                  <div style={{
                    textAlign: 'center',
                    marginBottom: '16px'
                  }}>
                    <div style={{
                      fontSize: '48px',
                      fontWeight: '900',
                      fontFamily: 'monospace',
                      color: isOnLunch ? '#eab308' : '#22c55e',
                      lineHeight: 1
                    }}>
                      {formatElapsedTime(activeEntry.clock_in)}
                    </div>
                    {isOnLunch && (
                      <div style={{
                        fontSize: '14px',
                        color: '#eab308',
                        marginTop: '4px'
                      }}>
                        On Lunch Break
                      </div>
                    )}
                  </div>

                  {/* Progress Bar */}
                  <div style={{
                    height: '8px',
                    backgroundColor: theme.border,
                    borderRadius: '4px',
                    marginBottom: '16px',
                    overflow: 'hidden'
                  }}>
                    <div style={{
                      width: `${Math.min(elapsedHours / 8 * 100, 100)}%`,
                      height: '100%',
                      backgroundColor: elapsedHours > 8 ? '#ef4444' : '#22c55e',
                      borderRadius: '4px',
                      transition: 'width 1s linear'
                    }} />
                  </div>

                  {/* Warnings */}
                  {elapsedHours > 8 && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                      borderRadius: '8px',
                      color: '#ef4444',
                      fontSize: '13px',
                      marginBottom: '12px'
                    }}>
                      <AlertTriangle size={16} />
                      Over 8 hours!
                    </div>
                  )}

                  {elapsedHours > 5 && !activeEntry.lunch_start && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '8px 12px',
                      backgroundColor: 'rgba(234, 179, 8, 0.1)',
                      borderRadius: '8px',
                      color: '#eab308',
                      fontSize: '13px',
                      marginBottom: '12px'
                    }}>
                      <Coffee size={16} />
                      Take a lunch break!
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div style={{ display: 'flex', gap: '10px' }}>
                    {/* Lunch Button */}
                    {!isOnLunch ? (
                      <button
                        onClick={() => handleLunchStart(activeEntry.id)}
                        disabled={!!activeEntry.lunch_end}
                        style={{
                          flex: 1,
                          padding: '12px',
                          backgroundColor: activeEntry.lunch_end ? theme.border : 'rgba(234, 179, 8, 0.15)',
                          border: 'none',
                          borderRadius: '10px',
                          color: activeEntry.lunch_end ? theme.textMuted : '#eab308',
                          fontSize: '14px',
                          fontWeight: '600',
                          cursor: activeEntry.lunch_end ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px'
                        }}
                      >
                        <Coffee size={18} />
                        {activeEntry.lunch_end ? 'Lunch Done' : 'Start Lunch'}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleLunchEnd(activeEntry.id)}
                        style={{
                          flex: 1,
                          padding: '12px',
                          background: 'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)',
                          border: 'none',
                          borderRadius: '10px',
                          color: '#fff',
                          fontSize: '14px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '8px'
                        }}
                      >
                        <Coffee size={18} />
                        End Lunch
                      </button>
                    )}

                    {/* Clock Out Button */}
                    <button
                      onClick={() => handleClockOut(activeEntry.id)}
                      style={{
                        flex: 1,
                        padding: '12px',
                        background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                        border: 'none',
                        borderRadius: '10px',
                        color: '#fff',
                        fontSize: '14px',
                        fontWeight: '600',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px'
                      }}
                    >
                      <Square size={18} />
                      Clock Out
                    </button>
                  </div>

                  {/* Location */}
                  {activeEntry.clock_in_address && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      marginTop: '12px',
                      fontSize: '12px',
                      color: theme.textMuted
                    }}>
                      <MapPin size={12} />
                      <span style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {activeEntry.clock_in_address}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  {/* Clock In Button */}
                  <button
                    onClick={() => handleClockIn(employee.id)}
                    style={{
                      width: '100%',
                      padding: '20px',
                      background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                      border: 'none',
                      borderRadius: '12px',
                      color: '#fff',
                      fontSize: '18px',
                      fontWeight: '700',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '10px',
                      marginBottom: '12px'
                    }}
                  >
                    <Play size={24} />
                    Clock In
                  </button>

                  {/* PTO Request Button */}
                  <button
                    onClick={() => { setSelectedEmployee(employee); setShowPTOModal(true) }}
                    style={{
                      width: '100%',
                      padding: '12px',
                      background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                      border: 'none',
                      borderRadius: '10px',
                      color: '#fff',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px'
                    }}
                  >
                    <Calendar size={16} />
                    Request Time Off
                  </button>
                </div>
              )}

              {/* Recent Sessions */}
              {recentSessions.length > 0 && (
                <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: `1px solid ${theme.border}` }}>
                  <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '8px' }}>
                    Recent Sessions
                  </div>
                  {recentSessions.map(session => (
                    <div
                      key={session.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '8px 0',
                        fontSize: '13px'
                      }}
                    >
                      <span style={{ color: theme.textMuted }}>
                        {new Date(session.clock_in).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </span>
                      <span style={{ color: theme.text, fontWeight: '500' }}>
                        {formatDuration(session.total_hours)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* PTO Request Modal */}
      {showPTOModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '16px',
            width: '100%',
            maxWidth: '440px',
            overflow: 'hidden'
          }}>
            {/* Header */}
            <div style={{
              padding: '20px',
              borderBottom: `1px solid ${theme.border}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <div style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>
                  Request Time Off
                </div>
                <div style={{ fontSize: '13px', color: theme.textMuted }}>
                  {selectedEmployee?.name || selectedEmployee?.email}
                </div>
              </div>
              <button
                onClick={() => { setShowPTOModal(false); setSelectedEmployee(null) }}
                style={{
                  padding: '8px',
                  backgroundColor: theme.border,
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  color: theme.textMuted
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handlePTOSubmit} style={{ padding: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: theme.textMuted, marginBottom: '6px' }}>
                    Start Date
                  </label>
                  <input
                    type="date"
                    required
                    value={ptoForm.start_date}
                    onChange={(e) => setPtoForm({ ...ptoForm, start_date: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      backgroundColor: theme.bg,
                      border: `1px solid ${theme.border}`,
                      borderRadius: '8px',
                      color: theme.text,
                      fontSize: '14px'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', color: theme.textMuted, marginBottom: '6px' }}>
                    End Date
                  </label>
                  <input
                    type="date"
                    required
                    value={ptoForm.end_date}
                    onChange={(e) => setPtoForm({ ...ptoForm, end_date: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      backgroundColor: theme.bg,
                      border: `1px solid ${theme.border}`,
                      borderRadius: '8px',
                      color: theme.text,
                      fontSize: '14px'
                    }}
                  />
                </div>
              </div>

              {/* Business Days Indicator */}
              {ptoForm.start_date && ptoForm.end_date && (
                <div style={{
                  padding: '12px',
                  backgroundColor: 'rgba(139, 92, 246, 0.1)',
                  borderRadius: '8px',
                  marginBottom: '16px',
                  textAlign: 'center',
                  color: '#8b5cf6',
                  fontSize: '14px',
                  fontWeight: '600'
                }}>
                  {calculateBusinessDays(ptoForm.start_date, ptoForm.end_date)} business days
                </div>
              )}

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', color: theme.textMuted, marginBottom: '6px' }}>
                  Type
                </label>
                <select
                  value={ptoForm.request_type}
                  onChange={(e) => setPtoForm({ ...ptoForm, request_type: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    backgroundColor: theme.bg,
                    border: `1px solid ${theme.border}`,
                    borderRadius: '8px',
                    color: theme.text,
                    fontSize: '14px'
                  }}
                >
                  <option value="pto">PTO (Paid Time Off)</option>
                  <option value="sick">Sick Leave</option>
                  <option value="personal">Personal Day</option>
                  <option value="unpaid">Unpaid Leave</option>
                </select>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '13px', color: theme.textMuted, marginBottom: '6px' }}>
                  Reason (Optional)
                </label>
                <textarea
                  value={ptoForm.reason}
                  onChange={(e) => setPtoForm({ ...ptoForm, reason: e.target.value })}
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    backgroundColor: theme.bg,
                    border: `1px solid ${theme.border}`,
                    borderRadius: '8px',
                    color: theme.text,
                    fontSize: '14px',
                    resize: 'vertical'
                  }}
                />
              </div>

              <button
                type="submit"
                disabled={savingPTO}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
                  border: 'none',
                  borderRadius: '10px',
                  color: '#fff',
                  fontSize: '15px',
                  fontWeight: '600',
                  cursor: savingPTO ? 'wait' : 'pointer'
                }}
              >
                {savingPTO ? 'Submitting...' : 'Submit Request'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Pulse Animation */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  )
}
