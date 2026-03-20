import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { APPOINTMENT_STATUS } from '../lib/schema'
import { SOURCE_COLORS, normalizeAppointment, normalizeJob, normalizeGoogleEvent } from '../lib/calendarUtils'
import { Plus, X, Trash2, Upload, Download, ChevronLeft, ChevronRight, RefreshCw, Calendar, Unlink } from 'lucide-react'
import ImportExportModal, { exportToCSV } from '../components/ImportExportModal'
import { appointmentsFields } from '../lib/importExportFields'
import { isAdmin as checkAdmin } from '../lib/accessControl'

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

// Helper to get week start (Sunday)
const getWeekStart = (date) => {
  const d = new Date(date)
  d.setDate(d.getDate() - d.getDay())
  d.setHours(0, 0, 0, 0)
  return d
}

const getWeekDays = (weekStart) => {
  const days = []
  for (let i = 0; i < 7; i++) {
    const day = new Date(weekStart)
    day.setDate(day.getDate() + i)
    days.push(day)
  }
  return days
}

const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

const formatTime = (date) => {
  if (!date) return ''
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

const formatHour = (hour) => {
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const h = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour)
  return `${h} ${ampm}`
}

const isToday = (date) => date.toDateString() === new Date().toDateString()

export default function Appointments() {
  const navigate = useNavigate()
  const companyId = useStore((s) => s.companyId)
  const user = useStore((s) => s.user)
  const leads = useStore((s) => s.leads)
  const customers = useStore((s) => s.customers)
  const employees = useStore((s) => s.employees)
  const fetchAppointments = useStore((s) => s.fetchAppointments)
  const createAppointment = useStore((s) => s.createAppointment)
  const updateAppointment = useStore((s) => s.updateAppointment)
  const deleteAppointment = useStore((s) => s.deleteAppointment)
  const storeAppointments = useStore((s) => s.appointments)
  const storeJobs = useStore((s) => s.jobs)

  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  // State
  const [showModal, setShowModal] = useState(false)
  const [showImportExport, setShowImportExport] = useState(false)
  const [editingAppointment, setEditingAppointment] = useState(null)
  const [formData, setFormData] = useState(emptyAppointment)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Calendar state
  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewMode, setViewMode] = useState('month')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [employeeFilter, setEmployeeFilter] = useState('all')

  // Google Calendar state
  const [gcalConnected, setGcalConnected] = useState(false)
  const [gcalEvents, setGcalEvents] = useState([])
  const [gcalLoading, setGcalLoading] = useState(false)
  const [gcalToken, setGcalToken] = useState(null)
  const [connectedEmployees, setConnectedEmployees] = useState([]) // employees with connected Google Calendars

  const isAdmin = checkAdmin(user)

  useEffect(() => {
    if (!companyId) navigate('/')
  }, [companyId, navigate])

  // ─── Google Calendar: Check connection status + fetch all connected employees ───
  useEffect(() => {
    if (!user?.id || !companyId) return
    const checkGcal = async () => {
      // Check current user's connection
      const { data } = await supabase
        .from('google_calendar_tokens')
        .select('*')
        .eq('employee_id', user.id)
        .eq('status', 'active')
        .maybeSingle()

      if (data) {
        setGcalConnected(true)
        setGcalToken(data)
      } else {
        setGcalConnected(false)
        setGcalToken(null)
      }

      // Fetch all employees with connected Google Calendars for this company
      const { data: allTokens } = await supabase
        .from('google_calendar_tokens')
        .select('employee_id')
        .eq('company_id', companyId)
        .eq('status', 'active')

      if (allTokens) {
        const connectedIds = allTokens.map(t => t.employee_id)
        setConnectedEmployees(employees.filter(e => connectedIds.includes(e.id)))
      }
    }
    checkGcal()
  }, [user?.id, companyId, employees])

  // ─── Google Calendar: Fetch events ───
  const fetchGcalEvents = useCallback(async () => {
    if (!gcalConnected || !gcalToken) return

    setGcalLoading(true)

    let accessToken = gcalToken.access_token
    const isExpired = gcalToken.token_expires_at && new Date(gcalToken.token_expires_at) < new Date()

    // Refresh if expired
    if (isExpired) {
      try {
        const res = await supabase.functions.invoke('google-calendar-token', {
          body: { action: 'refresh', employee_id: user.id }
        })
        if (res.data?.access_token) {
          accessToken = res.data.access_token
          setGcalToken(prev => ({ ...prev, access_token: accessToken, token_expires_at: res.data.expires_at }))
        } else {
          setGcalConnected(false)
          setGcalToken(null)
          setGcalLoading(false)
          return
        }
      } catch {
        setGcalLoading(false)
        return
      }
    }

    // Calculate time range
    let timeMin, timeMax
    if (viewMode === 'week') {
      timeMin = getWeekStart(currentDate)
      timeMax = new Date(timeMin)
      timeMax.setDate(timeMax.getDate() + 7)
    } else {
      timeMin = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1)
      timeMax = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59)
    }

    try {
      const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?` +
        `timeMin=${timeMin.toISOString()}&timeMax=${timeMax.toISOString()}&singleEvents=true&orderBy=startTime&maxResults=250`
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` }
      })

      if (res.status === 401) {
        // Token expired, try refresh
        const refreshRes = await supabase.functions.invoke('google-calendar-token', {
          body: { action: 'refresh', employee_id: user.id }
        })
        if (refreshRes.data?.expired) {
          setGcalConnected(false)
          setGcalToken(null)
        }
        setGcalLoading(false)
        return
      }

      const data = await res.json()
      setGcalEvents((data.items || []).filter(e => e.status !== 'cancelled'))
    } catch (e) {
      console.warn('Failed to fetch Google Calendar events:', e)
    }

    setGcalLoading(false)
  }, [gcalConnected, gcalToken, currentDate, viewMode, user?.id])

  useEffect(() => {
    fetchGcalEvents()
  }, [fetchGcalEvents])

  const handleConnectGoogle = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin + '/auth/callback?gcal_connect=true',
        scopes: 'https://www.googleapis.com/auth/calendar.events.readonly',
        queryParams: { access_type: 'offline', prompt: 'consent' }
      }
    })
    if (error) console.error('Google OAuth error:', error)
  }

  const handleDisconnectGoogle = async () => {
    if (!confirm('Disconnect Google Calendar?')) return
    await supabase.functions.invoke('google-calendar-token', {
      body: { action: 'disconnect', employee_id: user.id }
    })
    setGcalConnected(false)
    setGcalToken(null)
    setGcalEvents([])
  }

  // ─── Normalize all events ───
  const normalizedAppointments = (storeAppointments || [])
    .filter(a => a.start_time)
    .map(normalizeAppointment)

  const normalizedJobs = (storeJobs || [])
    .filter(j => j.start_date)
    .map(normalizeJob)

  const normalizedGcal = gcalEvents.map(normalizeGoogleEvent)

  // Merge all events
  let allEvents = []
  if (sourceFilter === 'all' || sourceFilter === 'appointment') allEvents.push(...normalizedAppointments)
  if (sourceFilter === 'all' || sourceFilter === 'job') allEvents.push(...normalizedJobs)
  if (sourceFilter === 'all' || sourceFilter === 'google') allEvents.push(...normalizedGcal)

  // Employee filter — "all" shows everything, selecting an employee scopes to their events
  if (employeeFilter !== 'all') {
    const empId = employeeFilter === 'my' ? user?.id : parseInt(employeeFilter)
    const emp = employees.find(e => e.id === empId)
    const empName = emp?.name?.toLowerCase() || ''
    allEvents = allEvents.filter(evt => {
      if (evt.source === 'appointment') {
        return evt.meta?.setter_id === empId || evt.meta?.employee_id === empId || evt.meta?.salesperson_id === empId
      }
      if (evt.source === 'job') {
        return evt.meta?.salesperson_id === empId ||
          (empName && evt.meta?.assigned_team?.toLowerCase().includes(empName))
      }
      if (evt.source === 'google') {
        const connectedIds = connectedEmployees.map(e => e.id)
        return connectedIds.includes(empId) ? empId === user?.id : false
      }
      return true
    })
  }

  // ─── Calendar helpers ───
  const getEventsForDate = (date) => {
    return allEvents.filter(evt => {
      if (!evt.start) return false
      return evt.start.getFullYear() === date.getFullYear() &&
             evt.start.getMonth() === date.getMonth() &&
             evt.start.getDate() === date.getDate()
    })
  }

  const getEventsForSlot = (date, hour) => {
    return allEvents.filter(evt => {
      if (!evt.start) return false
      return evt.start.toDateString() === date.toDateString() && evt.start.getHours() === hour
    })
  }

  // Navigation
  const goToToday = () => setCurrentDate(new Date())
  const goPrev = () => {
    if (viewMode === 'week') {
      setCurrentDate(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n })
    } else {
      setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))
    }
  }
  const goNext = () => {
    if (viewMode === 'week') {
      setCurrentDate(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n })
    } else {
      setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))
    }
  }

  const handleRefresh = async () => {
    await fetchAppointments()
    if (gcalConnected) fetchGcalEvents()
  }

  // ─── Modal helpers ───
  const formatDateTimeLocal = (date) => {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    const h = String(date.getHours()).padStart(2, '0')
    const min = String(date.getMinutes()).padStart(2, '0')
    return `${y}-${m}-${d}T${h}:${min}`
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

    if (!editingAppointment) {
      payload.setter_id = user?.id || null
    }

    try {
      if (editingAppointment) {
        await updateAppointment(editingAppointment.id, payload)
      } else {
        await createAppointment(payload)
      }
    } catch (e) {
      setError(e.message)
      setLoading(false)
      return
    }

    await fetchAppointments()
    closeModal()
    setLoading(false)
  }

  const handleDelete = async (apt) => {
    if (!confirm(`Delete appointment "${apt.title}"?`)) return
    await deleteAppointment(apt.id)
    await fetchAppointments()
    closeModal()
  }

  // ─── Event click handler ───
  const handleEventClick = (evt) => {
    if (evt.source === 'appointment') {
      openEditModal(evt.meta)
    } else if (evt.source === 'job') {
      navigate(`/jobs/${evt.meta.id}`)
    } else if (evt.source === 'google') {
      const link = evt.meta.htmlLink
      if (link) window.open(link, '_blank')
    }
  }

  // ─── Counts ───
  const aptCount = normalizedAppointments.length
  const jobCount = normalizedJobs.length
  const gcalCount = normalizedGcal.length
  const totalCount = aptCount + jobCount + gcalCount

  // ─── Calendar data ───
  const weekStart = getWeekStart(currentDate)
  const weekDays = getWeekDays(weekStart)
  const hours = Array.from({ length: 12 }, (_, i) => i + 7) // 7AM-6PM

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()
  const firstDayOfMonth = new Date(year, month, 1)
  const lastDayOfMonth = new Date(year, month + 1, 0)
  const startDay = firstDayOfMonth.getDay()
  const daysInMonth = lastDayOfMonth.getDate()
  const calendarDays = []
  for (let i = 0; i < startDay; i++) calendarDays.push(null)
  for (let day = 1; day <= daysInMonth; day++) calendarDays.push(day)

  // ─── Styles ───
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

  const pillBtn = (active, color) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 14px',
    borderRadius: '20px',
    border: active ? 'none' : `1px solid ${theme.border}`,
    backgroundColor: active ? (color || theme.accent) : 'transparent',
    color: active ? '#fff' : theme.textSecondary,
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    whiteSpace: 'nowrap'
  })

  const viewBtn = (active) => ({
    padding: '6px 14px',
    borderRadius: '8px',
    border: `1px solid ${theme.border}`,
    backgroundColor: active ? theme.accent : 'transparent',
    color: active ? '#fff' : theme.textSecondary,
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer'
  })

  // ─── Event chip renderer ───
  const renderEventChip = (evt, compact = false) => {
    return (
      <div
        key={evt.id}
        onClick={(e) => { e.stopPropagation(); handleEventClick(evt) }}
        style={{
          backgroundColor: evt.color + '18',
          borderLeft: `3px solid ${evt.color}`,
          color: theme.text,
          fontSize: compact ? '10px' : '11px',
          padding: compact ? '2px 4px' : '4px 6px',
          borderRadius: '4px',
          cursor: 'pointer',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          marginBottom: '2px'
        }}
        title={`${evt.start ? formatTime(evt.start) : ''} ${evt.title}${evt.location ? ' - ' + evt.location : ''}`}
      >
        {!compact && evt.start && !evt.allDay && (
          <span style={{ fontWeight: '600', marginRight: '4px', color: evt.color }}>{formatTime(evt.start)}</span>
        )}
        <span>{evt.title}</span>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px', maxWidth: '100%', overflowX: 'hidden' }}>
      {/* Header Row 1 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '16px',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>Calendar</h1>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={() => setShowImportExport(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', backgroundColor: 'transparent', color: theme.accent, border: `1px solid ${theme.border}`, borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>
            <Upload size={18} /> Import
          </button>
          <button onClick={() => exportToCSV(storeAppointments || [], appointmentsFields, 'appointments_export')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', backgroundColor: 'transparent', color: theme.textSecondary, border: `1px solid ${theme.border}`, borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>
            <Download size={18} /> Export
          </button>
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

      {/* Header Row 2: Source pills + Employee filter + View toggle */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '12px',
        flexWrap: 'wrap',
        gap: '8px'
      }}>
        {/* Source filter pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <button onClick={() => setSourceFilter('all')} style={pillBtn(sourceFilter === 'all', theme.accent)}>
            <span>All</span>
            <span style={{ fontSize: '11px', opacity: 0.8 }}>({totalCount})</span>
          </button>
          <button onClick={() => setSourceFilter('appointment')} style={pillBtn(sourceFilter === 'appointment', SOURCE_COLORS.appointment.bg)}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: sourceFilter === 'appointment' ? '#fff' : SOURCE_COLORS.appointment.bg, flexShrink: 0 }} />
            <span>Appointments</span>
            <span style={{ fontSize: '11px', opacity: 0.8 }}>({aptCount})</span>
          </button>
          <button onClick={() => setSourceFilter('job')} style={pillBtn(sourceFilter === 'job', SOURCE_COLORS.job.bg)}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: sourceFilter === 'job' ? '#fff' : SOURCE_COLORS.job.bg, flexShrink: 0 }} />
            <span>Jobs</span>
            <span style={{ fontSize: '11px', opacity: 0.8 }}>({jobCount})</span>
          </button>
          {gcalConnected ? (
            <button onClick={() => setSourceFilter('google')} style={pillBtn(sourceFilter === 'google', SOURCE_COLORS.google.bg)}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: sourceFilter === 'google' ? '#fff' : SOURCE_COLORS.google.bg, flexShrink: 0 }} />
              <span>Google Calendar</span>
              <span style={{ fontSize: '11px', opacity: 0.8 }}>({gcalCount})</span>
            </button>
          ) : (
            <button onClick={handleConnectGoogle} style={{ ...pillBtn(false), gap: '4px', borderStyle: 'dashed' }}>
              <Calendar size={14} />
              <span>Connect Google</span>
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Employee filter */}
          <select
            value={employeeFilter}
            onChange={(e) => setEmployeeFilter(e.target.value)}
            style={{ ...inputStyle, width: 'auto', minWidth: '160px', padding: '6px 10px', fontSize: '13px' }}
          >
            <option value="all">All Calendars</option>
            <option value="my">My Events</option>
            {(isAdmin ? employees : connectedEmployees).map(emp => {
              if (emp.id === user?.id) return null
              const hasGcal = connectedEmployees.some(ce => ce.id === emp.id)
              return (
                <option key={emp.id} value={emp.id}>
                  {emp.name}{hasGcal ? ' (cal)' : ''}
                </option>
              )
            })}
          </select>

          {/* View toggle */}
          <div style={{ display: 'flex', gap: '2px' }}>
            <button onClick={() => setViewMode('week')} style={viewBtn(viewMode === 'week')}>Week</button>
            <button onClick={() => setViewMode('month')} style={viewBtn(viewMode === 'month')}>Month</button>
          </div>
        </div>
      </div>

      {/* Header Row 3: Today / Nav / Title / Actions */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '16px',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={goToToday} style={{ padding: '6px 14px', backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '8px', fontSize: '13px', color: theme.text, cursor: 'pointer' }}>Today</button>
          <button onClick={goPrev} style={{ padding: '6px 8px', backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '8px', cursor: 'pointer', color: theme.textSecondary }}><ChevronLeft size={18} /></button>
          <button onClick={goNext} style={{ padding: '6px 8px', backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '8px', cursor: 'pointer', color: theme.textSecondary }}><ChevronRight size={18} /></button>
        </div>

        <span style={{ fontSize: '16px', fontWeight: '600', color: theme.text }}>
          {viewMode === 'week'
            ? `${monthNames[weekStart.getMonth()]} ${weekStart.getDate()} - ${weekDays[6].getDate()}, ${weekStart.getFullYear()}`
            : `${monthNames[month]} ${year}`
          }
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={handleRefresh} style={{ padding: '6px 8px', backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '8px', cursor: 'pointer', color: theme.textSecondary }} title="Refresh">
            <RefreshCw size={16} />
          </button>
          {gcalConnected && (
            <button onClick={handleDisconnectGoogle} style={{ padding: '6px 8px', backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '8px', cursor: 'pointer', color: theme.textMuted, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }} title="Disconnect Google Calendar">
              <Unlink size={14} />
            </button>
          )}
        </div>
      </div>

      {/* ═══════════ WEEK VIEW ═══════════ */}
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
                }}>Time</th>
                {weekDays.map((day, i) => (
                  <th key={i} style={{
                    padding: '12px 8px',
                    borderBottom: `1px solid ${theme.border}`,
                    borderLeft: `1px solid ${theme.border}`,
                    backgroundColor: isToday(day) ? theme.accentBg : theme.bg,
                    textAlign: 'center'
                  }}>
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>{dayNames[i]}</div>
                    <div style={{ fontSize: '16px', fontWeight: isToday(day) ? '700' : '500', color: isToday(day) ? theme.accent : theme.text }}>{day.getDate()}</div>
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
                  }}>{formatHour(hour)}</td>
                  {weekDays.map((day, i) => {
                    const slotEvents = getEventsForSlot(day, hour)
                    return (
                      <td
                        key={i}
                        onClick={() => openAddModal(day, hour)}
                        style={{
                          padding: '2px',
                          borderBottom: `1px solid ${theme.border}`,
                          borderLeft: `1px solid ${theme.border}`,
                          height: '50px',
                          verticalAlign: 'top',
                          backgroundColor: isToday(day) ? 'rgba(90,99,73,0.04)' : 'transparent',
                          cursor: 'pointer'
                        }}
                      >
                        {slotEvents.map(evt => renderEventChip(evt, true))}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ═══════════ MONTH VIEW ═══════════ */}
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
              }}>{day}</div>
            ))}
          </div>

          {/* Calendar Days */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
            {calendarDays.map((day, index) => {
              const dayDate = day ? new Date(year, month, day) : null
              const dayEvents = dayDate ? getEventsForDate(dayDate) : []

              return (
                <div
                  key={index}
                  onClick={() => dayDate && openAddModal(dayDate, 9)}
                  style={{
                    minHeight: '100px',
                    borderBottom: `1px solid ${theme.border}`,
                    borderRight: (index + 1) % 7 !== 0 ? `1px solid ${theme.border}` : 'none',
                    padding: '8px',
                    backgroundColor: day
                      ? (dayDate && isToday(dayDate) ? 'rgba(90,99,73,0.08)' : 'transparent')
                      : theme.bg,
                    cursor: day ? 'pointer' : 'default'
                  }}
                >
                  {day && (
                    <>
                      <div style={{
                        fontSize: '14px',
                        fontWeight: isToday(dayDate) ? '600' : '500',
                        color: isToday(dayDate) ? theme.accent : theme.text,
                        marginBottom: '6px'
                      }}>{day}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        {dayEvents.slice(0, 3).map(evt => renderEventChip(evt))}
                        {dayEvents.length > 3 && (
                          <div style={{ fontSize: '11px', color: theme.textMuted, padding: '2px 4px' }}>
                            +{dayEvents.length - 3} more
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
        gap: '20px',
        marginTop: '12px',
        flexWrap: 'wrap',
        justifyContent: 'center'
      }}>
        {Object.entries(SOURCE_COLORS).map(([key, val]) => (
          (key !== 'google' || gcalConnected) && (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: val.bg }} />
              <span style={{ fontSize: '12px', color: theme.textMuted }}>{val.label}</span>
            </div>
          )
        ))}
      </div>

      {/* ═══════════ APPOINTMENT MODAL ═══════════ */}
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

      {showImportExport && (
        <ImportExportModal
          tableName="appointments"
          entityName="Appointments"
          fields={appointmentsFields}
          companyId={companyId}
          requiredField="title"
          defaultValues={{ company_id: companyId, status: 'Scheduled' }}
          onImportComplete={() => fetchAppointments()}
          onClose={() => setShowImportExport(false)}
        />
      )}
    </div>
  )
}
