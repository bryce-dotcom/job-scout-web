import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import {
  DollarSign, Calendar, Clock, Users, Settings, Play, Check, X,
  ChevronRight, ChevronDown, AlertTriangle, TrendingUp, Zap,
  Award, Filter, ArrowLeft, Eye, Briefcase
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

  // Data state
  const [timeEntries, setTimeEntries] = useState([])
  const [timeLogEntries, setTimeLogEntries] = useState([])
  const [leadCommissions, setLeadCommissions] = useState([])
  const [payments, setPayments] = useState([])
  const [invoices, setInvoices] = useState([])
  const [jobs, setJobs] = useState([])
  const [timeOffRequests, setTimeOffRequests] = useState([])
  const [loading, setLoading] = useState(true)

  // UI state
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [showRunPayrollModal, setShowRunPayrollModal] = useState(false)
  const [expandedEmployee, setExpandedEmployee] = useState(null)
  const [activeTab, setActiveTab] = useState('overview') // overview, detail
  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [filterRole, setFilterRole] = useState('all')
  const [savingSettings, setSavingSettings] = useState(false)
  const [runningPayroll, setRunningPayroll] = useState(false)

  // Payroll settings from settings table
  const [payrollConfig, setPayrollConfig] = useState({
    pay_frequency: 'bi-weekly',
    pay_day_1: '20',
    pay_day_2: '5',
    commission_trigger: 'payment_received', // payment_received, invoice_created, job_completed
    efficiency_bonus_enabled: false,
    efficiency_bonus_rate: 25, // $ per hour saved
    overtime_threshold: 40, // hours per week
    overtime_multiplier: 1.5,
  })

  const isAdmin = user?.role === 'Admin' || user?.role === 'Manager' || user?.is_admin ||
    user?.user_role === 'Admin' || user?.user_role === 'Owner' || user?.user_role === 'Super Admin'

  // Load payroll config from settings
  useEffect(() => {
    if (companyId) {
      loadPayrollConfig()
      fetchData()
    }
  }, [companyId])

  // Sync company pay settings into local config
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

  const loadPayrollConfig = async () => {
    const { data } = await supabase
      .from('settings')
      .select('value')
      .eq('company_id', companyId)
      .eq('key', 'payroll_config')
      .single()

    if (data?.value) {
      try {
        const parsed = JSON.parse(data.value)
        setPayrollConfig(prev => ({ ...prev, ...parsed }))
      } catch {}
    }
  }

  const savePayrollConfig = async (config) => {
    setSavingSettings(true)
    try {
      // Save payroll_config to settings table
      await supabase
        .from('settings')
        .upsert({
          company_id: companyId,
          key: 'payroll_config',
          value: JSON.stringify(config),
          updated_at: new Date().toISOString()
        }, { onConflict: 'company_id,key' })

      // Also save pay schedule fields to companies table
      await supabase
        .from('companies')
        .update({
          pay_frequency: config.pay_frequency,
          pay_day_1: config.pay_day_1,
          pay_day_2: config.pay_day_2
        })
        .eq('id', companyId)

      setPayrollConfig(config)
      if (refreshCompany) await refreshCompany()
      setShowSettingsModal(false)
    } catch (err) {
      alert('Error saving: ' + err.message)
    } finally {
      setSavingSettings(false)
    }
  }

  const fetchData = async () => {
    setLoading(true)
    try {
      const { periodStart, periodEnd } = getCurrentPeriod()

      // Parallel fetches for all data
      const [entriesRes, timeLogRes, commRes, paymentsRes, invoicesRes, jobsRes, requestsRes] = await Promise.all([
        // Time clock entries for current period
        supabase
          .from('time_clock')
          .select('*')
          .eq('company_id', companyId)
          .gte('clock_in', periodStart.toISOString())
          .lte('clock_in', periodEnd.toISOString())
          .not('clock_out', 'is', null),

        // Time log entries (job-level hours) for current period
        supabase
          .from('time_log')
          .select('*')
          .eq('company_id', companyId)
          .gte('created_at', periodStart.toISOString())
          .lte('created_at', periodEnd.toISOString()),

        // Lead commissions for current period
        supabase
          .from('lead_commissions')
          .select('*')
          .eq('company_id', companyId)
          .gte('created_at', periodStart.toISOString())
          .lte('created_at', periodEnd.toISOString()),

        // Payments for current period (for invoice-based commissions)
        supabase
          .from('payments')
          .select('*')
          .eq('company_id', companyId)
          .gte('date', periodStart.toISOString().split('T')[0])
          .lte('date', periodEnd.toISOString().split('T')[0]),

        // All invoices (need for commission chain)
        supabase
          .from('invoices')
          .select('*')
          .eq('company_id', companyId),

        // All jobs (need for efficiency bonuses + commission chain)
        supabase
          .from('jobs')
          .select('id, company_id, job_id, salesperson_id, allotted_time_hours, status, customer_name, job_title, assigned_team')
          .eq('company_id', companyId),

        // Pending time off requests
        supabase
          .from('time_off_requests')
          .select('*, employee:employees(name, email)')
          .eq('company_id', companyId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
      ])

      setTimeEntries(entriesRes.data || [])
      setTimeLogEntries(timeLogRes.data || [])
      setLeadCommissions(commRes.data || [])
      setPayments(paymentsRes.data || [])
      setInvoices(invoicesRes.data || [])
      setJobs(jobsRes.data || [])
      setTimeOffRequests(requestsRes.data || [])
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  // ── Period Calculations ──────────────────────────────────
  const getCurrentPeriod = () => {
    const today = new Date()
    const frequency = payrollConfig.pay_frequency
    let periodStart, periodEnd

    if (frequency === 'weekly') {
      const day = today.getDay()
      periodStart = new Date(today)
      periodStart.setDate(today.getDate() - (day === 0 ? 6 : day - 1))
      periodEnd = new Date(periodStart)
      periodEnd.setDate(periodStart.getDate() + 6)
    } else if (frequency === 'bi-weekly') {
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
    } else if (frequency === 'semi-monthly') {
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
    let nextPay = new Date(today)

    if (payrollConfig.pay_frequency === 'weekly') {
      const daysUntilFriday = (5 - today.getDay() + 7) % 7 || 7
      nextPay.setDate(today.getDate() + daysUntilFriday)
    } else if (payrollConfig.pay_frequency === 'bi-weekly' || payrollConfig.pay_frequency === 'semi-monthly') {
      if (today.getDate() < day2) {
        nextPay = new Date(today.getFullYear(), today.getMonth(), day2)
      } else if (today.getDate() < day1) {
        nextPay = new Date(today.getFullYear(), today.getMonth(), day1)
      } else {
        nextPay = new Date(today.getFullYear(), today.getMonth() + 1, day2)
      }
    } else {
      nextPay = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    }
    return nextPay
  }

  const getDaysUntilPayday = () => {
    const today = new Date()
    const nextPay = getNextPayDate()
    return Math.max(0, Math.ceil((nextPay - today) / (1000 * 60 * 60 * 24)))
  }

  // ── Employee Pay Calculations ────────────────────────────
  const calculateEmployeeHours = (employeeId) => {
    const empEntries = timeEntries.filter(e => e.employee_id === employeeId)
    let regularHours = 0
    let overtimeHours = 0

    // Group by week for overtime
    const weeklyHours = {}
    empEntries.forEach(entry => {
      if (!entry.total_hours) return
      const entryDate = new Date(entry.clock_in)
      const weekStart = new Date(entryDate)
      weekStart.setDate(entryDate.getDate() - entryDate.getDay())
      const weekKey = weekStart.toISOString().split('T')[0]
      weeklyHours[weekKey] = (weeklyHours[weekKey] || 0) + entry.total_hours
    })

    const otThreshold = payrollConfig.overtime_threshold || 40
    Object.values(weeklyHours).forEach(hours => {
      if (hours <= otThreshold) {
        regularHours += hours
      } else {
        regularHours += otThreshold
        overtimeHours += hours - otThreshold
      }
    })

    return { regularHours, overtimeHours, totalHours: regularHours + overtimeHours }
  }

  // Invoice-based commissions: payment → invoice → job → salesperson
  const calculateInvoiceCommissions = (employeeId) => {
    const employee = employees.find(e => e.id === employeeId)
    if (!employee?.is_commission) return { available: 0, pending: 0, details: [] }

    const details = []
    let available = 0
    let pending = 0

    // Get all jobs where this employee is the salesperson
    const empJobs = jobs.filter(j => j.salesperson_id === employeeId)
    const empJobIds = empJobs.map(j => j.id)

    // Get invoices for those jobs
    const empInvoices = invoices.filter(inv => empJobIds.includes(inv.job_id))

    empInvoices.forEach(inv => {
      const invAmount = inv.amount || 0
      if (invAmount <= 0) return

      // Calculate commission amount based on employee's commission rates
      // Use services rate as default for invoice-level commissions
      const rate = employee.commission_services_rate || 0
      const rateType = employee.commission_services_type || 'percent'
      const commissionAmount = rateType === 'percent' ? invAmount * (rate / 100) : rate

      if (commissionAmount <= 0) return

      // Check if payment exists for this invoice
      const invPayments = payments.filter(p => p.invoice_id === inv.id)
      const totalPaid = invPayments.reduce((sum, p) => sum + (p.amount || 0), 0)
      const isPaid = totalPaid >= invAmount || inv.payment_status === 'Paid'

      const job = empJobs.find(j => j.id === inv.job_id)

      if (payrollConfig.commission_trigger === 'payment_received') {
        if (isPaid) {
          available += commissionAmount
          details.push({
            type: 'invoice_commission',
            status: 'available',
            amount: commissionAmount,
            invoiceId: inv.invoice_id,
            jobTitle: job?.job_title || job?.customer_name || inv.job_description || 'Unknown',
            invoiceAmount: invAmount,
            paidDate: invPayments[0]?.date
          })
        } else {
          pending += commissionAmount
          details.push({
            type: 'invoice_commission',
            status: 'pending',
            amount: commissionAmount,
            invoiceId: inv.invoice_id,
            jobTitle: job?.job_title || job?.customer_name || inv.job_description || 'Unknown',
            invoiceAmount: invAmount,
            paidAmount: totalPaid,
            remaining: invAmount - totalPaid
          })
        }
      } else if (payrollConfig.commission_trigger === 'invoice_created') {
        available += commissionAmount
        details.push({
          type: 'invoice_commission',
          status: 'available',
          amount: commissionAmount,
          invoiceId: inv.invoice_id,
          jobTitle: job?.job_title || job?.customer_name || inv.job_description || 'Unknown',
          invoiceAmount: invAmount,
        })
      } else if (payrollConfig.commission_trigger === 'job_completed') {
        const isComplete = job?.status === 'Completed' || job?.status === 'Complete'
        if (isComplete) {
          available += commissionAmount
          details.push({
            type: 'invoice_commission',
            status: 'available',
            amount: commissionAmount,
            invoiceId: inv.invoice_id,
            jobTitle: job?.job_title || job?.customer_name || inv.job_description || 'Unknown',
            invoiceAmount: invAmount,
          })
        } else {
          pending += commissionAmount
          details.push({
            type: 'invoice_commission',
            status: 'pending',
            amount: commissionAmount,
            invoiceId: inv.invoice_id,
            jobTitle: job?.job_title || job?.customer_name || inv.job_description || 'Unknown',
            invoiceAmount: invAmount,
            jobStatus: job?.status || 'In Progress'
          })
        }
      }
    })

    return { available, pending, details }
  }

  // Lead commissions (appointment setting, sourcing)
  const calculateLeadCommissions = (employeeId) => {
    const empCommissions = leadCommissions.filter(c => c.employee_id === employeeId)
    const total = empCommissions.reduce((sum, c) => sum + (c.amount || 0), 0)
    const apptCount = empCommissions.filter(c => c.commission_type === 'appointment_set').length
    const sourceCount = empCommissions.filter(c => c.commission_type === 'lead_source').length
    return { total, apptCount, sourceCount, details: empCommissions }
  }

  // Efficiency bonuses: allotted hours - actual hours, split between crew
  const calculateEfficiencyBonus = (employeeId) => {
    if (!payrollConfig.efficiency_bonus_enabled) return { bonus: 0, details: [] }

    const details = []
    let totalBonus = 0

    // Get time_log entries for this employee during this period
    const empTimeLogs = timeLogEntries.filter(tl => tl.employee_id === employeeId)

    // Group by job_id
    const jobMap = {}
    empTimeLogs.forEach(tl => {
      if (!tl.job_id) return
      if (!jobMap[tl.job_id]) jobMap[tl.job_id] = 0
      jobMap[tl.job_id] += (tl.hours || 0)
    })

    Object.entries(jobMap).forEach(([jobId, myHours]) => {
      const job = jobs.find(j => j.id === jobId)
      if (!job?.allotted_time_hours) return

      // Get all time_log entries for this job to find total actual hours
      const allJobTimeLogs = timeLogEntries.filter(tl => tl.job_id === jobId)
      const totalActualHours = allJobTimeLogs.reduce((sum, tl) => sum + (tl.hours || 0), 0)
      const savedHours = job.allotted_time_hours - totalActualHours

      if (savedHours <= 0) return // No bonus if over time

      // Count unique workers on this job
      const uniqueWorkers = new Set(allJobTimeLogs.map(tl => tl.employee_id)).size || 1
      const employeeShare = savedHours / uniqueWorkers
      const bonusAmount = employeeShare * (payrollConfig.efficiency_bonus_rate || 25)

      totalBonus += bonusAmount
      details.push({
        jobId: job.job_id || job.id,
        jobTitle: job.job_title || job.customer_name || 'Job',
        allottedHours: job.allotted_time_hours,
        actualHours: totalActualHours,
        savedHours,
        crewSize: uniqueWorkers,
        employeeShare,
        bonusAmount,
      })
    })

    return { bonus: totalBonus, details }
  }

  // Full pay calculation per employee
  const calculateFullPay = (employee) => {
    const { regularHours, overtimeHours } = calculateEmployeeHours(employee.id)
    const hourlyRate = employee.hourly_rate || 0
    const annualSalary = employee.annual_salary || 0
    const otMultiplier = payrollConfig.overtime_multiplier || 1.5

    let hourlyPay = 0
    let salaryPay = 0

    // Hourly pay
    if (employee.is_hourly) {
      hourlyPay = (regularHours * hourlyRate) + (overtimeHours * hourlyRate * otMultiplier)
    }

    // Salary pay
    if (employee.is_salary) {
      const periodsPerYear = payrollConfig.pay_frequency === 'weekly' ? 52 :
        payrollConfig.pay_frequency === 'bi-weekly' ? 26 :
          payrollConfig.pay_frequency === 'semi-monthly' ? 24 : 12
      salaryPay = annualSalary / periodsPerYear
    }

    // Commissions
    const invoiceComm = calculateInvoiceCommissions(employee.id)
    const leadComm = calculateLeadCommissions(employee.id)
    const commissionPay = invoiceComm.available + leadComm.total

    // Efficiency bonus
    const efficiencyBonus = calculateEfficiencyBonus(employee.id)

    const grossPay = hourlyPay + salaryPay + commissionPay + efficiencyBonus.bonus

    return {
      hourlyPay,
      salaryPay,
      regularHours,
      overtimeHours,
      hourlyRate,
      commissionPay,
      invoiceCommissions: invoiceComm,
      leadCommissions: leadComm,
      efficiencyBonus,
      grossPay: Math.round(grossPay * 100) / 100,
    }
  }

  // ── Aggregate Data ───────────────────────────────────────
  const activeEmployees = useMemo(() =>
    employees.filter(e => e.active),
    [employees]
  )

  const employeePayData = useMemo(() => {
    const data = {}
    activeEmployees.forEach(emp => {
      data[emp.id] = calculateFullPay(emp)
    })
    return data
  }, [activeEmployees, timeEntries, timeLogEntries, payments, invoices, jobs, leadCommissions, payrollConfig])

  const totalPayroll = useMemo(() =>
    Object.values(employeePayData).reduce((sum, d) => sum + d.grossPay, 0),
    [employeePayData]
  )

  const totalCommissions = useMemo(() =>
    Object.values(employeePayData).reduce((sum, d) => sum + d.commissionPay, 0),
    [employeePayData]
  )

  const totalBonuses = useMemo(() =>
    Object.values(employeePayData).reduce((sum, d) => sum + d.efficiencyBonus.bonus, 0),
    [employeePayData]
  )

  const totalPendingCommissions = useMemo(() =>
    Object.values(employeePayData).reduce((sum, d) => sum + d.invoiceCommissions.pending, 0),
    [employeePayData]
  )

  // Filter employees by role
  const filteredEmployees = useMemo(() => {
    if (filterRole === 'all') return activeEmployees
    return activeEmployees.filter(e => e.role === filterRole)
  }, [activeEmployees, filterRole])

  const uniqueRoles = useMemo(() =>
    [...new Set(activeEmployees.map(e => e.role).filter(Boolean))].sort(),
    [activeEmployees]
  )

  // ── Helpers ──────────────────────────────────────────────
  const getAvatarColor = (name) => {
    let hash = 0
    for (let i = 0; i < (name || '').length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
  }

  const fmt = (amount) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)

  const { periodStart, periodEnd } = getCurrentPeriod()
  const nextPayDate = getNextPayDate()
  const daysUntil = getDaysUntilPayday()

  const handleApproveRequest = async (requestId) => {
    try {
      await supabase.from('time_off_requests').update({
        status: 'approved', approved_by: user?.id, approved_at: new Date().toISOString()
      }).eq('id', requestId)
      await fetchData()
    } catch (err) { alert('Error: ' + err.message) }
  }

  const handleDenyRequest = async (requestId) => {
    try {
      await supabase.from('time_off_requests').update({ status: 'denied' }).eq('id', requestId)
      await fetchData()
    } catch (err) { alert('Error: ' + err.message) }
  }

  const handleRunPayroll = async () => {
    setRunningPayroll(true)
    const payDate = getNextPayDate()
    try {
      const { data: payrollRun, error: runError } = await supabase
        .from('payroll_runs')
        .insert({
          company_id: companyId,
          period_start: periodStart.toISOString().split('T')[0],
          period_end: periodEnd.toISOString().split('T')[0],
          pay_date: payDate.toISOString().split('T')[0],
          total_gross: totalPayroll,
          employee_count: activeEmployees.length,
          created_by: user?.id
        })
        .select()
        .single()

      if (runError) throw runError

      const paystubs = activeEmployees.map(emp => {
        const data = employeePayData[emp.id]
        return {
          company_id: companyId,
          employee_id: emp.id,
          payroll_run_id: payrollRun.id,
          period_start: periodStart.toISOString().split('T')[0],
          period_end: periodEnd.toISOString().split('T')[0],
          pay_date: payDate.toISOString().split('T')[0],
          regular_hours: data.regularHours,
          overtime_hours: data.overtimeHours,
          hourly_rate: data.hourlyRate,
          salary_amount: data.salaryPay,
          gross_pay: data.grossPay
        }
      })

      const { error: stubsError } = await supabase.from('paystubs').insert(paystubs)
      if (stubsError) throw stubsError

      setShowRunPayrollModal(false)
      alert('Payroll processed successfully!')
    } catch (err) {
      alert('Error: ' + err.message)
    } finally {
      setRunningPayroll(false)
    }
  }

  // ── Styles ───────────────────────────────────────────────
  const cardStyle = {
    backgroundColor: theme.bgCard,
    border: `1px solid ${theme.border}`,
    borderRadius: '12px',
    padding: '20px'
  }

  const labelStyle = { display: 'block', fontSize: '13px', color: theme.textMuted, marginBottom: '6px' }

  const inputStyle = {
    width: '100%', padding: '10px 12px', backgroundColor: theme.bg,
    border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px'
  }

  if (loading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: theme.textMuted }}>
        <div style={{ width: '40px', height: '40px', border: `3px solid ${theme.border}`, borderTopColor: theme.accent, borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '80px auto 16px' }} />
        Loading payroll data...
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  // ── Employee Detail View ─────────────────────────────────
  if (selectedEmployee) {
    const emp = selectedEmployee
    const data = employeePayData[emp.id] || calculateFullPay(emp)
    const ptoBalance = (emp.pto_accrued || 0) - (emp.pto_used || 0)

    return (
      <div style={{ padding: '24px', maxWidth: '900px' }}>
        {/* Back button */}
        <button
          onClick={() => setSelectedEmployee(null)}
          style={{
            display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '20px',
            padding: '8px 16px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`,
            borderRadius: '8px', color: theme.textSecondary, fontSize: '14px', cursor: 'pointer'
          }}
        >
          <ArrowLeft size={16} /> Back to Payroll
        </button>

        {/* Employee Header */}
        <div style={{ ...cardStyle, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div style={{
            width: '64px', height: '64px', borderRadius: '14px',
            backgroundColor: getAvatarColor(emp.name), display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: '#fff', fontWeight: '700', fontSize: '24px', flexShrink: 0,
            overflow: 'hidden'
          }}>
            {emp.headshot_url ? (
              <img src={emp.headshot_url} alt="" style={{ width: '64px', height: '64px', objectFit: 'cover' }} />
            ) : (emp.name || '?').charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: '20px', fontWeight: '700', color: theme.text }}>{emp.name}</h2>
            <div style={{ fontSize: '14px', color: theme.textMuted, display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '4px' }}>
              <span>{emp.role}</span>
              {emp.skill_level && <span style={{ color: '#a855f7' }}>{emp.skill_level}</span>}
              {emp.is_hourly && <span>${emp.hourly_rate}/hr</span>}
              {emp.is_salary && <span>${(emp.annual_salary || 0).toLocaleString()}/yr</span>}
              <span style={{ color: '#8b5cf6' }}>PTO: {ptoBalance.toFixed(1)} days</span>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '14px', color: theme.textMuted }}>Gross Pay</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#22c55e' }}>{fmt(data.grossPay)}</div>
          </div>
        </div>

        {/* Pay Breakdown */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' }}>
          {emp.is_hourly && (
            <div style={cardStyle}>
              <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>
                <Clock size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Hours
              </div>
              <div style={{ fontSize: '20px', fontWeight: '600', color: theme.text }}>{data.regularHours.toFixed(1)}</div>
              {data.overtimeHours > 0 && <div style={{ fontSize: '12px', color: '#f97316' }}>+{data.overtimeHours.toFixed(1)} OT</div>}
              <div style={{ fontSize: '14px', fontWeight: '600', color: theme.accent, marginTop: '4px' }}>{fmt(data.hourlyPay)}</div>
            </div>
          )}
          {emp.is_salary && (
            <div style={cardStyle}>
              <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>
                <Briefcase size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Salary
              </div>
              <div style={{ fontSize: '20px', fontWeight: '600', color: theme.text }}>{fmt(data.salaryPay)}</div>
              <div style={{ fontSize: '12px', color: theme.textMuted }}>this period</div>
            </div>
          )}
          <div style={cardStyle}>
            <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>
              <TrendingUp size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Commissions
            </div>
            <div style={{ fontSize: '20px', fontWeight: '600', color: data.commissionPay > 0 ? '#f59e0b' : theme.textMuted }}>
              {data.commissionPay > 0 ? fmt(data.commissionPay) : '-'}
            </div>
            {data.invoiceCommissions.pending > 0 && (
              <div style={{ fontSize: '12px', color: '#f97316' }}>{fmt(data.invoiceCommissions.pending)} pending</div>
            )}
          </div>
          {payrollConfig.efficiency_bonus_enabled && (
            <div style={cardStyle}>
              <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>
                <Zap size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />Efficiency Bonus
              </div>
              <div style={{ fontSize: '20px', fontWeight: '600', color: data.efficiencyBonus.bonus > 0 ? '#8b5cf6' : theme.textMuted }}>
                {data.efficiencyBonus.bonus > 0 ? fmt(data.efficiencyBonus.bonus) : '-'}
              </div>
            </div>
          )}
        </div>

        {/* Invoice Commissions Detail */}
        {data.invoiceCommissions.details.length > 0 && (
          <div style={{ ...cardStyle, marginBottom: '20px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <DollarSign size={18} style={{ color: '#f59e0b' }} />
              Invoice Commissions
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {data.invoiceCommissions.details.map((d, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px', backgroundColor: theme.bg, borderRadius: '8px',
                  border: `1px solid ${d.status === 'available' ? 'rgba(34,197,94,0.3)' : 'rgba(249,115,22,0.3)'}`
                }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>{d.jobTitle}</div>
                    <div style={{ fontSize: '12px', color: theme.textMuted }}>
                      Invoice #{d.invoiceId} — {fmt(d.invoiceAmount)}
                      {d.remaining != null && ` (${fmt(d.remaining)} unpaid)`}
                      {d.jobStatus && ` — Job: ${d.jobStatus}`}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{
                      fontSize: '15px', fontWeight: '600',
                      color: d.status === 'available' ? '#22c55e' : '#f97316'
                    }}>{fmt(d.amount)}</div>
                    <span style={{
                      fontSize: '10px', padding: '2px 8px', borderRadius: '12px',
                      backgroundColor: d.status === 'available' ? 'rgba(34,197,94,0.1)' : 'rgba(249,115,22,0.1)',
                      color: d.status === 'available' ? '#22c55e' : '#f97316',
                      textTransform: 'uppercase', fontWeight: '600'
                    }}>{d.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Lead Commissions Detail */}
        {data.leadCommissions.details.length > 0 && (
          <div style={{ ...cardStyle, marginBottom: '20px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Users size={18} style={{ color: '#3b82f6' }} />
              Lead Commissions
            </h3>
            <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
              {data.leadCommissions.apptCount > 0 && (
                <div style={{ padding: '8px 16px', backgroundColor: 'rgba(59,130,246,0.1)', borderRadius: '8px', fontSize: '13px', color: '#3b82f6' }}>
                  {data.leadCommissions.apptCount} appointments set
                </div>
              )}
              {data.leadCommissions.sourceCount > 0 && (
                <div style={{ padding: '8px 16px', backgroundColor: 'rgba(139,92,246,0.1)', borderRadius: '8px', fontSize: '13px', color: '#8b5cf6' }}>
                  {data.leadCommissions.sourceCount} leads sourced
                </div>
              )}
            </div>
            <div style={{ fontSize: '18px', fontWeight: '600', color: '#f59e0b' }}>Total: {fmt(data.leadCommissions.total)}</div>
          </div>
        )}

        {/* Efficiency Bonus Detail */}
        {data.efficiencyBonus.details.length > 0 && (
          <div style={{ ...cardStyle, marginBottom: '20px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Zap size={18} style={{ color: '#8b5cf6' }} />
              Efficiency Bonuses
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {data.efficiencyBonus.details.map((d, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px', backgroundColor: theme.bg, borderRadius: '8px'
                }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>{d.jobTitle}</div>
                    <div style={{ fontSize: '12px', color: theme.textMuted }}>
                      Allotted: {d.allottedHours}h — Actual: {d.actualHours.toFixed(1)}h — Saved: {d.savedHours.toFixed(1)}h
                      {d.crewSize > 1 && ` (split ${d.crewSize} ways: ${d.employeeShare.toFixed(1)}h)`}
                    </div>
                  </div>
                  <div style={{ fontSize: '15px', fontWeight: '600', color: '#8b5cf6' }}>{fmt(d.bonusAmount)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Main Payroll View ────────────────────────────────────
  return (
    <div style={{ padding: '24px', maxWidth: '100%', overflowX: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>Payroll</h1>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {/* Role filter */}
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value)}
            style={{
              padding: '10px 12px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`,
              borderRadius: '10px', color: theme.textSecondary, fontSize: '14px', cursor: 'pointer'
            }}
          >
            <option value="all">All Roles</option>
            {uniqueRoles.map(r => <option key={r} value={r}>{r}</option>)}
          </select>

          <button
            onClick={() => setShowSettingsModal(true)}
            style={{
              padding: '10px 16px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`,
              borderRadius: '10px', color: theme.textMuted, fontSize: '14px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '8px'
            }}
          >
            <Settings size={18} /> Settings
          </button>
          {isAdmin && (
            <button
              onClick={() => setShowRunPayrollModal(true)}
              style={{
                padding: '10px 20px', background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                border: 'none', borderRadius: '10px', color: '#fff', fontSize: '14px', fontWeight: '600',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px'
              }}
            >
              <Play size={18} /> Run Payroll
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        {/* Pay Period */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <Calendar size={20} style={{ color: theme.accent }} />
            <span style={{ color: theme.textMuted, fontSize: '13px' }}>Pay Period</span>
          </div>
          <div style={{ fontSize: '16px', fontWeight: '600', color: theme.text }}>
            {periodStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {periodEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </div>
        </div>

        {/* Next Pay / Days Until */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <Clock size={20} style={{ color: '#3b82f6' }} />
            <span style={{ color: theme.textMuted, fontSize: '13px' }}>Next Payday</span>
          </div>
          <div style={{ fontSize: '16px', fontWeight: '600', color: theme.text }}>
            {nextPayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </div>
          <div style={{ fontSize: '12px', color: '#8b5cf6', fontWeight: '600', marginTop: '2px' }}>{daysUntil} days away</div>
        </div>

        {/* Total Payroll */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <DollarSign size={20} style={{ color: '#22c55e' }} />
            <span style={{ color: theme.textMuted, fontSize: '13px' }}>Total Payroll</span>
          </div>
          <div style={{ fontSize: '22px', fontWeight: '700', color: '#22c55e' }}>{fmt(totalPayroll)}</div>
        </div>

        {/* Commissions */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <TrendingUp size={20} style={{ color: '#f59e0b' }} />
            <span style={{ color: theme.textMuted, fontSize: '13px' }}>Commissions</span>
          </div>
          <div style={{ fontSize: '22px', fontWeight: '700', color: '#f59e0b' }}>{fmt(totalCommissions)}</div>
          {totalPendingCommissions > 0 && (
            <div style={{ fontSize: '12px', color: '#f97316', marginTop: '2px' }}>{fmt(totalPendingCommissions)} pending</div>
          )}
        </div>

        {/* Efficiency Bonuses */}
        {payrollConfig.efficiency_bonus_enabled && (
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <Zap size={20} style={{ color: '#8b5cf6' }} />
              <span style={{ color: theme.textMuted, fontSize: '13px' }}>Eff. Bonuses</span>
            </div>
            <div style={{ fontSize: '22px', fontWeight: '700', color: '#8b5cf6' }}>{fmt(totalBonuses)}</div>
          </div>
        )}
      </div>

      {/* Employee List */}
      <div style={{
        backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`,
        borderRadius: '12px', overflow: 'hidden', marginBottom: '24px'
      }}>
        <div style={{
          padding: '16px 20px', borderBottom: `1px solid ${theme.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center'
        }}>
          <div style={{ fontWeight: '600', color: theme.text }}>
            Employees ({filteredEmployees.length})
          </div>
          <div style={{ fontSize: '13px', color: theme.textMuted }}>
            {payrollConfig.commission_trigger === 'payment_received' && 'Commissions: when payment received'}
            {payrollConfig.commission_trigger === 'invoice_created' && 'Commissions: when invoice created'}
            {payrollConfig.commission_trigger === 'job_completed' && 'Commissions: when job completed'}
          </div>
        </div>

        {/* Table Header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr',
          padding: '10px 20px',
          fontSize: '12px',
          color: theme.textMuted,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          borderBottom: `1px solid ${theme.border}`,
          backgroundColor: theme.bg,
        }}>
          <span>Employee</span>
          <span style={{ textAlign: 'center' }}>Hours</span>
          <span style={{ textAlign: 'center' }}>Commissions</span>
          {payrollConfig.efficiency_bonus_enabled && <span style={{ textAlign: 'center' }}>Bonus</span>}
          {!payrollConfig.efficiency_bonus_enabled && <span style={{ textAlign: 'center' }}>PTO</span>}
          <span style={{ textAlign: 'center' }}>Pending</span>
          <span style={{ textAlign: 'right' }}>Gross Pay</span>
        </div>

        {filteredEmployees.map(emp => {
          const data = employeePayData[emp.id]
          if (!data) return null
          const ptoBalance = (emp.pto_accrued || 0) - (emp.pto_used || 0)
          const isExpanded = expandedEmployee === emp.id

          return (
            <div key={emp.id}>
              <div
                onClick={() => setSelectedEmployee(emp)}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr',
                  padding: '14px 20px',
                  borderBottom: `1px solid ${theme.border}`,
                  alignItems: 'center',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.bgCardHover || theme.bg}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                {/* Employee */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                  <div style={{
                    width: '38px', height: '38px', borderRadius: '10px',
                    backgroundColor: getAvatarColor(emp.name), display: 'flex', alignItems: 'center',
                    justifyContent: 'center', color: '#fff', fontWeight: '600', fontSize: '14px', flexShrink: 0,
                    overflow: 'hidden'
                  }}>
                    {emp.headshot_url ? (
                      <img src={emp.headshot_url} alt="" style={{ width: '38px', height: '38px', objectFit: 'cover' }} />
                    ) : (emp.name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: '600', color: theme.text, fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {emp.name}
                    </div>
                    <div style={{ fontSize: '12px', color: theme.textMuted, display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                      <span>{emp.role}</span>
                      {emp.skill_level && <span style={{ color: '#a855f7' }}>{emp.skill_level}</span>}
                      {emp.is_hourly && <span>${emp.hourly_rate}/hr</span>}
                      {emp.is_salary && <span>Salary</span>}
                    </div>
                  </div>
                </div>

                {/* Hours */}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: '600', color: theme.text, fontSize: '14px' }}>
                    {data.regularHours.toFixed(1)}
                  </div>
                  {data.overtimeHours > 0 && (
                    <div style={{ fontSize: '11px', color: '#f97316', fontWeight: '500' }}>+{data.overtimeHours.toFixed(1)} OT</div>
                  )}
                </div>

                {/* Commissions */}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: '600', color: data.commissionPay > 0 ? '#f59e0b' : theme.textMuted, fontSize: '14px' }}>
                    {data.commissionPay > 0 ? fmt(data.commissionPay) : '-'}
                  </div>
                </div>

                {/* Bonus or PTO */}
                {payrollConfig.efficiency_bonus_enabled ? (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontWeight: '600', color: data.efficiencyBonus.bonus > 0 ? '#8b5cf6' : theme.textMuted, fontSize: '14px' }}>
                      {data.efficiencyBonus.bonus > 0 ? fmt(data.efficiencyBonus.bonus) : '-'}
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontWeight: '600', color: ptoBalance <= 0 ? '#ef4444' : '#8b5cf6', fontSize: '14px' }}>
                      {ptoBalance.toFixed(1)}d
                    </div>
                  </div>
                )}

                {/* Pending */}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: '600', color: data.invoiceCommissions.pending > 0 ? '#f97316' : theme.textMuted, fontSize: '14px' }}>
                    {data.invoiceCommissions.pending > 0 ? fmt(data.invoiceCommissions.pending) : '-'}
                  </div>
                </div>

                {/* Gross Pay */}
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '16px', fontWeight: '700', color: '#22c55e' }}>
                    {fmt(data.grossPay)}
                  </div>
                </div>
              </div>
            </div>
          )
        })}

        {filteredEmployees.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: theme.textMuted }}>
            No employees match the current filter.
          </div>
        )}

        {/* Total Row */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr',
          padding: '16px 20px',
          backgroundColor: theme.bg,
          alignItems: 'center'
        }}>
          <span style={{ fontWeight: '600', color: theme.text }}>Total</span>
          <span />
          <div style={{ textAlign: 'center', fontWeight: '600', color: '#f59e0b' }}>{fmt(totalCommissions)}</div>
          {payrollConfig.efficiency_bonus_enabled ? (
            <div style={{ textAlign: 'center', fontWeight: '600', color: '#8b5cf6' }}>{fmt(totalBonuses)}</div>
          ) : <span />}
          <div style={{ textAlign: 'center', fontWeight: '600', color: '#f97316' }}>
            {totalPendingCommissions > 0 ? fmt(totalPendingCommissions) : '-'}
          </div>
          <div style={{ textAlign: 'right', fontSize: '20px', fontWeight: '700', color: '#22c55e' }}>{fmt(totalPayroll)}</div>
        </div>
      </div>

      {/* Pending Time Off Requests */}
      {isAdmin && timeOffRequests.length > 0 && (
        <div style={{
          backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`,
          borderRadius: '12px', overflow: 'hidden', marginBottom: '24px'
        }}>
          <div style={{
            padding: '16px 20px', borderBottom: `1px solid ${theme.border}`,
            display: 'flex', alignItems: 'center', gap: '10px'
          }}>
            <AlertTriangle size={18} style={{ color: '#eab308' }} />
            <span style={{ fontWeight: '600', color: theme.text }}>Pending Time Off Requests ({timeOffRequests.length})</span>
          </div>

          {timeOffRequests.map(request => (
            <div key={request.id} style={{
              padding: '16px 20px', borderBottom: `1px solid ${theme.border}`,
              display: 'flex', alignItems: 'center', gap: '16px'
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: '600', color: theme.text }}>{request.employee?.name || request.employee?.email}</div>
                <div style={{ fontSize: '13px', color: theme.textMuted }}>
                  {new Date(request.start_date).toLocaleDateString()} - {new Date(request.end_date).toLocaleDateString()}
                  <span style={{
                    marginLeft: '8px', padding: '2px 8px', backgroundColor: 'rgba(139,92,246,0.1)',
                    borderRadius: '12px', color: '#8b5cf6', fontSize: '11px', textTransform: 'uppercase'
                  }}>{request.request_type}</span>
                </div>
                {request.reason && <div style={{ fontSize: '13px', color: theme.textMuted, marginTop: '4px' }}>"{request.reason}"</div>}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => handleApproveRequest(request.id)} style={{
                  padding: '8px 16px', background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                  border: 'none', borderRadius: '8px', color: '#fff', fontSize: '13px', fontWeight: '600',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                }}><Check size={14} /> Approve</button>
                <button onClick={() => handleDenyRequest(request.id)} style={{
                  padding: '8px 16px', background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                  border: 'none', borderRadius: '8px', color: '#fff', fontSize: '13px', fontWeight: '600',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
                }}><X size={14} /> Deny</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Settings Modal ──────────────────────────────── */}
      {showSettingsModal && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px'
        }}>
          <div style={{
            backgroundColor: theme.bgCard, borderRadius: '16px', width: '100%',
            maxWidth: '520px', maxHeight: '90vh', overflow: 'auto'
          }}>
            <div style={{
              padding: '20px', borderBottom: `1px solid ${theme.border}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              position: 'sticky', top: 0, backgroundColor: theme.bgCard, zIndex: 1
            }}>
              <div style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>Payroll Settings</div>
              <button onClick={() => setShowSettingsModal(false)} style={{
                padding: '8px', backgroundColor: theme.border, border: 'none', borderRadius: '8px',
                cursor: 'pointer', color: theme.textMuted
              }}><X size={18} /></button>
            </div>

            <div style={{ padding: '20px' }}>
              {/* Pay Schedule */}
              <h4 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Calendar size={16} style={{ color: theme.accent }} />
                Pay Schedule
              </h4>
              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Pay Frequency</label>
                <select
                  value={payrollConfig.pay_frequency}
                  onChange={(e) => setPayrollConfig({ ...payrollConfig, pay_frequency: e.target.value })}
                  style={inputStyle}
                >
                  <option value="weekly">Weekly</option>
                  <option value="bi-weekly">Bi-Weekly</option>
                  <option value="semi-monthly">Semi-Monthly (1st & 15th)</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>

              {(payrollConfig.pay_frequency === 'bi-weekly' || payrollConfig.pay_frequency === 'semi-monthly') && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div>
                    <label style={labelStyle}>First Pay Day</label>
                    <input type="number" min="1" max="28" value={payrollConfig.pay_day_1}
                      onChange={(e) => setPayrollConfig({ ...payrollConfig, pay_day_1: e.target.value })}
                      style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Second Pay Day</label>
                    <input type="number" min="1" max="28" value={payrollConfig.pay_day_2}
                      onChange={(e) => setPayrollConfig({ ...payrollConfig, pay_day_2: e.target.value })}
                      style={inputStyle} />
                  </div>
                </div>
              )}

              {/* Overtime */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                <div>
                  <label style={labelStyle}>OT Threshold (hrs/week)</label>
                  <input type="number" min="0" value={payrollConfig.overtime_threshold}
                    onChange={(e) => setPayrollConfig({ ...payrollConfig, overtime_threshold: parseInt(e.target.value) || 40 })}
                    style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>OT Multiplier</label>
                  <input type="number" min="1" step="0.1" value={payrollConfig.overtime_multiplier}
                    onChange={(e) => setPayrollConfig({ ...payrollConfig, overtime_multiplier: parseFloat(e.target.value) || 1.5 })}
                    style={inputStyle} />
                </div>
              </div>

              <div style={{ height: '1px', backgroundColor: theme.border, margin: '20px 0' }} />

              {/* Commission Trigger */}
              <h4 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <DollarSign size={16} style={{ color: '#f59e0b' }} />
                Commission Rules
              </h4>
              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>When are commissions available?</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {[
                    { value: 'payment_received', label: 'When payment is received', desc: 'Commission becomes available only after the customer pays the invoice. Unpaid = pending.' },
                    { value: 'invoice_created', label: 'When invoice is created', desc: 'Commission is immediately available once the invoice is generated.' },
                    { value: 'job_completed', label: 'When job is completed', desc: 'Commission available once the job status is marked as complete.' }
                  ].map(opt => (
                    <label
                      key={opt.value}
                      style={{
                        display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px',
                        backgroundColor: payrollConfig.commission_trigger === opt.value ? `${theme.accent}15` : theme.bg,
                        border: `1px solid ${payrollConfig.commission_trigger === opt.value ? theme.accent : theme.border}`,
                        borderRadius: '8px', cursor: 'pointer'
                      }}
                    >
                      <input
                        type="radio"
                        name="commission_trigger"
                        value={opt.value}
                        checked={payrollConfig.commission_trigger === opt.value}
                        onChange={(e) => setPayrollConfig({ ...payrollConfig, commission_trigger: e.target.value })}
                        style={{ marginTop: '2px' }}
                      />
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>{opt.label}</div>
                        <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>{opt.desc}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div style={{ height: '1px', backgroundColor: theme.border, margin: '20px 0' }} />

              {/* Efficiency Bonus */}
              <h4 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Zap size={16} style={{ color: '#8b5cf6' }} />
                Efficiency Bonuses
              </h4>
              <label style={{
                display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px',
                padding: '12px', backgroundColor: theme.bg, borderRadius: '8px', cursor: 'pointer'
              }}>
                <input
                  type="checkbox"
                  checked={payrollConfig.efficiency_bonus_enabled}
                  onChange={(e) => setPayrollConfig({ ...payrollConfig, efficiency_bonus_enabled: e.target.checked })}
                />
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>Enable efficiency bonuses</div>
                  <div style={{ fontSize: '12px', color: theme.textMuted }}>
                    Reward crews that finish jobs under allotted time. Hours saved are split between crew members.
                  </div>
                </div>
              </label>

              {payrollConfig.efficiency_bonus_enabled && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={labelStyle}>Bonus rate per hour saved ($)</label>
                  <input
                    type="number" min="0" step="5"
                    value={payrollConfig.efficiency_bonus_rate}
                    onChange={(e) => setPayrollConfig({ ...payrollConfig, efficiency_bonus_rate: parseFloat(e.target.value) || 25 })}
                    style={inputStyle}
                  />
                  <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '4px' }}>
                    Example: A 10-hour job done in 7 hours by 2 techs = 3h saved, 1.5h each × ${payrollConfig.efficiency_bonus_rate} = ${(1.5 * payrollConfig.efficiency_bonus_rate).toFixed(2)} per tech
                  </div>
                </div>
              )}

              <button
                onClick={() => savePayrollConfig(payrollConfig)}
                disabled={savingSettings}
                style={{
                  width: '100%', padding: '14px', background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                  border: 'none', borderRadius: '10px', color: '#fff', fontSize: '15px', fontWeight: '600',
                  cursor: savingSettings ? 'wait' : 'pointer', marginTop: '8px'
                }}
              >
                {savingSettings ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Run Payroll Modal ──────────────────────────── */}
      {showRunPayrollModal && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px'
        }}>
          <div style={{
            backgroundColor: theme.bgCard, borderRadius: '16px', width: '100%',
            maxWidth: '440px', overflow: 'hidden'
          }}>
            <div style={{
              padding: '20px', borderBottom: `1px solid ${theme.border}`,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center'
            }}>
              <div style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>Run Payroll</div>
              <button onClick={() => setShowRunPayrollModal(false)} style={{
                padding: '8px', backgroundColor: theme.border, border: 'none', borderRadius: '8px',
                cursor: 'pointer', color: theme.textMuted
              }}><X size={18} /></button>
            </div>

            <div style={{ padding: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                <div style={{ padding: '16px', backgroundColor: theme.bg, borderRadius: '10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Period</div>
                  <div style={{ fontWeight: '600', color: theme.text }}>
                    {periodStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {periodEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                </div>
                <div style={{ padding: '16px', backgroundColor: theme.bg, borderRadius: '10px', textAlign: 'center' }}>
                  <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Pay Date</div>
                  <div style={{ fontWeight: '600', color: theme.text }}>
                    {nextPayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                </div>
              </div>

              <div style={{
                padding: '20px', backgroundColor: 'rgba(34,197,94,0.1)', borderRadius: '10px',
                textAlign: 'center', marginBottom: '20px'
              }}>
                <div style={{ fontSize: '14px', color: theme.textMuted, marginBottom: '4px' }}>
                  {activeEmployees.length} Employees
                </div>
                <div style={{ fontSize: '32px', fontWeight: '700', color: '#22c55e' }}>{fmt(totalPayroll)}</div>
                <div style={{ fontSize: '13px', color: theme.textMuted }}>Estimated Gross</div>
                {totalBonuses > 0 && (
                  <div style={{ fontSize: '13px', color: '#8b5cf6', marginTop: '4px' }}>
                    Includes {fmt(totalBonuses)} efficiency bonuses
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => setShowRunPayrollModal(false)} style={{
                  flex: 1, padding: '14px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`,
                  borderRadius: '10px', color: theme.text, fontSize: '15px', fontWeight: '600', cursor: 'pointer'
                }}>Cancel</button>
                <button onClick={handleRunPayroll} disabled={runningPayroll} style={{
                  flex: 1, padding: '14px', background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
                  border: 'none', borderRadius: '10px', color: '#fff', fontSize: '15px', fontWeight: '600',
                  cursor: runningPayroll ? 'wait' : 'pointer'
                }}>{runningPayroll ? 'Processing...' : 'Process Payroll'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
