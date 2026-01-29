import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import {
  DollarSign, Calendar, Clock, Users, Settings, Play, Check, X,
  ChevronRight, AlertTriangle
} from 'lucide-react'

const AVATAR_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e'
]

export default function Payroll() {
  const { theme } = useTheme()
  const companyId = useStore((state) => state.companyId)
  const company = useStore((state) => state.company)
  const user = useStore((state) => state.user)
  const employees = useStore((state) => state.employees)
  const refreshCompany = useStore((state) => state.fetchCompany)

  const [timeEntries, setTimeEntries] = useState([])
  const [timeOffRequests, setTimeOffRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [showRunPayrollModal, setShowRunPayrollModal] = useState(false)
  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [savingSettings, setSavingSettings] = useState(false)
  const [runningPayroll, setRunningPayroll] = useState(false)

  const [paySettings, setPaySettings] = useState({
    pay_frequency: company?.pay_frequency || 'bi-weekly',
    pay_day_1: company?.pay_day_1 || '20',
    pay_day_2: company?.pay_day_2 || '5'
  })

  const isAdmin = user?.role === 'Admin' || user?.role === 'Manager' || user?.is_admin

  useEffect(() => {
    if (companyId) {
      fetchData()
    }
  }, [companyId])

  useEffect(() => {
    if (company) {
      setPaySettings({
        pay_frequency: company.pay_frequency || 'bi-weekly',
        pay_day_1: company.pay_day_1 || '20',
        pay_day_2: company.pay_day_2 || '5'
      })
    }
  }, [company])

  const fetchData = async () => {
    setLoading(true)
    try {
      // Get period dates
      const { periodStart, periodEnd } = getCurrentPeriod()

      // Fetch time entries for current period
      const { data: entries } = await supabase
        .from('time_clock')
        .select('*')
        .eq('company_id', companyId)
        .gte('clock_in', periodStart.toISOString())
        .lte('clock_in', periodEnd.toISOString())
        .not('clock_out', 'is', null)

      setTimeEntries(entries || [])

      // Fetch pending time off requests
      const { data: requests } = await supabase
        .from('time_off_requests')
        .select('*, employee:employees(name, email)')
        .eq('company_id', companyId)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })

      setTimeOffRequests(requests || [])
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  const getCurrentPeriod = () => {
    const today = new Date()
    const frequency = paySettings.pay_frequency
    let periodStart, periodEnd

    if (frequency === 'weekly') {
      // Current week (Mon-Sun)
      const day = today.getDay()
      periodStart = new Date(today)
      periodStart.setDate(today.getDate() - (day === 0 ? 6 : day - 1))
      periodEnd = new Date(periodStart)
      periodEnd.setDate(periodStart.getDate() + 6)
    } else if (frequency === 'bi-weekly') {
      // Bi-weekly periods
      const day1 = parseInt(paySettings.pay_day_1) || 20
      const day2 = parseInt(paySettings.pay_day_2) || 5

      if (today.getDate() <= day2) {
        // First half of month (16th to end of prev month)
        periodStart = new Date(today.getFullYear(), today.getMonth() - 1, 16)
        periodEnd = new Date(today.getFullYear(), today.getMonth(), 0)
      } else if (today.getDate() <= day1) {
        // Second half (1st to 15th)
        periodStart = new Date(today.getFullYear(), today.getMonth(), 1)
        periodEnd = new Date(today.getFullYear(), today.getMonth(), 15)
      } else {
        // First half (16th to end of month)
        periodStart = new Date(today.getFullYear(), today.getMonth(), 16)
        periodEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      }
    } else if (frequency === 'semi-monthly') {
      // 1st-15th or 16th-end
      if (today.getDate() <= 15) {
        periodStart = new Date(today.getFullYear(), today.getMonth(), 1)
        periodEnd = new Date(today.getFullYear(), today.getMonth(), 15)
      } else {
        periodStart = new Date(today.getFullYear(), today.getMonth(), 16)
        periodEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      }
    } else {
      // Monthly
      periodStart = new Date(today.getFullYear(), today.getMonth(), 1)
      periodEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    }

    periodStart.setHours(0, 0, 0, 0)
    periodEnd.setHours(23, 59, 59, 999)

    return { periodStart, periodEnd }
  }

  const getNextPayDate = () => {
    const today = new Date()
    const day1 = parseInt(paySettings.pay_day_1) || 20
    const day2 = parseInt(paySettings.pay_day_2) || 5

    let nextPay = new Date(today)

    if (paySettings.pay_frequency === 'weekly') {
      // Next Friday
      const daysUntilFriday = (5 - today.getDay() + 7) % 7 || 7
      nextPay.setDate(today.getDate() + daysUntilFriday)
    } else if (paySettings.pay_frequency === 'bi-weekly' || paySettings.pay_frequency === 'semi-monthly') {
      if (today.getDate() < day2) {
        nextPay = new Date(today.getFullYear(), today.getMonth(), day2)
      } else if (today.getDate() < day1) {
        nextPay = new Date(today.getFullYear(), today.getMonth(), day1)
      } else {
        nextPay = new Date(today.getFullYear(), today.getMonth() + 1, day2)
      }
    } else {
      // Monthly - end of month
      nextPay = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    }

    return nextPay
  }

  const getDaysUntilPayday = () => {
    const today = new Date()
    const nextPay = getNextPayDate()
    const diff = Math.ceil((nextPay - today) / (1000 * 60 * 60 * 24))
    return Math.max(0, diff)
  }

  const calculateEmployeeHours = (employeeId) => {
    const { periodStart, periodEnd } = getCurrentPeriod()
    const empEntries = timeEntries.filter(e => e.employee_id === employeeId)

    let regularHours = 0
    let overtimeHours = 0

    // Group by week for overtime calculation
    const weeklyHours = {}

    empEntries.forEach(entry => {
      if (!entry.total_hours) return

      const entryDate = new Date(entry.clock_in)
      const weekStart = new Date(entryDate)
      weekStart.setDate(entryDate.getDate() - entryDate.getDay())
      const weekKey = weekStart.toISOString().split('T')[0]

      weeklyHours[weekKey] = (weeklyHours[weekKey] || 0) + entry.total_hours
    })

    // Calculate regular vs overtime
    Object.values(weeklyHours).forEach(hours => {
      if (hours <= 40) {
        regularHours += hours
      } else {
        regularHours += 40
        overtimeHours += hours - 40
      }
    })

    return { regularHours, overtimeHours }
  }

  const calculateGrossPay = (employee) => {
    const { regularHours, overtimeHours } = calculateEmployeeHours(employee.id)
    const hourlyRate = employee.hourly_rate || 0
    const salary = employee.salary || 0
    const payType = employee.pay_type || ['hourly']

    let gross = 0

    if (payType.includes('hourly')) {
      gross += regularHours * hourlyRate
      gross += overtimeHours * hourlyRate * 1.5
    }

    if (payType.includes('salary')) {
      // Divide salary by pay periods per year
      const periodsPerYear = paySettings.pay_frequency === 'weekly' ? 52 :
        paySettings.pay_frequency === 'bi-weekly' ? 26 :
          paySettings.pay_frequency === 'semi-monthly' ? 24 : 12
      gross += salary / periodsPerYear
    }

    return Math.round(gross * 100) / 100
  }

  const getTotalPayroll = () => {
    return employees
      .filter(e => e.active)
      .reduce((sum, emp) => sum + calculateGrossPay(emp), 0)
  }

  const handleSaveSettings = async () => {
    setSavingSettings(true)
    try {
      const { error } = await supabase
        .from('companies')
        .update({
          pay_frequency: paySettings.pay_frequency,
          pay_day_1: paySettings.pay_day_1,
          pay_day_2: paySettings.pay_day_2
        })
        .eq('id', companyId)

      if (error) throw error

      if (refreshCompany) await refreshCompany()
      setShowSettingsModal(false)
    } catch (err) {
      alert('Error saving: ' + err.message)
    } finally {
      setSavingSettings(false)
    }
  }

  const handleRunPayroll = async () => {
    setRunningPayroll(true)
    const { periodStart, periodEnd } = getCurrentPeriod()
    const payDate = getNextPayDate()

    try {
      // Create payroll run
      const { data: payrollRun, error: runError } = await supabase
        .from('payroll_runs')
        .insert({
          company_id: companyId,
          period_start: periodStart.toISOString().split('T')[0],
          period_end: periodEnd.toISOString().split('T')[0],
          pay_date: payDate.toISOString().split('T')[0],
          total_gross: getTotalPayroll(),
          employee_count: employees.filter(e => e.active).length,
          created_by: user?.id
        })
        .select()
        .single()

      if (runError) throw runError

      // Create paystubs for each employee
      const paystubs = employees.filter(e => e.active).map(emp => {
        const { regularHours, overtimeHours } = calculateEmployeeHours(emp.id)
        return {
          company_id: companyId,
          employee_id: emp.id,
          payroll_run_id: payrollRun.id,
          period_start: periodStart.toISOString().split('T')[0],
          period_end: periodEnd.toISOString().split('T')[0],
          pay_date: payDate.toISOString().split('T')[0],
          regular_hours: regularHours,
          overtime_hours: overtimeHours,
          hourly_rate: emp.hourly_rate,
          salary_amount: emp.salary,
          gross_pay: calculateGrossPay(emp)
        }
      })

      const { error: stubsError } = await supabase
        .from('paystubs')
        .insert(paystubs)

      if (stubsError) throw stubsError

      setShowRunPayrollModal(false)
      alert('Payroll processed successfully!')
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setRunningPayroll(false)
    }
  }

  const handleApproveRequest = async (requestId) => {
    try {
      const { error } = await supabase
        .from('time_off_requests')
        .update({
          status: 'approved',
          approved_by: user?.id,
          approved_at: new Date().toISOString()
        })
        .eq('id', requestId)

      if (error) throw error
      await fetchData()
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  const handleDenyRequest = async (requestId) => {
    try {
      const { error } = await supabase
        .from('time_off_requests')
        .update({ status: 'denied' })
        .eq('id', requestId)

      if (error) throw error
      await fetchData()
    } catch (err) {
      alert('Error: ' + err.message)
    }
  }

  const getAvatarColor = (name) => {
    let hash = 0
    for (let i = 0; i < (name || '').length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash)
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
  }

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
  }

  const { periodStart, periodEnd } = getCurrentPeriod()
  const nextPayDate = getNextPayDate()
  const daysUntil = getDaysUntilPayday()

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
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>
          Payroll
        </h1>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => setShowSettingsModal(true)}
            style={{
              padding: '10px 16px',
              backgroundColor: theme.bg,
              border: `1px solid ${theme.border}`,
              borderRadius: '10px',
              color: theme.textMuted,
              fontSize: '14px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <Settings size={18} />
            Pay Schedule
          </button>
          {isAdmin && (
            <button
              onClick={() => setShowRunPayrollModal(true)}
              style={{
                padding: '10px 20px',
                background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                border: 'none',
                borderRadius: '10px',
                color: '#fff',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <Play size={18} />
              Run Payroll
            </button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        {/* Period */}
        <div style={{
          backgroundColor: theme.bgCard,
          border: `1px solid ${theme.border}`,
          borderRadius: '12px',
          padding: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <Calendar size={20} style={{ color: theme.accent }} />
            <span style={{ color: theme.textMuted, fontSize: '14px' }}>Pay Period</span>
          </div>
          <div style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>
            {periodStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {periodEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </div>
        </div>

        {/* Next Pay Date */}
        <div style={{
          backgroundColor: theme.bgCard,
          border: `1px solid ${theme.border}`,
          borderRadius: '12px',
          padding: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <Clock size={20} style={{ color: '#3b82f6' }} />
            <span style={{ color: theme.textMuted, fontSize: '14px' }}>Next Pay Date</span>
          </div>
          <div style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>
            {nextPayDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </div>
        </div>

        {/* Days Until */}
        <div style={{
          backgroundColor: theme.bgCard,
          border: `1px solid ${theme.border}`,
          borderRadius: '12px',
          padding: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <Calendar size={20} style={{ color: '#8b5cf6' }} />
            <span style={{ color: theme.textMuted, fontSize: '14px' }}>Days Until Payday</span>
          </div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: '#8b5cf6' }}>
            {daysUntil}
          </div>
        </div>

        {/* Total Payroll */}
        <div style={{
          backgroundColor: theme.bgCard,
          border: `1px solid ${theme.border}`,
          borderRadius: '12px',
          padding: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <DollarSign size={20} style={{ color: '#22c55e' }} />
            <span style={{ color: theme.textMuted, fontSize: '14px' }}>Total Payroll</span>
          </div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: '#22c55e' }}>
            {formatCurrency(getTotalPayroll())}
          </div>
        </div>
      </div>

      {/* Employee List */}
      <div style={{
        backgroundColor: theme.bgCard,
        border: `1px solid ${theme.border}`,
        borderRadius: '12px',
        overflow: 'hidden',
        marginBottom: '24px'
      }}>
        <div style={{
          padding: '16px 20px',
          borderBottom: `1px solid ${theme.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <div style={{ fontWeight: '600', color: theme.text }}>
            Employees ({employees.filter(e => e.active).length})
          </div>
        </div>

        {employees.filter(e => e.active).map(emp => {
          const { regularHours, overtimeHours } = calculateEmployeeHours(emp.id)
          const grossPay = calculateGrossPay(emp)
          const payType = emp.pay_type || ['hourly']
          const ptoBalance = (emp.pto_accrued || 0) - (emp.pto_used || 0)

          return (
            <div
              key={emp.id}
              style={{
                padding: '16px 20px',
                borderBottom: `1px solid ${theme.border}`,
                display: 'flex',
                alignItems: 'center',
                gap: '16px'
              }}
            >
              {/* Avatar */}
              <div style={{
                width: '44px',
                height: '44px',
                borderRadius: '10px',
                backgroundColor: getAvatarColor(emp.name || emp.email),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontWeight: '600',
                fontSize: '16px',
                flexShrink: 0
              }}>
                {(emp.name || emp.email).charAt(0).toUpperCase()}
              </div>

              {/* Name & Pay Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: '600', color: theme.text }}>
                  {emp.name || emp.email}
                </div>
                <div style={{ fontSize: '13px', color: theme.textMuted, display: 'flex', gap: '12px' }}>
                  {payType.includes('hourly') && (
                    <span>${emp.hourly_rate || 0}/hr</span>
                  )}
                  {payType.includes('salary') && (
                    <span>${(emp.salary || 0).toLocaleString()}/yr</span>
                  )}
                </div>
              </div>

              {/* Hours */}
              <div style={{ textAlign: 'center', minWidth: '80px' }}>
                <div style={{ fontSize: '13px', color: theme.textMuted }}>Hours</div>
                <div style={{ fontWeight: '600', color: theme.text }}>
                  {regularHours.toFixed(1)}
                </div>
              </div>

              {/* Overtime */}
              <div style={{ textAlign: 'center', minWidth: '80px' }}>
                <div style={{ fontSize: '13px', color: theme.textMuted }}>OT</div>
                <div style={{
                  fontWeight: '600',
                  color: overtimeHours > 0 ? '#f97316' : theme.textMuted
                }}>
                  {overtimeHours.toFixed(1)}
                </div>
              </div>

              {/* PTO Balance */}
              <div style={{ textAlign: 'center', minWidth: '80px' }}>
                <div style={{ fontSize: '13px', color: theme.textMuted }}>PTO</div>
                <div style={{
                  fontWeight: '600',
                  color: ptoBalance <= 0 ? '#ef4444' : '#8b5cf6'
                }}>
                  {ptoBalance.toFixed(1)} days
                </div>
              </div>

              {/* Gross Pay */}
              <div style={{ textAlign: 'right', minWidth: '100px' }}>
                <div style={{
                  fontSize: '18px',
                  fontWeight: '700',
                  color: '#22c55e'
                }}>
                  {formatCurrency(grossPay)}
                </div>
              </div>
            </div>
          )
        })}

        {/* Total */}
        <div style={{
          padding: '16px 20px',
          backgroundColor: theme.bg,
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: '16px'
        }}>
          <span style={{ fontWeight: '600', color: theme.text }}>Total Payroll:</span>
          <span style={{ fontSize: '24px', fontWeight: '700', color: '#22c55e' }}>
            {formatCurrency(getTotalPayroll())}
          </span>
        </div>
      </div>

      {/* Pending Time Off Requests */}
      {isAdmin && timeOffRequests.length > 0 && (
        <div style={{
          backgroundColor: theme.bgCard,
          border: `1px solid ${theme.border}`,
          borderRadius: '12px',
          overflow: 'hidden'
        }}>
          <div style={{
            padding: '16px 20px',
            borderBottom: `1px solid ${theme.border}`,
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <AlertTriangle size={18} style={{ color: '#eab308' }} />
            <span style={{ fontWeight: '600', color: theme.text }}>
              Pending Time Off Requests ({timeOffRequests.length})
            </span>
          </div>

          {timeOffRequests.map(request => (
            <div
              key={request.id}
              style={{
                padding: '16px 20px',
                borderBottom: `1px solid ${theme.border}`,
                display: 'flex',
                alignItems: 'center',
                gap: '16px'
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: '600', color: theme.text }}>
                  {request.employee?.name || request.employee?.email}
                </div>
                <div style={{ fontSize: '13px', color: theme.textMuted }}>
                  {new Date(request.start_date).toLocaleDateString()} - {new Date(request.end_date).toLocaleDateString()}
                  <span style={{
                    marginLeft: '8px',
                    padding: '2px 8px',
                    backgroundColor: 'rgba(139, 92, 246, 0.1)',
                    borderRadius: '12px',
                    color: '#8b5cf6',
                    fontSize: '11px',
                    textTransform: 'uppercase'
                  }}>
                    {request.request_type}
                  </span>
                </div>
                {request.reason && (
                  <div style={{ fontSize: '13px', color: theme.textMuted, marginTop: '4px' }}>
                    "{request.reason}"
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => handleApproveRequest(request.id)}
                  style={{
                    padding: '8px 16px',
                    background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Check size={14} />
                  Approve
                </button>
                <button
                  onClick={() => handleDenyRequest(request.id)}
                  style={{
                    padding: '8px 16px',
                    background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <X size={14} />
                  Deny
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
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
            <div style={{
              padding: '20px',
              borderBottom: `1px solid ${theme.border}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>
                Pay Schedule Settings
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
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

            <div style={{ padding: '20px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '13px', color: theme.textMuted, marginBottom: '6px' }}>
                  Pay Frequency
                </label>
                <select
                  value={paySettings.pay_frequency}
                  onChange={(e) => setPaySettings({ ...paySettings, pay_frequency: e.target.value })}
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
                  <option value="weekly">Weekly</option>
                  <option value="bi-weekly">Bi-Weekly</option>
                  <option value="semi-monthly">Semi-Monthly (1st & 15th)</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>

              {(paySettings.pay_frequency === 'bi-weekly' || paySettings.pay_frequency === 'semi-monthly') && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', color: theme.textMuted, marginBottom: '6px' }}>
                      First Pay Day
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="28"
                      value={paySettings.pay_day_1}
                      onChange={(e) => setPaySettings({ ...paySettings, pay_day_1: e.target.value })}
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
                      Second Pay Day
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="28"
                      value={paySettings.pay_day_2}
                      onChange={(e) => setPaySettings({ ...paySettings, pay_day_2: e.target.value })}
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
              )}

              {/* Schedule Description */}
              <div style={{
                padding: '12px',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                borderRadius: '8px',
                marginBottom: '20px'
              }}>
                <div style={{ fontSize: '13px', color: '#3b82f6' }}>
                  {paySettings.pay_frequency === 'weekly' && 'Employees are paid every Friday.'}
                  {paySettings.pay_frequency === 'bi-weekly' && `Employees are paid on the ${paySettings.pay_day_1}th and ${paySettings.pay_day_2}th of each month.`}
                  {paySettings.pay_frequency === 'semi-monthly' && 'Employees are paid on the 15th and last day of each month.'}
                  {paySettings.pay_frequency === 'monthly' && 'Employees are paid on the last day of each month.'}
                </div>
              </div>

              <button
                onClick={handleSaveSettings}
                disabled={savingSettings}
                style={{
                  width: '100%',
                  padding: '14px',
                  background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                  border: 'none',
                  borderRadius: '10px',
                  color: '#fff',
                  fontSize: '15px',
                  fontWeight: '600',
                  cursor: savingSettings ? 'wait' : 'pointer'
                }}
              >
                {savingSettings ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Run Payroll Modal */}
      {showRunPayrollModal && (
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
            <div style={{
              padding: '20px',
              borderBottom: `1px solid ${theme.border}`,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>
                Run Payroll
              </div>
              <button
                onClick={() => setShowRunPayrollModal(false)}
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

            <div style={{ padding: '20px' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '16px',
                marginBottom: '20px'
              }}>
                <div style={{
                  padding: '16px',
                  backgroundColor: theme.bg,
                  borderRadius: '10px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Period</div>
                  <div style={{ fontWeight: '600', color: theme.text }}>
                    {periodStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {periodEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                </div>
                <div style={{
                  padding: '16px',
                  backgroundColor: theme.bg,
                  borderRadius: '10px',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Pay Date</div>
                  <div style={{ fontWeight: '600', color: theme.text }}>
                    {nextPayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                </div>
              </div>

              <div style={{
                padding: '20px',
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                borderRadius: '10px',
                textAlign: 'center',
                marginBottom: '20px'
              }}>
                <div style={{ fontSize: '14px', color: theme.textMuted, marginBottom: '4px' }}>
                  {employees.filter(e => e.active).length} Employees
                </div>
                <div style={{ fontSize: '32px', fontWeight: '700', color: '#22c55e' }}>
                  {formatCurrency(getTotalPayroll())}
                </div>
                <div style={{ fontSize: '13px', color: theme.textMuted }}>Estimated Gross</div>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => setShowRunPayrollModal(false)}
                  style={{
                    flex: 1,
                    padding: '14px',
                    backgroundColor: theme.bg,
                    border: `1px solid ${theme.border}`,
                    borderRadius: '10px',
                    color: theme.text,
                    fontSize: '15px',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleRunPayroll}
                  disabled={runningPayroll}
                  style={{
                    flex: 1,
                    padding: '14px',
                    background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                    border: 'none',
                    borderRadius: '10px',
                    color: '#fff',
                    fontSize: '15px',
                    fontWeight: '600',
                    cursor: runningPayroll ? 'wait' : 'pointer'
                  }}
                >
                  {runningPayroll ? 'Processing...' : 'Process Payroll'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
