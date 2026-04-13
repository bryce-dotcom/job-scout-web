import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { useIsMobile } from '../hooks/useIsMobile'
import { isAdmin as checkAdmin, isTeamLead as checkTeamLead } from '../lib/accessControl'
import {
  Clock, Play, Square, Coffee, MapPin, Calendar, AlertTriangle,
  Plus, X, ChevronRight, DollarSign, TrendingUp, Award
} from 'lucide-react'

const AVATAR_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e'
]

export default function TimeClock() {
  const { theme } = useTheme()
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const company = useStore((state) => state.company)
  const user = useStore((state) => state.user)
  const employees = useStore((state) => state.employees)

  // Field roles belong on FieldScout — redirect them there so they see
  // job-level clock-in, line items, payment buttons, verification, etc.
  const currentEmployee = employees.find(e => e.email === user?.email)
  const FIELD_ROLES = ['field tech', 'installer', 'project manager', 'technician', 'foreman', 'crew lead']
  const isFieldRole = currentEmployee?.role && FIELD_ROLES.includes(currentEmployee.role.toLowerCase())
  useEffect(() => {
    if (isFieldRole) navigate('/field-scout', { replace: true })
  }, [isFieldRole, navigate])

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

  // Busy guards so repeated taps on Clock In/Out don't fire duplicate DB ops.
  const [busyEmployeeIds, setBusyEmployeeIds] = useState(new Set()) // clock-in busy
  const [busyEntryIds, setBusyEntryIds] = useState(new Set())       // clock-out / lunch busy
  const [lookbackDays, setLookbackDays] = useState(14) // default 14 days for time entries

  // Pay summary data
  const [periodEntries, setPeriodEntries] = useState([])
  const [leadCommissions, setLeadCommissions] = useState([])
  const [invoices, setInvoices] = useState([])
  const [payments, setPayments] = useState([])
  const [jobs, setJobs] = useState([])
  const [payrollConfig, setPayrollConfig] = useState({
    pay_frequency: 'bi-weekly',
    pay_day_1: '20',
    pay_day_2: '5',
    commission_trigger: 'payment_received',
    overtime_threshold: 40,
    overtime_multiplier: 1.5,
  })

  const isAdmin = checkAdmin(user)
  const isTeamLeadPlus = checkTeamLead(user)

  // Update current time every second
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (companyId) {
      fetchTimeEntries()
      fetchPayData()
    }
  }, [companyId, lookbackDays])

  const fetchTimeEntries = async () => {
    // Only show the full-screen loading state on the initial fetch.
    // Subsequent fetches (e.g. after clock-in/out) refresh in-place so
    // the clock card stays visible and doesn't flicker away.
    try {
      // Get entries from last N days (configurable, default 14)
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - lookbackDays)

      const { data, error } = await supabase
        .from('time_clock')
        .select('*')
        .eq('company_id', companyId)
        .gte('clock_in', cutoff.toISOString())
        .order('clock_in', { ascending: false })

      if (error) throw error
      setTimeEntries(data || [])
    } catch (err) {
      console.error('Error fetching time entries:', err)
    } finally {
      setLoading(false)
    }
  }

  // ── Pay Period & Data ──────────────────────────────────
  const getCurrentPeriod = () => {
    const today = new Date()
    const freq = payrollConfig.pay_frequency
    let periodStart, periodEnd

    if (freq === 'weekly') {
      const day = today.getDay()
      periodStart = new Date(today)
      periodStart.setDate(today.getDate() - (day === 0 ? 6 : day - 1))
      periodEnd = new Date(periodStart)
      periodEnd.setDate(periodStart.getDate() + 6)
    } else if (freq === 'bi-weekly') {
      const day1 = parseInt(payrollConfig.pay_day_1) || 20
      const day2 = parseInt(payrollConfig.pay_day_2) || 5
      if (today.getDate() <= day2) {
        periodStart = new Date(today.getFullYear(), today.getMonth() - 1, 16)
        periodEnd = new Date(today.getFullYear(), today.getMonth(), 0)
      } else if (today.getDate() <= day1) {
        periodStart = new Date(today.getFullYear(), today.getMonth(), 1)
        periodEnd = new Date(today.getFullYear(), today.getMonth(), 15)
      } else {
        periodStart = new Date(today.getFullYear(), today.getMonth(), 16)
        periodEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      }
    } else if (freq === 'semi-monthly') {
      if (today.getDate() <= 15) {
        periodStart = new Date(today.getFullYear(), today.getMonth(), 1)
        periodEnd = new Date(today.getFullYear(), today.getMonth(), 15)
      } else {
        periodStart = new Date(today.getFullYear(), today.getMonth(), 16)
        periodEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      }
    } else {
      periodStart = new Date(today.getFullYear(), today.getMonth(), 1)
      periodEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    }
    periodStart.setHours(0, 0, 0, 0)
    periodEnd.setHours(23, 59, 59, 999)
    return { periodStart, periodEnd }
  }

  const getNextPayDate = () => {
    const today = new Date()
    const day1 = parseInt(payrollConfig.pay_day_1) || 20
    const day2 = parseInt(payrollConfig.pay_day_2) || 5
    if (payrollConfig.pay_frequency === 'weekly') {
      const daysUntilFriday = (5 - today.getDay() + 7) % 7 || 7
      const next = new Date(today)
      next.setDate(today.getDate() + daysUntilFriday)
      return next
    }
    if (today.getDate() < day2) return new Date(today.getFullYear(), today.getMonth(), day2)
    if (today.getDate() < day1) return new Date(today.getFullYear(), today.getMonth(), day1)
    return new Date(today.getFullYear(), today.getMonth() + 1, day2)
  }

  const fetchPayData = async () => {
    try {
      const { periodStart, periodEnd } = getCurrentPeriod()

      // Load payroll config
      const configPromise = supabase
        .from('settings')
        .select('value')
        .eq('company_id', companyId)
        .eq('key', 'payroll_config')
        .single()

      const [configRes, entriesRes, commRes, paymentsRes, invoicesRes, jobsRes] = await Promise.allSettled([
        configPromise,
        supabase.from('time_clock').select('*').eq('company_id', companyId)
          .gte('clock_in', periodStart.toISOString()).lte('clock_in', periodEnd.toISOString())
          .not('clock_out', 'is', null),
        supabase.from('lead_commissions').select('*').eq('company_id', companyId)
          .gte('created_at', periodStart.toISOString()).lte('created_at', periodEnd.toISOString()),
        supabase.from('payments').select('*').eq('company_id', companyId)
          .gte('date', periodStart.toISOString().split('T')[0]).lte('date', periodEnd.toISOString().split('T')[0]),
        supabase.from('invoices').select('*').eq('company_id', companyId),
        supabase.from('jobs').select('id, company_id, job_id, salesperson_id, allotted_time_hours, status, customer_name, job_title, assigned_team')
          .eq('company_id', companyId),
      ])

      if (configRes.status === 'fulfilled' && configRes.value?.data?.value) {
        try {
          const parsed = JSON.parse(configRes.value.data.value)
          setPayrollConfig(prev => ({ ...prev, ...parsed }))
        } catch {}
      }

      setPeriodEntries(entriesRes.status === 'fulfilled' ? entriesRes.value?.data || [] : [])
      setLeadCommissions(commRes.status === 'fulfilled' ? commRes.value?.data || [] : [])
      setPayments(paymentsRes.status === 'fulfilled' ? paymentsRes.value?.data || [] : [])
      setInvoices(invoicesRes.status === 'fulfilled' ? invoicesRes.value?.data || [] : [])
      setJobs(jobsRes.status === 'fulfilled' ? jobsRes.value?.data || [] : [])
    } catch (e) { /* non-critical */ }
  }

  // Sync company pay settings
  useEffect(() => {
    if (company) {
      setPayrollConfig(prev => ({
        ...prev,
        pay_frequency: company.pay_frequency || prev.pay_frequency,
        pay_day_1: company.pay_day_1 || prev.pay_day_1,
        pay_day_2: company.pay_day_2 || prev.pay_day_2,
      }))
    }
  }, [company])

  // Calculate pay for an employee
  const calculatePay = (employee) => {
    const empEntries = periodEntries.filter(e => e.employee_id === employee.id)
    const hourlyRate = employee.hourly_rate || 0
    const otMultiplier = payrollConfig.overtime_multiplier || 1.5
    const otThreshold = payrollConfig.overtime_threshold || 40

    // Hours grouped by week for overtime
    let regularHours = 0, overtimeHours = 0
    const weeklyHours = {}
    empEntries.forEach(entry => {
      const hours = getEntryHours(entry)
      if (!hours) return
      const d = new Date(entry.clock_in)
      const ws = new Date(d)
      ws.setDate(d.getDate() - d.getDay())
      const key = ws.toISOString().split('T')[0]
      weeklyHours[key] = (weeklyHours[key] || 0) + hours
    })
    Object.values(weeklyHours).forEach(h => {
      if (h <= otThreshold) { regularHours += h } else { regularHours += otThreshold; overtimeHours += h - otThreshold }
    })

    let hourlyPay = 0, salaryPay = 0
    if (employee.is_hourly) {
      hourlyPay = (regularHours * hourlyRate) + (overtimeHours * hourlyRate * otMultiplier)
    }
    if (employee.is_salary) {
      const ppy = payrollConfig.pay_frequency === 'weekly' ? 52 : payrollConfig.pay_frequency === 'bi-weekly' ? 26 : payrollConfig.pay_frequency === 'semi-monthly' ? 24 : 12
      salaryPay = (employee.annual_salary || 0) / ppy
    }

    // Invoice-based commissions
    let commissionPay = 0
    if (employee.is_commission) {
      const empJobs = jobs.filter(j => j.salesperson_id === employee.id)
      const empJobIds = empJobs.map(j => j.id)
      const empInvoices = invoices.filter(inv => empJobIds.includes(inv.job_id))
      empInvoices.forEach(inv => {
        const invAmount = inv.amount || 0
        if (invAmount <= 0) return
        const rate = employee.commission_services_rate || 0
        const rateType = employee.commission_services_type || 'percent'
        const commAmt = rateType === 'percent' ? invAmount * (rate / 100) : rate
        if (commAmt <= 0) return
        const invPayments = payments.filter(p => p.invoice_id === inv.id)
        const totalPaid = invPayments.reduce((sum, p) => sum + (p.amount || 0), 0)
        const isPaid = totalPaid >= invAmount || inv.payment_status === 'Paid'
        if (payrollConfig.commission_trigger === 'payment_received' && isPaid) commissionPay += commAmt
        else if (payrollConfig.commission_trigger === 'invoice_created') commissionPay += commAmt
        else if (payrollConfig.commission_trigger === 'job_completed') {
          const job = empJobs.find(j => j.id === inv.job_id)
          if (job?.status === 'Completed' || job?.status === 'Complete') commissionPay += commAmt
        }
      })
    }

    // Lead commissions
    const empLeadComm = leadCommissions.filter(c => c.employee_id === employee.id)
    const leadCommTotal = empLeadComm.reduce((sum, c) => sum + (c.amount || 0), 0)
    commissionPay += leadCommTotal

    const grossPay = hourlyPay + salaryPay + commissionPay
    const ptoBalance = (employee.pto_accrued || 0) - (employee.pto_used || 0)

    return { regularHours, overtimeHours, hourlyPay, salaryPay, commissionPay, grossPay: Math.round(grossPay * 100) / 100, ptoBalance, hourlyRate }
  }

  const fmt = (n) => '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // Fast GPS grab — resolves with lat/lng only. Reverse-geocode to an
  // address used to happen inline (Nominatim) and blocked the DB write for
  // several seconds, which made clock-in/out feel broken. We now do the
  // DB update immediately and geocode the address in the background.
  const getCoordsFast = () => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve({ lat: null, lng: null })
        return
      }
      navigator.geolocation.getCurrentPosition(
        (position) => resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }),
        () => resolve({ lat: null, lng: null }),
        { timeout: 4000, maximumAge: 60000, enableHighAccuracy: false }
      )
    })
  }

  // Background address lookup — updates the row after the fact so the UI
  // responds instantly while the address is filled in opportunistically.
  const backfillAddress = async (entryId, lat, lng, which /* 'in' | 'out' */) => {
    if (lat == null || lng == null) return
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`
      )
      const data = await res.json()
      const address = data.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`
      const patch = which === 'in'
        ? { clock_in_address: address }
        : { clock_out_address: address }
      await supabase.from('time_clock').update(patch).eq('id', entryId)
      fetchTimeEntries()
    } catch { /* geocode is cosmetic — ignore failures */ }
  }

  const handleClockIn = async (employeeId) => {
    if (busyEmployeeIds.has(employeeId)) return // prevent double-tap
    setBusyEmployeeIds(prev => new Set(prev).add(employeeId))
    try {
      const { lat, lng } = await getCoordsFast()
      const { data, error } = await supabase
        .from('time_clock')
        .insert({
          company_id: companyId,
          employee_id: employeeId,
          clock_in: new Date().toISOString(),
          clock_in_lat: lat,
          clock_in_lng: lng,
        })
        .select()
        .single()
      if (error) throw error
      await fetchTimeEntries()
      if (data?.id && lat != null) backfillAddress(data.id, lat, lng, 'in')
    } catch (err) {
      alert('Error clocking in: ' + err.message)
    } finally {
      setBusyEmployeeIds(prev => {
        const next = new Set(prev)
        next.delete(employeeId)
        return next
      })
    }
  }

  const handleClockOut = async (entryId) => {
    if (busyEntryIds.has(entryId)) return // prevent double-tap
    const entry = timeEntries.find(e => e.id === entryId)
    if (!entry) return
    setBusyEntryIds(prev => new Set(prev).add(entryId))

    const clockIn = new Date(entry.clock_in)
    const clockOut = new Date()
    let totalHours = (clockOut - clockIn) / (1000 * 60 * 60)
    if (entry.lunch_start && entry.lunch_end) {
      const lunchDuration = (new Date(entry.lunch_end) - new Date(entry.lunch_start)) / (1000 * 60 * 60)
      totalHours -= lunchDuration
    }

    try {
      const { lat, lng } = await getCoordsFast()
      const { error } = await supabase
        .from('time_clock')
        .update({
          clock_out: clockOut.toISOString(),
          clock_out_lat: lat,
          clock_out_lng: lng,
          total_hours: Math.round(totalHours * 100) / 100,
        })
        .eq('id', entryId)
      if (error) throw error
      await fetchTimeEntries()
      if (lat != null) backfillAddress(entryId, lat, lng, 'out')
    } catch (err) {
      alert('Error clocking out: ' + err.message)
    } finally {
      setBusyEntryIds(prev => {
        const next = new Set(prev)
        next.delete(entryId)
        return next
      })
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

  // Compute hours for an entry, using total_hours if present, otherwise clock_in/clock_out
  const getEntryHours = (e) => {
    if (e.total_hours) return e.total_hours
    if (!e.clock_in || !e.clock_out) return 0
    let h = (new Date(e.clock_out) - new Date(e.clock_in)) / (1000 * 60 * 60)
    if (e.lunch_start && e.lunch_end) {
      h -= (new Date(e.lunch_end) - new Date(e.lunch_start)) / (1000 * 60 * 60)
    }
    return Math.max(0, h)
  }

  const getWeekTotal = (employeeId) => {
    return timeEntries
      .filter(e => e.employee_id === employeeId && e.clock_out)
      .reduce((sum, e) => sum + getEntryHours(e), 0)
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
      <div style={{ padding: isMobile ? '16px' : '24px', textAlign: 'center', color: theme.textMuted }}>
        Loading...
      </div>
    )
  }

  return (
    <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '100%', overflowX: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: isMobile ? 'flex-start' : 'center',
        marginBottom: '24px',
        flexWrap: 'wrap',
        flexDirection: isMobile ? 'column' : 'row',
        gap: isMobile ? '8px' : '0'
      }}>
        <div>
          <h1 style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: '700', color: theme.text, marginBottom: '4px' }}>
            Time Clock
          </h1>
          <p style={{ color: theme.textMuted, fontSize: '14px' }}>
            {currentTime.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div style={{
          fontSize: isMobile ? '24px' : '32px',
          fontWeight: '700',
          fontFamily: 'monospace',
          color: theme.accent
        }}>
          {currentTime.toLocaleTimeString()}
        </div>
      </div>

      {/* Lookback Range Selector */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px',
        flexWrap: 'wrap'
      }}>
        <Calendar size={14} style={{ color: theme.textMuted }} />
        <span style={{ fontSize: '13px', color: theme.textMuted }}>Showing:</span>
        {[7, 14, 30, 60, 90].map(d => (
          <button
            key={d}
            onClick={() => setLookbackDays(d)}
            style={{
              padding: '4px 10px', fontSize: '12px', fontWeight: lookbackDays === d ? '600' : '400',
              background: lookbackDays === d ? theme.accentBg : 'transparent',
              color: lookbackDays === d ? theme.accent : theme.textSecondary,
              border: `1px solid ${lookbackDays === d ? theme.accent : theme.border}`,
              borderRadius: '14px', cursor: 'pointer', minHeight: '28px'
            }}
          >{d}d</button>
        ))}
      </div>

      {/* Employee Cards Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: isMobile ? '16px' : '20px'
      }}>
        {employees.filter(e => e.active && (isTeamLeadPlus || e.id === user?.id)).map(employee => {
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
                    {(() => {
                      const outBusy = busyEntryIds.has(activeEntry.id)
                      return (
                        <button
                          onClick={() => handleClockOut(activeEntry.id)}
                          disabled={outBusy}
                          style={{
                            flex: 1,
                            padding: '12px',
                            background: outBusy
                              ? 'linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)'
                              : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                            border: 'none',
                            borderRadius: '10px',
                            color: '#fff',
                            fontSize: '14px',
                            fontWeight: '600',
                            cursor: outBusy ? 'wait' : 'pointer',
                            opacity: outBusy ? 0.75 : 1,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px'
                          }}
                        >
                          <Square size={18} />
                          {outBusy ? 'Clocking Out…' : 'Clock Out'}
                        </button>
                      )
                    })()}
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
                  {(() => {
                    const inBusy = busyEmployeeIds.has(employee.id)
                    return (
                      <button
                        onClick={() => handleClockIn(employee.id)}
                        disabled={inBusy}
                        style={{
                          width: '100%',
                          padding: '20px',
                          background: inBusy
                            ? 'linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)'
                            : 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                          border: 'none',
                          borderRadius: '12px',
                          color: '#fff',
                          fontSize: '18px',
                          fontWeight: '700',
                          cursor: inBusy ? 'wait' : 'pointer',
                          opacity: inBusy ? 0.75 : 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '10px',
                          marginBottom: '12px'
                        }}
                      >
                        <Play size={24} />
                        {inBusy ? 'Clocking In…' : 'Clock In'}
                      </button>
                    )
                  })()}

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

              {/* My Pay This Period */}
              {(() => {
                const pay = calculatePay(employee)
                const { periodStart, periodEnd } = getCurrentPeriod()
                const nextPay = getNextPayDate()
                const daysUntil = Math.max(0, Math.ceil((nextPay - new Date()) / (1000 * 60 * 60 * 24)))

                return (
                  <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: `1px solid ${theme.border}` }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        <DollarSign size={14} />
                        Pay This Period
                      </div>
                      <div style={{ fontSize: '11px', color: theme.textMuted }}>
                        {periodStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {periodEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                    </div>

                    {/* Gross Pay */}
                    <div style={{
                      backgroundColor: theme.accent + '12',
                      border: `1px solid ${theme.accent}30`,
                      borderRadius: '12px',
                      padding: '12px 16px',
                      marginBottom: '10px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <span style={{ fontSize: '13px', fontWeight: '500', color: theme.text }}>Gross Pay</span>
                      <span style={{ fontSize: '20px', fontWeight: '700', color: '#16a34a' }}>{fmt(pay.grossPay)}</span>
                    </div>

                    {/* Breakdown */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px' }}>
                      {employee.is_hourly && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: theme.textMuted, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Clock size={12} /> Hours ({formatDuration(pay.regularHours)}{pay.overtimeHours > 0 ? ` + ${formatDuration(pay.overtimeHours)} OT` : ''})
                          </span>
                          <span style={{ fontWeight: '500', color: theme.text }}>{fmt(pay.hourlyPay)}</span>
                        </div>
                      )}
                      {employee.is_salary && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: theme.textMuted }}>Salary</span>
                          <span style={{ fontWeight: '500', color: theme.text }}>{fmt(pay.salaryPay)}</span>
                        </div>
                      )}
                      {pay.commissionPay > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: theme.textMuted, display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <TrendingUp size={12} /> Commissions
                          </span>
                          <span style={{ fontWeight: '500', color: '#16a34a' }}>{fmt(pay.commissionPay)}</span>
                        </div>
                      )}

                      {/* Divider */}
                      <div style={{ height: '1px', backgroundColor: theme.border, margin: '4px 0' }} />

                      {/* PTO */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: theme.textMuted, display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Calendar size={12} /> PTO Balance
                        </span>
                        <span style={{ fontWeight: '500', color: pay.ptoBalance > 0 ? '#8b5cf6' : theme.textMuted }}>
                          {pay.ptoBalance} days
                        </span>
                      </div>

                      {/* Pay Rate */}
                      {employee.is_hourly && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: theme.textMuted }}>Pay Rate</span>
                          <span style={{ fontWeight: '500', color: theme.text }}>${employee.hourly_rate}/hr</span>
                        </div>
                      )}

                      {/* Next Payday */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: theme.textMuted }}>Next Payday</span>
                        <span style={{ fontWeight: '500', color: theme.text }}>
                          {nextPay.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          <span style={{ color: theme.textMuted, fontWeight: '400' }}> ({daysUntil}d)</span>
                        </span>
                      </div>

                      {/* Tax classification */}
                      {employee.tax_classification && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ color: theme.textMuted }}>Classification</span>
                          <span style={{
                            fontSize: '11px',
                            padding: '2px 8px',
                            borderRadius: '10px',
                            backgroundColor: employee.tax_classification === 'W2' ? '#3b82f620' : '#f9731620',
                            color: employee.tax_classification === 'W2' ? '#3b82f6' : '#f97316',
                            fontWeight: '600'
                          }}>
                            {employee.tax_classification}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })()}
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
            maxWidth: isMobile ? 'calc(100vw - 32px)' : '440px',
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
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
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
