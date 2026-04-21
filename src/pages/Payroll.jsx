import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { useIsMobile } from '../hooks/useIsMobile'
import { isAdmin as checkAdmin, isManager as checkManager, canViewHR } from '../lib/accessControl'
import {
  DollarSign, Calendar, Clock, Users, Settings, Play, Check, X,
  ChevronRight, ChevronDown, ChevronLeft, AlertTriangle, TrendingUp, Zap,
  Award, Filter, ArrowLeft, Eye, Briefcase, MapPin, FileText,
  Edit3, Save, Map as MapIcon, Plus, Minus, Printer, Mail, Send
} from 'lucide-react'
import LocationTrailModal from '../components/LocationTrailModal'
import SearchableSelect from '../components/SearchableSelect'
import RankBadge, { SCOUT_RANKS } from '../components/RankBadge'
import {
  getCurrentPayPeriod as sharedGetCurrentPayPeriod,
  calculateEfficiencyBonus as sharedCalculateEfficiencyBonus,
  timeClockToJobHours,
  calculateInvoiceCommissions as sharedCalculateInvoiceCommissions,
} from '../lib/bonusCalc'

const AVATAR_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e'
]

export default function Payroll() {
  const { theme } = useTheme()
  const isMobile = useIsMobile()
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
  const [leads, setLeads] = useState([])
  const [allPaymentsByInvoiceId, setAllPaymentsByInvoiceId] = useState(new Map())
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
  const [editingEntry, setEditingEntry] = useState(null) // { id, clock_in, clock_out, reason }
  const [savingEntry, setSavingEntry] = useState(false)
  const [locationTrailEntry, setLocationTrailEntry] = useState(null) // entry to show on map
  const [periodOffset, setPeriodOffset] = useState(0) // 0 = current, -1 = previous, etc.
  const [adjustments, setAdjustments] = useState([])
  const [verificationReports, setVerificationReports] = useState([])
  const [showAddTimeModal, setShowAddTimeModal] = useState(null) // employee object
  const [showAddCommissionModal, setShowAddCommissionModal] = useState(null) // employee object
  const [showAddAdjustmentModal, setShowAddAdjustmentModal] = useState(null) // { employee, type: 'deduction'|'addition' }
  const [showCheckStub, setShowCheckStub] = useState(null) // employee object
  const [savingModal, setSavingModal] = useState(false)

  // Payroll settings from settings table
  const [payrollConfig, setPayrollConfig] = useState({
    pay_frequency: 'bi-weekly',
    pay_day_1: '20',         // semi-monthly: first pay day of month
    pay_day_2: '5',          // semi-monthly: second pay day of month
    pay_anchor_date: '',     // bi-weekly: ISO date of any known past payday
    commission_trigger: 'payment_received', // payment_received, invoice_created, job_completed
    efficiency_bonus_enabled: false,
    efficiency_bonus_rate: 30, // $ per hour saved
    company_bonus_cut_percent: 20, // company keeps 20% of saved-hour value
    bonus_quality_gate: false, // require zero callbacks to qualify
    bonus_min_hours_saved: 0.5, // minimum hours saved to trigger bonus
    overtime_threshold: 40, // hours per week
    overtime_multiplier: 1.5,
  })
  const [skillLevelSettings, setSkillLevelSettings] = useState([])

  const isAdmin = checkAdmin(user)
  const isManagerPlus = checkManager(user)
  const hasHR = canViewHR(user)

  // Payroll requires BOTH Admin+ access AND the HR permission for the
  // full roster view. Non-HR users get redirected to /my-pay where they
  // can see their own commissions + hours.
  if (user && (!isAdmin || !hasHR)) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: '18px', fontWeight: '600', color: theme.text, marginBottom: '8px' }}>Access Restricted</div>
        <div style={{ fontSize: '14px', color: theme.textMuted, marginBottom: '16px' }}>
          {!isAdmin
            ? 'The full Payroll view is admin-only.'
            : 'Payroll access requires HR permission. Contact a Super Admin to request access.'}
        </div>
        <button onClick={() => navigate('/my-pay')} style={{
          padding: '10px 20px', backgroundColor: theme.accent, color: '#fff', border: 'none',
          borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer'
        }}>
          View My Pay →
        </button>
      </div>
    )
  }

  // Load payroll config from settings
  useEffect(() => {
    if (companyId) {
      loadPayrollConfig()
      fetchData()
    }
  }, [companyId, periodOffset])

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
    const [configRes, skillRes] = await Promise.all([
      supabase.from('settings').select('value').eq('company_id', companyId).eq('key', 'payroll_config').maybeSingle(),
      supabase.from('settings').select('value').eq('company_id', companyId).eq('key', 'skill_levels').maybeSingle()
    ])

    if (configRes.data?.value) {
      try {
        const parsed = JSON.parse(configRes.data.value)
        setPayrollConfig(prev => ({ ...prev, ...parsed }))
      } catch {}
    }

    if (skillRes.data?.value) {
      try {
        const parsed = JSON.parse(skillRes.data.value)
        // Normalize old string[] format to object[]
        setSkillLevelSettings(parsed.map(s => typeof s === 'string' ? { name: s, weight: 1 } : s))
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

  const saveTimeAdjustment = async () => {
    if (!editingEntry?.reason?.trim()) {
      alert('You must provide a reason for the adjustment')
      return
    }
    setSavingEntry(true)
    try {
      // Find the original entry to store original values
      const original = timeEntries.find(e => e.id === editingEntry.id)
      const newClockIn = new Date(editingEntry.clock_in)
      const newClockOut = editingEntry.clock_out ? new Date(editingEntry.clock_out) : null
      const newTotalHours = newClockOut ? Math.round((newClockOut - newClockIn) / 36e5 * 100) / 100 : null

      // Overlap guard for edits — check against OTHER entries (skip self)
      if (newClockOut) {
        const overlap = await findOverlap(original.employee_id, newClockIn, newClockOut, editingEntry.id)
        if (overlap) {
          const proceed = window.confirm(formatOverlapPrompt(overlap))
          if (!proceed) { setSavingEntry(false); return }
        }
      }

      // Find the admin employee record
      const adminEmp = employees.find(e => e.email === user?.email)

      const updateData = {
        clock_in: newClockIn.toISOString(),
        clock_out: newClockOut ? newClockOut.toISOString() : null,
        total_hours: newTotalHours,
        job_id: editingEntry.job_id ? parseInt(editingEntry.job_id) : null,
        adjusted_by: adminEmp?.id || null,
        adjusted_at: new Date().toISOString(),
        adjustment_reason: editingEntry.reason.trim(),
      }

      // Only store original values on first adjustment
      if (!original.original_clock_in) {
        updateData.original_clock_in = original.clock_in
        updateData.original_clock_out = original.clock_out
        updateData.original_total_hours = original.total_hours
      }

      const { error } = await supabase
        .from('time_clock')
        .update(updateData)
        .eq('id', editingEntry.id)

      if (error) throw error
      setEditingEntry(null)
      await fetchData()
    } catch (err) {
      alert('Error saving adjustment: ' + err.message)
    } finally {
      setSavingEntry(false)
    }
  }

  // Supabase queries default to 1000 rows. For tables that commonly exceed
  // that (jobs, invoices, payments), walk pages with .range() until
  // exhausted. Returns { data, error } shaped like a normal supabase call.
  const fetchAllPages = async (buildQuery, pageSize = 1000) => {
    const all = []
    for (let from = 0; ; from += pageSize) {
      const to = from + pageSize - 1
      const { data, error } = await buildQuery().range(from, to)
      if (error) return { data: null, error }
      all.push(...(data || []))
      if (!data || data.length < pageSize) break
    }
    return { data: all, error: null }
  }

  const fetchData = async () => {
    setLoading(true)
    try {
      const { periodStart, periodEnd } = getCurrentPeriod()

      // Parallel fetches for all data
      const periodStartStr = periodStart.toISOString().split('T')[0]
      const periodEndStr = periodEnd.toISOString().split('T')[0]

      const [entriesRes, timeLogRes, commRes, paymentsRes, invoicesRes, jobsRes, requestsRes, adjRes, verRes, leadsRes, allPaymentsRes] = await Promise.all([
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
          .gte('date', periodStartStr)
          .lte('date', periodEndStr),

        // All invoices (need for commission chain).
        // Supabase default limit is 1000 rows; HHH has >5k invoices, so we
        // page with .range() inside fetchAllPages() below.
        fetchAllPages(() => supabase
          .from('invoices')
          .select('id, company_id, job_id, invoice_id, amount, payment_status, amount_paid, total_paid, created_at, last_sent_at, job_description')
          .eq('company_id', companyId)),

        // All jobs (need for efficiency bonuses + commission chain). Same
        // pagination applies — HHH has >6k jobs.
        fetchAllPages(() => supabase
          .from('jobs')
          .select('id, company_id, job_id, salesperson_id, lead_id, allotted_time_hours, status, customer_name, job_title, assigned_team')
          .eq('company_id', companyId)),

        // Pending time off requests
        supabase
          .from('time_off_requests')
          .select('*, employee:employees(name, email)')
          .eq('company_id', companyId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false }),

        // Payroll adjustments for this period (matching period OR recurring)
        supabase
          .from('payroll_adjustments')
          .select('*')
          .eq('company_id', companyId)
          .or(`and(pay_period_start.eq.${periodStartStr},pay_period_end.eq.${periodEndStr}),recurring.eq.true`),

        // Victor verification reports — needed to gate efficiency bonus on
        // completion + daily checks. We pull all reports in the period and
        // bucket them in state; bonusCalc reads two Sets (verifiedJobIds +
        // dailyVerifiedJobDays) built from this below.
        supabase
          .from('verification_reports')
          .select('job_id, verification_type, score, created_at')
          .eq('company_id', companyId)
          .eq('voided', false)
          .gte('score', 60)
          .gte('created_at', periodStart.toISOString())
          .lte('created_at', periodEnd.toISOString()),

        // All leads — needed so commission calc can fall back to
        // lead.salesperson_id when jobs.salesperson_id is null (which is
        // the case for 97% of jobs).
        supabase
          .from('leads')
          .select('id, salesperson_id, salesperson_ids')
          .eq('company_id', companyId),

        // All payments (any date) — needed to compute lifetime paid per
        // invoice so the pending-commission bucket subtracts what's
        // already been paid (including in past periods).
        fetchAllPages(() => supabase
          .from('payments')
          .select('id, invoice_id, amount')
          .eq('company_id', companyId)),
      ])

      setTimeEntries(entriesRes.data || [])
      setTimeLogEntries(timeLogRes.data || [])
      setLeadCommissions(commRes.data || [])
      setPayments(paymentsRes.data || [])
      setInvoices(invoicesRes.data || [])
      setJobs(jobsRes.data || [])
      setLeads(leadsRes?.data || [])
      // Build invoice_id -> totalPaid lookup (lifetime, all periods).
      const paidByInvoice = new Map()
      ;(allPaymentsRes?.data || []).forEach(p => {
        if (!p.invoice_id) return
        paidByInvoice.set(p.invoice_id, (paidByInvoice.get(p.invoice_id) || 0) + (parseFloat(p.amount) || 0))
      })
      setAllPaymentsByInvoiceId(paidByInvoice)
      setTimeOffRequests(requestsRes.data || [])
      setAdjustments(adjRes.data || [])
      setVerificationReports(verRes.data || [])
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  // ── Period Calculations (shared with FieldScout) ────────────────────
  const getCurrentPeriod = () => sharedGetCurrentPayPeriod(payrollConfig, periodOffset)

  const getNextPayDate = () => {
    const today = new Date()
    const day1 = parseInt(payrollConfig.pay_day_1) || 20
    const day2 = parseInt(payrollConfig.pay_day_2) || 5
    let nextPay = new Date(today)

    if (payrollConfig.pay_frequency === 'weekly') {
      // Next Friday (standard weekly payroll day)
      const daysUntilFriday = (5 - today.getDay() + 7) % 7 || 7
      nextPay.setDate(today.getDate() + daysUntilFriday)
    } else if (payrollConfig.pay_frequency === 'bi-weekly') {
      // Use the configured anchor date (any past payday). Step forward in
      // 14-day chunks until we're >= today.
      const anchorStr = payrollConfig.pay_anchor_date || '2024-01-05'
      const anchor = new Date(anchorStr + 'T00:00:00')
      const MS_PER_DAY = 86400000
      const daysSinceAnchor = Math.floor((today - anchor) / MS_PER_DAY)
      const cycle = ((daysSinceAnchor % 14) + 14) % 14
      const daysUntilPayday = cycle === 0 ? 0 : 14 - cycle
      nextPay = new Date(today)
      nextPay.setDate(today.getDate() + daysUntilPayday)
    } else if (payrollConfig.pay_frequency === 'semi-monthly') {
      // Next pay_day_1 or pay_day_2 (day-of-month), whichever comes first.
      // Normalise so the smaller one is checked first regardless of how the
      // admin entered them.
      const first = Math.min(day1, day2)
      const second = Math.max(day1, day2)
      if (today.getDate() < first) {
        nextPay = new Date(today.getFullYear(), today.getMonth(), first)
      } else if (today.getDate() < second) {
        nextPay = new Date(today.getFullYear(), today.getMonth(), second)
      } else {
        nextPay = new Date(today.getFullYear(), today.getMonth() + 1, first)
      }
    } else {
      // monthly — last day of current month (or next month if already past)
      const eom = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      nextPay = today.getDate() < eom.getDate() ? eom : new Date(today.getFullYear(), today.getMonth() + 2, 0)
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
    const empTimeLogs = timeLogEntries.filter(e => e.employee_id === employeeId)
    let regularHours = 0
    let overtimeHours = 0

    // Group by week for overtime (combine time_clock + time_log)
    const weeklyHours = {}
    const addToWeek = (date, hours) => {
      const weekStart = new Date(date)
      weekStart.setDate(weekStart.getDate() - weekStart.getDay())
      const weekKey = weekStart.toISOString().split('T')[0]
      weeklyHours[weekKey] = (weeklyHours[weekKey] || 0) + hours
    }

    // time_clock entries
    empEntries.forEach(entry => {
      let hours = entry.total_hours
      if (!hours && entry.clock_in && entry.clock_out) {
        hours = Math.round((new Date(entry.clock_out) - new Date(entry.clock_in)) / 36e5 * 100) / 100
      }
      if (!hours) return
      addToWeek(new Date(entry.clock_in), hours)
    })

    // time_log entries (job-level hours)
    empTimeLogs.forEach(entry => {
      if (!entry.hours) return
      const entryDate = new Date(entry.date || entry.clock_in_time || entry.created_at)
      addToWeek(entryDate, entry.hours)
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

  // Invoice-based commissions — delegates to bonusCalc.calculateInvoiceCommissions
  // so MyPay (rep self-view) and Payroll (admin) stay in sync.
  const calculateInvoiceCommissions = (employeeId) => {
    const employee = employees.find(e => e.id === employeeId)
    if (!employee) return { available: 0, pending: 0, details: [] }
    const { periodStart, periodEnd } = getCurrentPeriod()
    return sharedCalculateInvoiceCommissions({
      employee,
      jobs,
      invoices,
      leads,
      inPeriodPayments: payments,
      allPaymentsByInvoiceId,
      payrollConfig,
      periodStartStr: periodStart.toISOString().split('T')[0],
      periodEndStr: periodEnd.toISOString().split('T')[0],
    })
  }

  /* Original inline version (kept for reference — now shared in bonusCalc.js)
  //
  // Three trigger modes, all anchored to the rep's commission rate on the
  // full invoice amount ($inv × rate = total possible commission per job):
  //
  //  payment_received — earn proportionally to payments received in-period.
  //    A $10k invoice at 10% = $1,000 total. A $4,000 in-period payment
  //    earns $400 (40% of $1,000). Pending = (unpaid balance × rate) for
  //    every invoice the rep owns that still has a balance.
  //
  //  invoice_created  — full commission available the period the invoice
  //    is created. Pending = any invoice created before this period that
  //    hasn't been paid out yet (we don't track per-period payout history
  //    so pending defaults to zero here).
  //
  //  job_completed    — full commission available the period the job is
  //    marked Completed. Pending = invoices on jobs not yet complete.
  const calculateInvoiceCommissions = (employeeId) => {
    const employee = employees.find(e => e.id === employeeId)
    if (!employee?.is_commission) return { available: 0, pending: 0, details: [] }

    const details = []
    let available = 0
    let pending = 0

    // Rate resolution: prefer services rate, fall back to goods rate if
    // services is zero. Commission type must be percent for scaling to
    // payment amount to make sense; flat rates pay once per invoice.
    const svcRate = parseFloat(employee.commission_services_rate) || 0
    const svcType = employee.commission_services_type || 'percent'
    const goodsRate = parseFloat(employee.commission_goods_rate) || 0
    const goodsType = employee.commission_goods_type || 'percent'
    const rate = svcRate > 0 ? svcRate : goodsRate
    const rateType = svcRate > 0 ? svcType : goodsType

    if (rate <= 0) return { available: 0, pending: 0, details: [] }

    const commissionOn = (amount) => rateType === 'percent' ? amount * (rate / 100) : rate

    // Get all jobs where this employee is the salesperson
    const empJobs = jobs.filter(j => j.salesperson_id === employeeId)
    const empJobIds = empJobs.map(j => j.id)

    // Get invoices for those jobs
    const empInvoices = invoices.filter(inv => empJobIds.includes(inv.job_id))

    // Current period window — needed for payment_received trigger
    const { periodStart, periodEnd } = getCurrentPeriod()
    const periodStartStr = periodStart.toISOString().split('T')[0]
    const periodEndStr = periodEnd.toISOString().split('T')[0]

    empInvoices.forEach(inv => {
      const invAmount = parseFloat(inv.amount) || 0
      if (invAmount <= 0) return

      const job = empJobs.find(j => j.id === inv.job_id)
      const jobLabel = job?.job_title || job?.customer_name || inv.job_description || 'Unknown'
      const fullCommission = commissionOn(invAmount)
      if (fullCommission <= 0) return

      if (payrollConfig.commission_trigger === 'payment_received') {
        // payments is already period-filtered; match by invoice_id
        const inPeriodPayments = payments.filter(p => p.invoice_id === inv.id)
        const paidInPeriod = inPeriodPayments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)

        if (paidInPeriod > 0) {
          // Proportional commission. For flat rates this would over-pay on
          // partial payments, so we cap at fullCommission across all periods
          // combined (approximated here by only paying flat if fully paid).
          const earned = rateType === 'percent'
            ? commissionOn(paidInPeriod)
            : (paidInPeriod >= invAmount ? fullCommission : 0)
          if (earned > 0) {
            available += earned
            details.push({
              type: 'invoice_commission',
              status: 'available',
              amount: earned,
              invoiceId: inv.invoice_id,
              invoiceDbId: inv.id,
              jobId: inv.job_id,
              jobTitle: jobLabel,
              invoiceAmount: invAmount,
              paidAmount: paidInPeriod,
              paidDate: inPeriodPayments[0]?.date,
              rate,
              rateType,
            })
          }
        }

        // Pending = remaining unpaid balance × rate, regardless of period.
        // Helps reps see what's still owed them on outstanding invoices.
        // We approximate totalPaid from invoice.payment_status + amount_paid
        // field if present; fallback to 0 when status is Pending.
        const totalPaidAllTime = inv.payment_status === 'Paid'
          ? invAmount
          : parseFloat(inv.amount_paid || inv.total_paid || 0)
        const remaining = Math.max(0, invAmount - totalPaidAllTime)
        if (remaining > 0 && inv.payment_status !== 'Paid') {
          const pendingAmt = rateType === 'percent' ? commissionOn(remaining) : fullCommission
          pending += pendingAmt
          details.push({
            type: 'invoice_commission',
            status: 'pending',
            amount: pendingAmt,
            invoiceId: inv.invoice_id,
            invoiceDbId: inv.id,
            jobId: inv.job_id,
            jobTitle: jobLabel,
            invoiceAmount: invAmount,
            paidAmount: totalPaidAllTime,
            remaining,
            rate,
            rateType,
            paymentStatus: inv.payment_status,
          })
        }
      } else if (payrollConfig.commission_trigger === 'invoice_created') {
        // Available this period if invoice was created in this period
        const createdStr = (inv.created_at || '').split('T')[0]
        const inPeriod = createdStr >= periodStartStr && createdStr <= periodEndStr
        if (inPeriod) {
          available += fullCommission
          details.push({
            type: 'invoice_commission',
            status: 'available',
            amount: fullCommission,
            invoiceId: inv.invoice_id,
            invoiceDbId: inv.id,
            jobId: inv.job_id,
            jobTitle: jobLabel,
            invoiceAmount: invAmount,
            createdDate: inv.created_at,
            rate,
            rateType,
          })
        }
        // (No pending bucket for invoice_created — commission is earned at
        // creation time; past-period earnings aren't tracked here.)
      } else if (payrollConfig.commission_trigger === 'job_completed') {
        const isComplete = job?.status === 'Completed' || job?.status === 'Complete'
        if (isComplete) {
          // Completed jobs → available in the period the job was marked complete.
          // We don't store job completion timestamp cleanly, so we attribute
          // to current period if status is Completed and the invoice exists.
          // This is an approximation — a completion timestamp would be better.
          available += fullCommission
          details.push({
            type: 'invoice_commission',
            status: 'available',
            amount: fullCommission,
            invoiceId: inv.invoice_id,
            invoiceDbId: inv.id,
            jobId: inv.job_id,
            jobTitle: jobLabel,
            invoiceAmount: invAmount,
            rate,
            rateType,
          })
        } else {
          pending += fullCommission
          details.push({
            type: 'invoice_commission',
            status: 'pending',
            amount: fullCommission,
            invoiceId: inv.invoice_id,
            invoiceDbId: inv.id,
            jobId: inv.job_id,
            jobTitle: jobLabel,
            invoiceAmount: invAmount,
            jobStatus: job?.status || 'In Progress',
            rate,
            rateType,
          })
        }
      }
    })

    return { available, pending, details }
  }
  */

  // Lead commissions (appointment setting, sourcing)
  const calculateLeadCommissions = (employeeId) => {
    const empCommissions = leadCommissions.filter(c => c.employee_id === employeeId)
    const total = empCommissions.reduce((sum, c) => sum + (c.amount || 0), 0)
    const apptCount = empCommissions.filter(c => c.commission_type === 'appointment_set').length
    const sourceCount = empCommissions.filter(c => c.commission_type === 'lead_source').length
    return { total, apptCount, sourceCount, details: empCommissions }
  }

  // Efficiency bonuses: allotted hours - actual hours, weighted split between crew.
  // Logic lives in src/lib/bonusCalc.js so FieldScout can render the same numbers.
  // We feed it time_clock rows (normalized), so admin time edits on this page
  // automatically flow into the bonus calc — one source of truth.
  //
  // Victor gates: jobs without a passing completion verification get skipped,
  // and employees lose a proportional share for any job-day they worked
  // without a daily verification (coverageRatio < 1 in bonusCalc).
  const verifiedJobIds = new Set(
    (verificationReports || [])
      .filter(r => r.verification_type === 'completion')
      .map(r => r.job_id)
      .filter(Boolean)
  )
  const dailyVerifiedJobDays = new Set(
    (verificationReports || [])
      .filter(r => r.verification_type === 'daily' && r.created_at && r.job_id)
      .map(r => `${r.job_id}|${new Date(r.created_at).toISOString().split('T')[0]}`)
  )
  const calculateEfficiencyBonus = (employeeId) => sharedCalculateEfficiencyBonus({
    employeeId,
    timeLogEntries: timeClockToJobHours(timeEntries),
    timeClockRows: timeEntries,
    jobs,
    employees,
    skillLevels: skillLevelSettings,
    payrollConfig,
    verifiedJobIds,
    dailyVerifiedJobDays,
  })

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

    // Payroll adjustments
    const empAdjustments = adjustments.filter(a => a.employee_id === employee.id)
    const totalAdditions = empAdjustments.filter(a => a.type === 'addition').reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0)
    const totalDeductions = empAdjustments.filter(a => a.type === 'deduction').reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0)
    const netPay = grossPay + totalAdditions - totalDeductions

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
      totalAdditions: Math.round(totalAdditions * 100) / 100,
      totalDeductions: Math.round(totalDeductions * 100) / 100,
      netPay: Math.round(netPay * 100) / 100,
      adjustments: empAdjustments,
    }
  }

  // ── Aggregate Data ───────────────────────────────────────
  const activeEmployees = useMemo(() =>
    employees.filter(e => e.active && (isManagerPlus || e.id === user?.id)),
    [employees, isManagerPlus, user]
  )

  const employeePayData = useMemo(() => {
    const data = {}
    activeEmployees.forEach(emp => {
      data[emp.id] = calculateFullPay(emp)
    })
    return data
  }, [activeEmployees, timeEntries, timeLogEntries, payments, invoices, jobs, leadCommissions, payrollConfig, skillLevelSettings, adjustments])

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

  // Add manual time entry
  const handleAddTimeEntry = async (formData) => {
    setSavingModal(true)
    try {
      const clockIn = new Date(formData.date + 'T' + formData.startTime)
      const clockOut = new Date(formData.date + 'T' + formData.endTime)
      const totalHours = Math.round((clockOut - clockIn) / 36e5 * 100) / 100
      if (totalHours <= 0) { alert('End time must be after start time'); setSavingModal(false); return }

      // Overlap guard — if the admin is adding a window that collides with
      // an existing time_clock row for the same employee, surface it and
      // force a conscious decision. This is the fix for "fixing hours
      // creates duplicates or overlapping times" — the save now blocks
      // unless the admin confirms they really want the overlap.
      const overlap = await findOverlap(formData.employeeId, clockIn, clockOut)
      if (overlap) {
        const msg = formatOverlapPrompt(overlap)
        const proceed = window.confirm(msg)
        if (!proceed) { setSavingModal(false); return }
      }

      const adminEmp = employees.find(e => e.email === user?.email)
      const { error } = await supabase.from('time_clock').insert({
        company_id: companyId,
        employee_id: formData.employeeId,
        clock_in: clockIn.toISOString(),
        clock_out: clockOut.toISOString(),
        total_hours: totalHours,
        job_id: formData.jobId || null,
        adjusted_by: adminEmp?.id || null,
        adjusted_at: new Date().toISOString(),
        adjustment_reason: formData.reason || 'Manual entry by admin',
      })
      if (error) throw error
      setShowAddTimeModal(null)
      await fetchData()
    } catch (err) { alert('Error: ' + err.message) }
    finally { setSavingModal(false) }
  }

  // Returns the first existing time_clock row that overlaps the given
  // window for this employee (null if none). Optionally pass excludeId
  // to skip the row being edited.
  const findOverlap = async (employeeId, clockIn, clockOut, excludeId = null) => {
    // Fetch rows whose window could possibly overlap — cheaper to filter
    // server-side on the same calendar day +/- 1 to catch cross-midnight
    // entries.
    const dayStart = new Date(clockIn); dayStart.setDate(dayStart.getDate() - 1); dayStart.setHours(0,0,0,0)
    const dayEnd = new Date(clockOut); dayEnd.setDate(dayEnd.getDate() + 1); dayEnd.setHours(23,59,59,999)
    const { data } = await supabase
      .from('time_clock')
      .select('id, clock_in, clock_out')
      .eq('company_id', companyId)
      .eq('employee_id', employeeId)
      .gte('clock_in', dayStart.toISOString())
      .lte('clock_in', dayEnd.toISOString())
    for (const r of (data || [])) {
      if (excludeId && r.id === excludeId) continue
      const rIn = new Date(r.clock_in).getTime()
      const rOut = r.clock_out ? new Date(r.clock_out).getTime() : rIn
      const nIn = clockIn.getTime()
      const nOut = clockOut.getTime()
      // overlap if windows intersect. Treat equal timestamps as overlap too.
      if (nIn < rOut && nOut > rIn) return r
      if (nIn === rIn && nOut === rOut) return r
    }
    return null
  }

  const formatOverlapPrompt = (existing) => {
    const fmtDt = (iso) => iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '(open)'
    return `This time entry overlaps an existing one:\n\n  ${fmtDt(existing.clock_in)}  →  ${fmtDt(existing.clock_out)}\n\nSaving will create a duplicate/overlapping row.\n\nOK to save anyway, Cancel to go back and edit the existing entry instead.`
  }

  // Add manual commission
  const handleAddCommission = async (formData) => {
    setSavingModal(true)
    try {
      const { error } = await supabase.from('lead_commissions').insert({
        company_id: companyId,
        employee_id: formData.employeeId,
        amount: parseFloat(formData.amount) || 0,
        commission_type: formData.commissionType || 'manual',
        description: formData.description || 'Manual commission entry',
        created_at: new Date().toISOString(),
      })
      if (error) throw error
      setShowAddCommissionModal(null)
      await fetchData()
    } catch (err) { alert('Error: ' + err.message) }
    finally { setSavingModal(false) }
  }

  // Add payroll adjustment (deduction or addition)
  const handleAddAdjustment = async (formData) => {
    setSavingModal(true)
    try {
      const { periodStart: ps, periodEnd: pe } = getCurrentPeriod()
      const adminEmp = employees.find(e => e.email === user?.email)
      const { error } = await supabase.from('payroll_adjustments').insert({
        company_id: companyId,
        employee_id: formData.employeeId,
        type: formData.type,
        amount: parseFloat(formData.amount) || 0,
        reason: formData.reason || '',
        recurring: formData.recurring || false,
        pay_period_start: ps.toISOString().split('T')[0],
        pay_period_end: pe.toISOString().split('T')[0],
        created_by: adminEmp?.id || null,
      })
      if (error) throw error
      setShowAddAdjustmentModal(null)
      await fetchData()
    } catch (err) { alert('Error: ' + err.message) }
    finally { setSavingModal(false) }
  }

  // Delete a payroll adjustment
  const handleDeleteAdjustment = async (adjId) => {
    if (!confirm('Remove this adjustment?')) return
    try {
      await supabase.from('payroll_adjustments').delete().eq('id', adjId)
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
          gross_pay: data.grossPay,
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
      <div style={{ padding: isMobile ? '16px' : '24px', textAlign: 'center', color: theme.textMuted }}>
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
      <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '900px' }}>
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
        <div style={{ ...cardStyle, marginBottom: '20px', display: 'flex', alignItems: 'center', gap: isMobile ? '12px' : '20px', flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
          <div style={{
            width: isMobile ? '48px' : '64px', height: isMobile ? '48px' : '64px', borderRadius: '14px',
            backgroundColor: getAvatarColor(emp.name), display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: '#fff', fontWeight: '700', fontSize: isMobile ? '18px' : '24px', flexShrink: 0,
            overflow: 'hidden'
          }}>
            {emp.headshot_url ? (
              <img src={emp.headshot_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (emp.name || '?').charAt(0).toUpperCase()}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontSize: isMobile ? '18px' : '20px', fontWeight: '700', color: theme.text }}>{emp.name}</h2>
            <div style={{ fontSize: isMobile ? '12px' : '14px', color: theme.textMuted, display: 'flex', gap: isMobile ? '8px' : '12px', flexWrap: 'wrap', marginTop: '4px' }}>
              <span>{emp.role}</span>
              {emp.skill_level && <RankBadge rank={emp.skill_level} weight={(() => { const sl = skillLevelSettings.find(s => (s.name || s) === emp.skill_level); return sl?.weight })() } theme={theme} />}
              {emp.is_hourly && <span>${emp.hourly_rate}/hr</span>}
              {emp.is_salary && <span>${(emp.annual_salary || 0).toLocaleString()}/yr</span>}
              <span style={{ color: '#8b5cf6' }}>PTO: {ptoBalance.toFixed(1)} days</span>
            </div>
          </div>
          <div style={{ textAlign: isMobile ? 'left' : 'right', width: isMobile ? '100%' : 'auto' }}>
            <div style={{ fontSize: '14px', color: theme.textMuted }}>Net Pay</div>
            <div style={{ fontSize: isMobile ? '24px' : '28px', fontWeight: '700', color: '#22c55e' }}>{fmt(data.netPay)}</div>
            {(data.totalAdditions > 0 || data.totalDeductions > 0) && (
              <div style={{ fontSize: '12px', color: theme.textMuted }}>Gross: {fmt(data.grossPay)}</div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        {isAdmin && (
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <button onClick={() => setShowAddTimeModal(emp)} style={{
              padding: '8px 14px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`,
              borderRadius: '8px', color: theme.textSecondary, fontSize: '13px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}><Plus size={14} /><Clock size={14} /> Add Time</button>
            <button onClick={() => setShowAddCommissionModal(emp)} style={{
              padding: '8px 14px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`,
              borderRadius: '8px', color: theme.textSecondary, fontSize: '13px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}><Plus size={14} /><DollarSign size={14} /> Add Commission</button>
            <button onClick={() => setShowAddAdjustmentModal({ employee: emp, type: 'addition' })} style={{
              padding: '8px 14px', backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)',
              borderRadius: '8px', color: '#22c55e', fontSize: '13px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}><Plus size={14} /> Addition</button>
            <button onClick={() => setShowAddAdjustmentModal({ employee: emp, type: 'deduction' })} style={{
              padding: '8px 14px', backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: '8px', color: '#ef4444', fontSize: '13px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px'
            }}><Minus size={14} /> Deduction</button>
            <button onClick={() => setShowCheckStub(emp)} style={{
              padding: '8px 14px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`,
              borderRadius: '8px', color: theme.textSecondary, fontSize: '13px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px', marginLeft: 'auto'
            }}><FileText size={14} /> Check Stub</button>
          </div>
        )}

        {/* Pay Breakdown */}
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '20px' }}>
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

        {/* Payroll Adjustments */}
        {data.adjustments.length > 0 && (
          <div style={{ ...cardStyle, marginBottom: '20px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={18} style={{ color: theme.accent }} />
              Payroll Adjustments
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {data.adjustments.map((adj) => (
                <div key={adj.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px', backgroundColor: theme.bg, borderRadius: '8px',
                  border: `1px solid ${adj.type === 'addition' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`
                }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>{adj.reason || adj.type}</div>
                    <div style={{ fontSize: '12px', color: theme.textMuted }}>
                      {adj.recurring && <span style={{ color: '#8b5cf6', marginRight: '8px' }}>Recurring</span>}
                      {adj.created_by && <span>Added by {employees.find(e => e.id === adj.created_by)?.name || 'Admin'}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{
                      fontSize: '15px', fontWeight: '600',
                      color: adj.type === 'addition' ? '#22c55e' : '#ef4444'
                    }}>{adj.type === 'addition' ? '+' : '-'}{fmt(adj.amount)}</div>
                    {isAdmin && (
                      <button onClick={() => handleDeleteAdjustment(adj.id)} style={{
                        padding: '4px', background: 'none', border: `1px solid ${theme.border}`, borderRadius: '4px',
                        cursor: 'pointer', color: theme.textMuted, display: 'flex', alignItems: 'center'
                      }}><X size={12} /></button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div style={{
              marginTop: '12px', padding: '10px 12px', borderRadius: '8px',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              backgroundColor: data.netPay >= data.grossPay ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)'
            }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: theme.textSecondary }}>Net After Adjustments</span>
              <span style={{ fontSize: '16px', fontWeight: '700', color: data.netPay >= data.grossPay ? '#22c55e' : '#ef4444' }}>
                {fmt(data.netPay)}
              </span>
            </div>
          </div>
        )}

        {/* Commission Detail — earned this period + pending on open invoices */}
        {(() => {
          const commData = calculateInvoiceCommissions(emp.id)
          if (!commData.details.length) return null
          const earned = commData.details.filter(d => d.status === 'available')
          const pendingList = commData.details.filter(d => d.status === 'pending')
          return (
            <div style={{ ...cardStyle, marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                  <DollarSign size={18} style={{ color: '#f59e0b' }} />
                  Commissions
                </h3>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '11px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Earned this period</div>
                    <div style={{ fontSize: '18px', fontWeight: '700', color: '#22c55e' }}>{fmt(commData.available)}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '11px', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Pending (unpaid)</div>
                    <div style={{ fontSize: '18px', fontWeight: '700', color: '#f59e0b' }}>{fmt(commData.pending)}</div>
                  </div>
                </div>
              </div>

              {earned.length > 0 && (
                <>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: '#22c55e', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                    Earned this period ({earned.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: pendingList.length > 0 ? '16px' : 0 }}>
                    {earned.map((d, i) => (
                      <div key={`e-${i}`} style={{ padding: '10px 12px', backgroundColor: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.jobTitle}</div>
                          <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '2px' }}>
                            {d.invoiceId} · ${(d.paidAmount || d.invoiceAmount).toFixed(2)} paid
                            {d.paidDate && ` on ${new Date(d.paidDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                            {d.rateType === 'percent' && ` · ${d.rate}%`}
                          </div>
                        </div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#22c55e', whiteSpace: 'nowrap' }}>{fmt(d.amount)}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {pendingList.length > 0 && (
                <>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                    Won jobs · pending payment ({pendingList.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {pendingList.map((d, i) => (
                      <div key={`p-${i}`} style={{ padding: '10px 12px', backgroundColor: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: 600, color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.jobTitle}</div>
                          <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '2px' }}>
                            {d.invoiceId} · {d.paymentStatus || d.jobStatus || 'Open'}
                            {d.remaining != null && ` · $${d.remaining.toFixed(2)} unpaid`}
                            {d.rateType === 'percent' && ` · ${d.rate}%`}
                          </div>
                        </div>
                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#f59e0b', whiteSpace: 'nowrap' }}>{fmt(d.amount)}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )
        })()}

        {/* Time Clock Entries */}
        {(() => {
          const empClockEntries = timeEntries.filter(e => e.employee_id === emp.id)
          if (empClockEntries.length === 0 && timeLogEntries.filter(e => e.employee_id === emp.id && e.hours).length === 0) return null
          const empLogs = timeLogEntries.filter(e => e.employee_id === emp.id && e.hours)
          return (
            <>
              {empClockEntries.length > 0 && (
                <div style={{ ...cardStyle, marginBottom: '20px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Clock size={18} style={{ color: '#3b82f6' }} />
                    Time Clock Entries ({empClockEntries.length})
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {empClockEntries
                      .sort((a, b) => new Date(b.clock_in) - new Date(a.clock_in))
                      .map((entry, i) => {
                        let hours = entry.total_hours
                        if (!hours && entry.clock_in && entry.clock_out) {
                          hours = Math.round((new Date(entry.clock_out) - new Date(entry.clock_in)) / 36e5 * 100) / 100
                        }
                        const clockIn = new Date(entry.clock_in)
                        const clockOut = entry.clock_out ? new Date(entry.clock_out) : null
                        const isEditing = editingEntry?.id === entry.id
                        const wasAdjusted = !!entry.adjusted_at
                        const adjBy = wasAdjusted ? employees.find(e => e.id === entry.adjusted_by) : null

                        return (
                          <div key={i} style={{
                            padding: '10px 12px', backgroundColor: theme.bg, borderRadius: '8px',
                            border: `1px solid ${wasAdjusted ? 'rgba(249,115,22,0.4)' : theme.border}`
                          }}>
                            {isEditing ? (
                              /* ---- EDIT MODE ---- */
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ fontSize: '13px', fontWeight: '600', color: theme.text }}>
                                  Adjust Time Entry — {clockIn.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '8px' }}>
                                  <div>
                                    <label style={{ fontSize: '11px', color: theme.textMuted, display: 'block', marginBottom: '2px' }}>Clock In</label>
                                    <input type="datetime-local" value={editingEntry.clock_in}
                                      onChange={e => setEditingEntry(prev => ({ ...prev, clock_in: e.target.value }))}
                                      style={{ width: '100%', padding: '6px 8px', background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.text, fontSize: '13px' }} />
                                  </div>
                                  <div>
                                    <label style={{ fontSize: '11px', color: theme.textMuted, display: 'block', marginBottom: '2px' }}>Clock Out</label>
                                    <input type="datetime-local" value={editingEntry.clock_out || ''}
                                      onChange={e => setEditingEntry(prev => ({ ...prev, clock_out: e.target.value }))}
                                      style={{ width: '100%', padding: '6px 8px', background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.text, fontSize: '13px' }} />
                                  </div>
                                </div>
                                <div>
                                  <label style={{ fontSize: '11px', color: theme.textMuted, display: 'block', marginBottom: '2px' }}>Assigned Job</label>
                                  <SearchableSelect
                                    value={editingEntry.job_id || ''}
                                    onChange={(val) => setEditingEntry(prev => ({ ...prev, job_id: val || null }))}
                                    placeholder="General / No specific job"
                                    theme={theme}
                                    options={[
                                      { value: '', label: 'General / No specific job' },
                                      ...jobs
                                        .slice()
                                        .sort((a, b) => {
                                          const rank = s => {
                                            const v = (s || '').toLowerCase()
                                            if (v.includes('progress') || v.includes('scheduled') || v.includes('active')) return 0
                                            if (v.includes('complete') || v.includes('cancel')) return 2
                                            return 1
                                          }
                                          return rank(a.status) - rank(b.status)
                                        })
                                        .map(j => {
                                          const label = [j.customer_name, j.job_title || j.job_id].filter(Boolean).join(' — ')
                                          return { value: j.id, label: `${label}${j.status ? ` [${j.status}]` : ''}` }
                                        })
                                    ]}
                                  />
                                </div>
                                <div>
                                  <label style={{ fontSize: '11px', color: theme.textMuted, display: 'block', marginBottom: '2px' }}>Reason for adjustment *</label>
                                  <input type="text" value={editingEntry.reason || ''} placeholder="e.g. Employee forgot to clock out, actual time confirmed"
                                    onChange={e => setEditingEntry(prev => ({ ...prev, reason: e.target.value }))}
                                    style={{ width: '100%', padding: '6px 8px', background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.text, fontSize: '13px', boxSizing: 'border-box' }} />
                                </div>
                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                                  <button onClick={() => setEditingEntry(null)} style={{ padding: '6px 14px', background: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.textSecondary, fontSize: '13px', cursor: 'pointer' }}>Cancel</button>
                                  <button onClick={saveTimeAdjustment} disabled={savingEntry || !editingEntry.reason?.trim()}
                                    style={{ padding: '6px 14px', background: theme.accent, border: 'none', borderRadius: '6px', color: '#fff', fontSize: '13px', fontWeight: '600', cursor: 'pointer', opacity: savingEntry || !editingEntry.reason?.trim() ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <Save size={12} />{savingEntry ? 'Saving...' : 'Save'}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              /* ---- READ MODE ---- */
                              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>
                                    {clockIn.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                                  </div>
                                  <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>
                                    {clockIn.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                    {clockOut ? ` — ${clockOut.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ' — Still clocked in'}
                                  </div>
                                  {/* Job Assignment */}
                                  {(() => {
                                    const job = entry.job_id ? jobs.find(j => j.id === entry.job_id) : null
                                    const jobLabel = job
                                      ? [job.customer_name, job.job_title || job.job_id].filter(Boolean).join(' — ')
                                      : null
                                    return (
                                      <div style={{
                                        fontSize: '11px',
                                        marginTop: '4px',
                                        padding: '2px 8px',
                                        borderRadius: '4px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        maxWidth: '100%',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        backgroundColor: job ? 'rgba(90,99,73,0.10)' : 'rgba(107,114,128,0.08)',
                                        color: job ? theme.accent : theme.textMuted,
                                        fontWeight: job ? 600 : 400,
                                      }}
                                      title={jobLabel || 'No job assigned'}>
                                        <Briefcase size={10} />
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                          {jobLabel || 'General / no job'}
                                        </span>
                                      </div>
                                    )
                                  })()}
                                  {/* Clock In Location */}
                                  {(entry.clock_in_address || (entry.clock_in_lat && entry.clock_in_lng)) && (
                                    <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '3px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                      <MapPin size={10} style={{ color: '#22c55e', flexShrink: 0 }} />
                                      <span>In: {entry.clock_in_address || `${Number(entry.clock_in_lat).toFixed(4)}, ${Number(entry.clock_in_lng).toFixed(4)}`}</span>
                                    </div>
                                  )}
                                  {/* Clock Out Location */}
                                  {(entry.clock_out_address || (entry.clock_out_lat && entry.clock_out_lng)) && (
                                    <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '1px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                      <MapPin size={10} style={{ color: '#ef4444', flexShrink: 0 }} />
                                      <span>Out: {entry.clock_out_address || `${Number(entry.clock_out_lat).toFixed(4)}, ${Number(entry.clock_out_lng).toFixed(4)}`}</span>
                                    </div>
                                  )}
                                  {/* Adjustment info */}
                                  {wasAdjusted && (
                                    <div style={{ fontSize: '11px', color: '#f97316', marginTop: '4px', padding: '3px 8px', backgroundColor: 'rgba(249,115,22,0.08)', borderRadius: '4px', display: 'inline-block' }}>
                                      Adjusted by {adjBy?.name || 'Admin'} — {entry.adjustment_reason}
                                      {entry.original_clock_in && (
                                        <span style={{ color: theme.textMuted }}> (was {new Date(entry.original_clock_in).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                        {entry.original_clock_out ? `–${new Date(entry.original_clock_out).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : ''}
                                        {entry.original_total_hours ? `, ${entry.original_total_hours.toFixed(2)}h` : ''})</span>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <div style={{ textAlign: 'right', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                                  <div>
                                    <div style={{ fontSize: '16px', fontWeight: '600', color: hours ? theme.text : '#f97316' }}>
                                      {hours ? `${hours.toFixed(2)}h` : '--'}
                                    </div>
                                    {entry.lunch_start && entry.lunch_end && (
                                      <div style={{ fontSize: '11px', color: theme.textMuted }}>
                                        Lunch: {Math.round((new Date(entry.lunch_end) - new Date(entry.lunch_start)) / 60000)}m
                                      </div>
                                    )}
                                  </div>
                                  <button onClick={() => setLocationTrailEntry(entry)}
                                    style={{ padding: '4px', background: 'none', border: `1px solid ${theme.border}`, borderRadius: '4px', cursor: 'pointer', color: theme.textMuted, display: 'flex', alignItems: 'center' }}
                                    title="View location trail">
                                    <MapIcon size={14} />
                                  </button>
                                  {isAdmin && (
                                    <button onClick={() => {
                                      const ci = new Date(entry.clock_in)
                                      const co = entry.clock_out ? new Date(entry.clock_out) : null
                                      const pad = (n) => String(n).padStart(2, '0')
                                      const toLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
                                      setEditingEntry({
                                        id: entry.id,
                                        clock_in: toLocal(ci),
                                        clock_out: co ? toLocal(co) : '',
                                        reason: '',
                                        job_id: entry.job_id || '',
                                      })
                                    }} style={{ padding: '4px', background: 'none', border: `1px solid ${theme.border}`, borderRadius: '4px', cursor: 'pointer', color: theme.textMuted, display: 'flex', alignItems: 'center' }}
                                      title="Adjust time entry">
                                      <Edit3 size={14} />
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                  </div>
                  <div style={{
                    marginTop: '12px', padding: '10px 12px', backgroundColor: 'rgba(59,130,246,0.08)',
                    borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                  }}>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: theme.textSecondary }}>Total Clock Hours</span>
                    <span style={{ fontSize: '16px', fontWeight: '700', color: '#3b82f6' }}>
                      {empClockEntries.reduce((sum, e) => {
                        let h = e.total_hours
                        if (!h && e.clock_in && e.clock_out) h = Math.round((new Date(e.clock_out) - new Date(e.clock_in)) / 36e5 * 100) / 100
                        return sum + (h || 0)
                      }, 0).toFixed(2)}h
                    </span>
                  </div>
                </div>
              )}

              {empLogs.length > 0 && (
                <div style={{ ...cardStyle, marginBottom: '20px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileText size={18} style={{ color: '#14b8a6' }} />
                    Job Time Logs ({empLogs.length})
                  </h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {empLogs
                      .sort((a, b) => new Date(b.date || b.created_at) - new Date(a.date || a.created_at))
                      .map((entry, i) => {
                        const job = jobs.find(j => j.id === entry.job_id)
                        const entryDate = new Date(entry.date || entry.created_at)
                        return (
                          <div key={i} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '10px 12px', backgroundColor: theme.bg, borderRadius: '8px',
                            border: `1px solid ${theme.border}`
                          }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>
                                {entryDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                              </div>
                              <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>
                                {job ? `${job.job_id || ''} ${job.customer_name || job.job_title || ''}`.trim() : `Job #${entry.job_id || 'N/A'}`}
                              </div>
                              {entry.category && entry.category !== 'Regular' && (
                                <span style={{
                                  fontSize: '10px', padding: '1px 6px', borderRadius: '4px', marginTop: '2px',
                                  display: 'inline-block',
                                  backgroundColor: entry.category === 'Overtime' ? 'rgba(249,115,22,0.1)' : 'rgba(59,130,246,0.1)',
                                  color: entry.category === 'Overtime' ? '#f97316' : '#3b82f6'
                                }}>{entry.category}</span>
                              )}
                            </div>
                            <div style={{ fontSize: '16px', fontWeight: '600', color: theme.text }}>
                              {entry.hours.toFixed(2)}h
                            </div>
                          </div>
                        )
                      })}
                  </div>
                  <div style={{
                    marginTop: '12px', padding: '10px 12px', backgroundColor: 'rgba(20,184,166,0.08)',
                    borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                  }}>
                    <span style={{ fontSize: '13px', fontWeight: '600', color: theme.textSecondary }}>Total Job Hours</span>
                    <span style={{ fontSize: '16px', fontWeight: '700', color: '#14b8a6' }}>
                      {empLogs.reduce((sum, e) => sum + (e.hours || 0), 0).toFixed(2)}h
                    </span>
                  </div>
                </div>
              )}
            </>
          )
        })()}
        {locationTrailEntry && (
          <LocationTrailModal
            entry={locationTrailEntry}
            employeeName={(() => {
              const emp = employees?.find(e => e.id === locationTrailEntry.employee_id)
              return emp ? emp.name : 'Employee'
            })()}
            onClose={() => setLocationTrailEntry(null)}
            theme={theme}
          />
        )}

        <AddTimeModal
          show={showAddTimeModal}
          onClose={() => setShowAddTimeModal(null)}
          onSave={handleAddTimeEntry}
          saving={savingModal}
          theme={theme}
          isMobile={isMobile}
          jobs={jobs}
        />
        <AddCommissionModal
          show={showAddCommissionModal}
          onClose={() => setShowAddCommissionModal(null)}
          onSave={handleAddCommission}
          saving={savingModal}
          theme={theme}
          isMobile={isMobile}
        />
        <AddAdjustmentModal
          show={showAddAdjustmentModal}
          onClose={() => setShowAddAdjustmentModal(null)}
          onSave={handleAddAdjustment}
          saving={savingModal}
          theme={theme}
          isMobile={isMobile}
        />
        <CheckStubModal
          show={showCheckStub}
          onClose={() => setShowCheckStub(null)}
          employeePayData={employeePayData}
          payrollConfig={payrollConfig}
          periodStart={periodStart}
          periodEnd={periodEnd}
          company={company}
          theme={theme}
          isMobile={isMobile}
          fmt={fmt}
        />
      </div>
    )
  }

  // ── Main Payroll View ────────────────────────────────────
  return (
    <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '100%', overflowX: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: isMobile ? 'flex-start' : 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px', flexDirection: isMobile ? 'column' : 'row' }}>
        <h1 style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: '700', color: theme.text }}>Payroll</h1>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {/* Role filter (admin only) */}
          {isAdmin && (
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
          )}

          {isAdmin && (
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
          )}
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

      {/* Past Period Banner */}
      {periodOffset !== 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px', marginBottom: '16px', borderRadius: '10px',
          background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={16} style={{ color: '#3b82f6' }} />
            <span style={{ fontSize: '13px', fontWeight: '600', color: '#3b82f6' }}>
              Viewing past period: {periodStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {periodEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
          <button onClick={() => setPeriodOffset(0)} style={{
            fontSize: '12px', color: '#3b82f6', background: 'rgba(59,130,246,0.12)',
            border: '1px solid rgba(59,130,246,0.3)', borderRadius: '6px',
            padding: '4px 12px', cursor: 'pointer', fontWeight: '600'
          }}>Back to Current</button>
        </div>
      )}

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fit, minmax(180px, 1fr))', gap: isMobile ? '12px' : '16px', marginBottom: '24px' }}>
        {/* Pay Period with navigation */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <Calendar size={20} style={{ color: theme.accent }} />
            <span style={{ color: theme.textMuted, fontSize: '13px' }}>Pay Period</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button onClick={() => setPeriodOffset(p => p - 1)} style={{
              padding: '4px', background: 'none', border: `1px solid ${theme.border}`, borderRadius: '6px',
              cursor: 'pointer', color: theme.textSecondary, display: 'flex', alignItems: 'center'
            }}><ChevronLeft size={16} /></button>
            <div style={{ fontSize: '14px', fontWeight: '600', color: theme.text, flex: 1, textAlign: 'center' }}>
              {periodStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {periodEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
            <button onClick={() => setPeriodOffset(p => p + 1)} disabled={periodOffset >= 0} style={{
              padding: '4px', background: 'none', border: `1px solid ${theme.border}`, borderRadius: '6px',
              cursor: periodOffset >= 0 ? 'default' : 'pointer', color: periodOffset >= 0 ? theme.border : theme.textSecondary,
              display: 'flex', alignItems: 'center', opacity: periodOffset >= 0 ? 0.4 : 1
            }}><ChevronRight size={16} /></button>
          </div>
          {periodOffset !== 0 && (
            <button onClick={() => setPeriodOffset(0)} style={{
              marginTop: '6px', fontSize: '11px', color: theme.accent, background: 'none', border: 'none',
              cursor: 'pointer', padding: 0, textDecoration: 'underline'
            }}>Back to current</button>
          )}
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

        {/* Total Payroll (admin only) */}
        {isAdmin && (
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <DollarSign size={20} style={{ color: '#22c55e' }} />
              <span style={{ color: theme.textMuted, fontSize: '13px' }}>Total Payroll</span>
            </div>
            <div style={{ fontSize: '22px', fontWeight: '700', color: '#22c55e' }}>{fmt(totalPayroll)}</div>
          </div>
        )}

        {/* Commissions (admin only) */}
        {isAdmin && (
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
        )}

        {/* Efficiency Bonuses (admin only) */}
        {isAdmin && payrollConfig.efficiency_bonus_enabled && (
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
              <Zap size={20} style={{ color: '#8b5cf6' }} />
              <span style={{ color: theme.textMuted, fontSize: '13px' }}>Eff. Bonuses</span>
            </div>
            <div style={{ fontSize: '22px', fontWeight: '700', color: '#8b5cf6' }}>{fmt(totalBonuses)}</div>
          </div>
        )}
      </div>

      {/* ===== Bonuses Accumulating (this period) ===== */}
      {payrollConfig.efficiency_bonus_enabled && (() => {
        const leaderboard = filteredEmployees
          .map(emp => {
            const d = employeePayData[emp.id]
            if (!d) return null
            return {
              emp,
              bonus: d.efficiencyBonus?.bonus || 0,
              jobs: d.efficiencyBonus?.details || [],
            }
          })
          .filter(Boolean)
          .filter(r => r.bonus > 0)
          .sort((a, b) => b.bonus - a.bonus)

        const jobCount = leaderboard.reduce((s, r) => s + r.jobs.length, 0)

        return (
          <div style={{
            backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`,
            borderRadius: '12px', padding: isMobile ? '16px' : '20px', marginBottom: '16px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: '10px',
                background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>
                <Zap size={18} color="#fff" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '15px', fontWeight: '700', color: theme.text }}>
                  Bonuses Accumulating
                </div>
                <div style={{ fontSize: '12px', color: theme.textMuted }}>
                  This pay period — {jobCount} job{jobCount === 1 ? '' : 's'} under allotted hours
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '22px', fontWeight: '700', color: '#8b5cf6' }}>
                  {fmt(totalBonuses)}
                </div>
                <div style={{ fontSize: '11px', color: theme.textMuted }}>total pool</div>
              </div>
            </div>

            {leaderboard.length === 0 ? (
              <div style={{
                marginTop: '12px', padding: '14px', textAlign: 'center',
                fontSize: '13px', color: theme.textMuted,
                backgroundColor: theme.bg, borderRadius: '8px'
              }}>
                No bonuses earned yet this period.
              </div>
            ) : (
              <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {leaderboard.slice(0, 8).map((r, i) => {
                  const top = leaderboard[0].bonus || 1
                  const pct = Math.max(4, (r.bonus / top) * 100)
                  return (
                    <div
                      key={r.emp.id}
                      onClick={() => setSelectedEmployee(r.emp)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        padding: '8px 10px', borderRadius: '8px',
                        backgroundColor: theme.bg, cursor: 'pointer'
                      }}
                    >
                      <div style={{
                        width: '22px', fontSize: '12px', fontWeight: '700',
                        color: i < 3 ? '#8b5cf6' : theme.textMuted, textAlign: 'center'
                      }}>
                        #{i + 1}
                      </div>
                      <div style={{
                        width: '28px', height: '28px', borderRadius: '8px',
                        backgroundColor: getAvatarColor(r.emp.name),
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#fff', fontWeight: '600', fontSize: '12px', flexShrink: 0,
                        overflow: 'hidden'
                      }}>
                        {r.emp.headshot_url
                          ? <img src={r.emp.headshot_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : (r.emp.name || '?').charAt(0).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: '13px', fontWeight: '600', color: theme.text,
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                        }}>
                          {r.emp.name}
                        </div>
                        <div style={{
                          marginTop: '3px', height: '4px', backgroundColor: 'rgba(139,92,246,0.12)',
                          borderRadius: '2px', overflow: 'hidden'
                        }}>
                          <div style={{
                            width: `${pct}%`, height: '100%',
                            background: 'linear-gradient(90deg, #8b5cf6, #a855f7)'
                          }} />
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontSize: '14px', fontWeight: '700', color: '#8b5cf6' }}>
                          {fmt(r.bonus)}
                        </div>
                        <div style={{ fontSize: '10px', color: theme.textMuted }}>
                          {r.jobs.length} job{r.jobs.length === 1 ? '' : 's'}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })()}

      {/* ===== BONUS PROGRAM SETTINGS (inline, admin only) ===== */}
      {isAdmin && (
        <div style={{
          backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`,
          borderRadius: '12px', padding: isMobile ? '16px' : '20px', marginBottom: '16px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: '10px',
                background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
              }}>
                <Award size={18} color="#fff" />
              </div>
              <div>
                <div style={{ fontSize: '15px', fontWeight: '700', color: theme.text }}>Bonus Program</div>
                <div style={{ fontSize: '12px', color: theme.textMuted }}>Efficiency bonus settings & crew rank structure</div>
              </div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={payrollConfig.efficiency_bonus_enabled}
                onChange={async (e) => {
                  const updated = { ...payrollConfig, efficiency_bonus_enabled: e.target.checked }
                  setPayrollConfig(updated)
                  await supabase.from('settings').upsert({ company_id: companyId, key: 'payroll_config', value: JSON.stringify(updated), updated_at: new Date().toISOString() }, { onConflict: 'company_id,key' })
                }}
                style={{ width: '18px', height: '18px', accentColor: '#8b5cf6' }}
              />
              <span style={{ fontSize: '13px', fontWeight: '600', color: payrollConfig.efficiency_bonus_enabled ? '#8b5cf6' : theme.textMuted }}>
                {payrollConfig.efficiency_bonus_enabled ? 'Enabled' : 'Disabled'}
              </span>
            </label>
          </div>

          {payrollConfig.efficiency_bonus_enabled && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Rate + cuts row */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: '12px' }}>
                <div style={{ padding: '14px', backgroundColor: theme.bg, borderRadius: '10px', border: `1px solid ${theme.border}` }}>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Rate per Hour Saved</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '20px', fontWeight: '800', color: '#8b5cf6' }}>$</span>
                    <input
                      type="number"
                      min={0}
                      step={5}
                      value={payrollConfig.efficiency_bonus_rate}
                      onBlur={async () => {
                        await supabase.from('settings').upsert({ company_id: companyId, key: 'payroll_config', value: JSON.stringify(payrollConfig), updated_at: new Date().toISOString() }, { onConflict: 'company_id,key' })
                      }}
                      onChange={(e) => setPayrollConfig({ ...payrollConfig, efficiency_bonus_rate: parseFloat(e.target.value) || 30 })}
                      style={{ width: '80px', padding: '6px 8px', border: `1px solid ${theme.border}`, borderRadius: '6px', fontSize: '20px', fontWeight: '700', color: '#8b5cf6', backgroundColor: theme.bgCard, textAlign: 'center' }}
                    />
                    <span style={{ fontSize: '13px', color: theme.textMuted }}>/hr</span>
                  </div>
                </div>
                <div style={{ padding: '14px', backgroundColor: theme.bg, borderRadius: '10px', border: `1px solid ${theme.border}` }}>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Company Retention</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      type="number"
                      min={0}
                      max={50}
                      value={payrollConfig.company_bonus_cut_percent}
                      onBlur={async () => {
                        await supabase.from('settings').upsert({ company_id: companyId, key: 'payroll_config', value: JSON.stringify(payrollConfig), updated_at: new Date().toISOString() }, { onConflict: 'company_id,key' })
                      }}
                      onChange={(e) => setPayrollConfig({ ...payrollConfig, company_bonus_cut_percent: parseFloat(e.target.value) || 0 })}
                      style={{ width: '60px', padding: '6px 8px', border: `1px solid ${theme.border}`, borderRadius: '6px', fontSize: '18px', fontWeight: '700', color: theme.text, backgroundColor: theme.bgCard, textAlign: 'center' }}
                    />
                    <span style={{ fontSize: '13px', color: theme.textMuted }}>% kept by company</span>
                  </div>
                </div>
                <div style={{ padding: '14px', backgroundColor: theme.bg, borderRadius: '10px', border: `1px solid ${theme.border}` }}>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Min Hours Saved</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <input
                      type="number"
                      min={0}
                      step={0.25}
                      value={payrollConfig.bonus_min_hours_saved}
                      onBlur={async () => {
                        await supabase.from('settings').upsert({ company_id: companyId, key: 'payroll_config', value: JSON.stringify(payrollConfig), updated_at: new Date().toISOString() }, { onConflict: 'company_id,key' })
                      }}
                      onChange={(e) => setPayrollConfig({ ...payrollConfig, bonus_min_hours_saved: parseFloat(e.target.value) || 0 })}
                      style={{ width: '60px', padding: '6px 8px', border: `1px solid ${theme.border}`, borderRadius: '6px', fontSize: '18px', fontWeight: '700', color: theme.text, backgroundColor: theme.bgCard, textAlign: 'center' }}
                    />
                    <span style={{ fontSize: '13px', color: theme.textMuted }}>hrs threshold</span>
                  </div>
                </div>
              </div>

              {/* Crew Rank Structure */}
              <div>
                <div style={{ fontSize: '13px', fontWeight: '700', color: theme.text, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Zap size={14} style={{ color: '#8b5cf6' }} />
                  Crew Rank Structure
                  <span style={{ fontSize: '11px', fontWeight: '500', color: theme.textMuted }}>— higher rank = bigger share of the bonus pool</span>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {(skillLevelSettings.length > 0 ? skillLevelSettings : SCOUT_RANKS).map((sl, i) => {
                    const name = typeof sl === 'string' ? sl : sl.name
                    const weight = typeof sl === 'string' ? 1 : (sl.weight || 1)
                    return (
                      <RankBadge key={name || i} rank={name} weight={weight} size="md" theme={theme} />
                    )
                  })}
                </div>
                <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '8px' }}>
                  Manage ranks in Employees → Settings → Skill Levels. Assign ranks to individual employees on their profile.
                </div>
              </div>

              {/* Worked example — uses big numbers to make it enticing */}
              {(() => {
                const rate = payrollConfig.efficiency_bonus_rate ?? 30
                const cut = payrollConfig.company_bonus_cut_percent ?? 20
                const savedHrs = 80 // Big lighting job
                const pool = savedHrs * rate
                const companyKeeps = pool * cut / 100
                const crewPool = pool - companyKeeps
                // Build crew from actual configured ranks (or defaults)
                const ranks = (skillLevelSettings.length > 0 ? skillLevelSettings : SCOUT_RANKS)
                  .map(sl => ({ name: typeof sl === 'string' ? sl : sl.name, weight: typeof sl === 'string' ? 1 : (sl.weight || 1) }))
                // Pick a realistic 4-person crew from the highest ranks available
                const exampleCrew = ranks.length >= 4
                  ? [ranks[ranks.length - 1], ranks[Math.max(ranks.length - 2, 0)], ranks[Math.max(ranks.length - 3, 0)], ranks[0]]
                  : ranks.length >= 2
                    ? [ranks[ranks.length - 1], ranks[0], ranks[0], ranks[0]]
                    : [{ name: 'Crew', weight: 1 }, { name: 'Crew', weight: 1 }, { name: 'Crew', weight: 1 }, { name: 'Crew', weight: 1 }]
                const totalWeight = exampleCrew.reduce((s, c) => s + c.weight, 0)
                return (
                  <div style={{ padding: '16px', backgroundColor: 'rgba(168,85,247,0.06)', borderRadius: '10px', border: '1px solid rgba(168,85,247,0.2)' }}>
                    <div style={{ fontSize: '11px', fontWeight: '700', color: '#8b5cf6', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px' }}>
                      Example — Large Lighting Retrofit
                    </div>
                    <div style={{ fontSize: '13px', color: theme.text, lineHeight: 1.8 }}>
                      Job allotted <strong>800 hrs</strong>, crew knocks it out in <strong>720 hrs</strong> → <strong>{savedHrs} hrs saved</strong>
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: '#8b5cf6', margin: '8px 0 4px' }}>
                      Bonus pool: {savedHrs}h × ${rate}/hr = ${pool.toLocaleString()}
                    </div>
                    <div style={{ display: 'flex', gap: '16px', marginBottom: '12px', fontSize: '13px' }}>
                      <span style={{ color: '#22c55e', fontWeight: '600' }}>Company keeps ({cut}%): ${companyKeeps.toLocaleString()}</span>
                      <span style={{ color: '#8b5cf6', fontWeight: '600' }}>Crew splits ({100 - cut}%): ${crewPool.toLocaleString()}</span>
                    </div>

                    {/* Per-crew-member breakdown */}
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: '8px' }}>
                      {exampleCrew.map((member, i) => {
                        const share = crewPool * (member.weight / totalWeight)
                        return (
                          <div key={i} style={{
                            padding: '10px 12px',
                            backgroundColor: theme.bgCard,
                            borderRadius: '8px',
                            border: `1px solid ${theme.border}`,
                            textAlign: 'center',
                          }}>
                            <RankBadge rank={member.name} weight={member.weight} size="sm" theme={theme} />
                            <div style={{ fontSize: '20px', fontWeight: '800', color: '#8b5cf6', marginTop: '6px' }}>
                              ${Math.round(share).toLocaleString()}
                            </div>
                            <div style={{ fontSize: '10px', color: theme.textMuted }}>
                              {member.weight}/{totalWeight} of crew pool
                            </div>
                          </div>
                        )
                      })}
                    </div>

                    <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '10px', lineHeight: 1.5 }}>
                      The faster and better the crew works, the more everyone earns. Higher rank = bigger share.
                      Victor verification required to qualify.
                    </div>
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      )}

      {/* Employee List */}
      <div style={{
        backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`,
        borderRadius: '12px', overflow: 'hidden', marginBottom: '24px'
      }}>
        <div style={{
          padding: isMobile ? '12px 16px' : '16px 20px', borderBottom: `1px solid ${theme.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexDirection: isMobile ? 'column' : 'row', gap: isMobile ? '4px' : '0'
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

        <div style={{ overflowX: 'auto' }}>
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
          minWidth: isMobile ? '700px' : 'auto',
        }}>
          <span>Employee</span>
          <span style={{ textAlign: 'center' }}>Hours</span>
          <span style={{ textAlign: 'center' }}>Commissions</span>
          {payrollConfig.efficiency_bonus_enabled && <span style={{ textAlign: 'center' }}>Bonus</span>}
          {!payrollConfig.efficiency_bonus_enabled && <span style={{ textAlign: 'center' }}>Adj</span>}
          <span style={{ textAlign: 'center' }}>Gross</span>
          <span style={{ textAlign: 'right' }}>Net Pay</span>
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
                  minWidth: isMobile ? '700px' : 'auto',
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
                      {emp.skill_level && <RankBadge rank={emp.skill_level} weight={(() => { const sl = skillLevelSettings.find(s => (s.name || s) === emp.skill_level); return sl?.weight })() } theme={theme} />}
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

                {/* Bonus or Adjustments */}
                {payrollConfig.efficiency_bonus_enabled ? (
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontWeight: '600', color: data.efficiencyBonus.bonus > 0 ? '#8b5cf6' : theme.textMuted, fontSize: '14px' }}>
                      {data.efficiencyBonus.bonus > 0 ? fmt(data.efficiencyBonus.bonus) : '-'}
                    </div>
                  </div>
                ) : (
                  <div style={{ textAlign: 'center' }}>
                    {data.totalAdditions > 0 && <div style={{ fontSize: '11px', color: '#22c55e', fontWeight: '500' }}>+{fmt(data.totalAdditions)}</div>}
                    {data.totalDeductions > 0 && <div style={{ fontSize: '11px', color: '#ef4444', fontWeight: '500' }}>-{fmt(data.totalDeductions)}</div>}
                    {data.totalAdditions === 0 && data.totalDeductions === 0 && <div style={{ fontWeight: '600', color: theme.textMuted, fontSize: '14px' }}>-</div>}
                  </div>
                )}

                {/* Gross */}
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: '600', color: theme.textSecondary, fontSize: '14px' }}>
                    {fmt(data.grossPay)}
                  </div>
                </div>

                {/* Net Pay */}
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '16px', fontWeight: '700', color: '#22c55e' }}>
                    {fmt(data.netPay)}
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
        {isAdmin && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr',
            padding: '16px 20px',
            backgroundColor: theme.bg,
            alignItems: 'center',
            minWidth: isMobile ? '700px' : 'auto',
          }}>
            <span style={{ fontWeight: '600', color: theme.text }}>Total</span>
            <span />
            <div style={{ textAlign: 'center', fontWeight: '600', color: '#f59e0b' }}>{fmt(totalCommissions)}</div>
            <span />
            <div style={{ textAlign: 'center', fontWeight: '600', color: theme.textSecondary }}>{fmt(totalPayroll)}</div>
            <div style={{ textAlign: 'right', fontSize: '20px', fontWeight: '700', color: '#22c55e' }}>
              {fmt(Object.values(employeePayData).reduce((sum, d) => sum + d.netPay, 0))}
            </div>
          </div>
        )}
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
              padding: isMobile ? '12px 16px' : '16px 20px', borderBottom: `1px solid ${theme.border}`,
              display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', gap: isMobile ? '12px' : '16px',
              flexDirection: isMobile ? 'column' : 'row'
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
            maxWidth: isMobile ? 'calc(100vw - 32px)' : '520px', maxHeight: '90vh', overflow: 'auto'
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
                  <option value="weekly">Weekly (52 periods/yr, paid every Friday)</option>
                  <option value="bi-weekly">Bi-Weekly (26 periods/yr, every 14 days)</option>
                  <option value="semi-monthly">Semi-Monthly (24 periods/yr, twice a month)</option>
                  <option value="monthly">Monthly (12 periods/yr)</option>
                </select>
                <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '6px', lineHeight: '1.4' }}>
                  {payrollConfig.pay_frequency === 'weekly' && 'Paid every Friday. Annual salary ÷ 52.'}
                  {payrollConfig.pay_frequency === 'bi-weekly' && 'Paid every 14 days (26 paychecks/year, so 2 months each year get 3 paydays). Annual salary ÷ 26.'}
                  {payrollConfig.pay_frequency === 'semi-monthly' && 'Paid twice a month on the same two calendar days (exactly 24 paychecks/year). Annual salary ÷ 24.'}
                  {payrollConfig.pay_frequency === 'monthly' && 'Paid once a month (last day of month). Annual salary ÷ 12.'}
                </div>
              </div>

              {payrollConfig.pay_frequency === 'bi-weekly' && (
                <div style={{ marginBottom: '16px' }}>
                  <label style={labelStyle}>Pay Anchor Date</label>
                  <input type="date" value={payrollConfig.pay_anchor_date || ''}
                    onChange={(e) => setPayrollConfig({ ...payrollConfig, pay_anchor_date: e.target.value })}
                    style={inputStyle} />
                  <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '6px', lineHeight: '1.4' }}>
                    Pick any past payday. All future pay periods are computed as 14-day windows anchored to this date.
                  </div>
                </div>
              )}

              {payrollConfig.pay_frequency === 'semi-monthly' && (
                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div>
                    <label style={labelStyle}>First Pay Day</label>
                    <input type="number" min="1" max="28" value={payrollConfig.pay_day_1}
                      onChange={(e) => setPayrollConfig({ ...payrollConfig, pay_day_1: e.target.value })}
                      style={inputStyle} />
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>Day of month (e.g. 5)</div>
                  </div>
                  <div>
                    <label style={labelStyle}>Second Pay Day</label>
                    <input type="number" min="1" max="28" value={payrollConfig.pay_day_2}
                      onChange={(e) => setPayrollConfig({ ...payrollConfig, pay_day_2: e.target.value })}
                      style={inputStyle} />
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>Day of month (e.g. 20)</div>
                  </div>
                </div>
              )}

              {/* Overtime */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
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
              <h4 style={{ fontSize: '16px', fontWeight: '700', color: theme.text, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Zap size={18} style={{ color: '#8b5cf6' }} />
                Bonus Hours
              </h4>

              {/* How It Works explainer */}
              <div style={{
                padding: '16px 18px', marginBottom: '16px', borderRadius: '10px',
                backgroundColor: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.15)'
              }}>
                <div style={{ fontSize: '14px', fontWeight: '700', color: theme.text, marginBottom: '10px' }}>How Bonus Hours Work</div>
                <div style={{ fontSize: '13px', color: theme.textSecondary, lineHeight: '1.7' }}>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
                    <span style={{ fontWeight: '700', color: '#8b5cf6', minWidth: '20px', fontSize: '14px' }}>1.</span>
                    <span>Every job has <strong>allotted hours</strong> based on its line items. This is the time budget.</span>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
                    <span style={{ fontWeight: '700', color: '#8b5cf6', minWidth: '20px', fontSize: '14px' }}>2.</span>
                    <span>When a crew finishes <strong>under</strong> the allotted hours, the saved time is multiplied by a <strong>dollar rate</strong> to create a <strong>bonus pool</strong>.</span>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
                    <span style={{ fontWeight: '700', color: '#8b5cf6', minWidth: '20px', fontSize: '14px' }}>3.</span>
                    <span>The company keeps a <strong>configurable %</strong> of the pool (margin boost for efficiency), and the rest goes to the crew.</span>
                  </div>
                  <div style={{ display: 'flex', gap: '10px', marginBottom: '8px' }}>
                    <span style={{ fontWeight: '700', color: '#8b5cf6', minWidth: '20px', fontSize: '14px' }}>4.</span>
                    <span>The crew's share is split by <strong>skill-level weight</strong> — higher-skilled roles earn a bigger piece. Set weights under Employees &gt; Settings &gt; Skill Levels.</span>
                  </div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <span style={{ fontWeight: '700', color: '#8b5cf6', minWidth: '20px', fontSize: '14px' }}>5.</span>
                    <span>Installers see their <strong>live potential bonus</strong> on every job page — creating real-time motivation to work efficiently.</span>
                  </div>
                </div>
              </div>

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
                  <div style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>Enable bonus hours</div>
                  <div style={{ fontSize: '12px', color: theme.textMuted }}>
                    Crews that finish jobs under allotted time earn a bonus. Each installer sees their potential payout on every job.
                  </div>
                </div>
              </label>

              {payrollConfig.efficiency_bonus_enabled && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div style={{ padding: '16px', backgroundColor: theme.bg, borderRadius: '10px', border: `1px solid ${theme.border}` }}>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '8px' }}>
                      Bonus Rate Per Hour Saved
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '16px', fontWeight: '600', color: theme.textSecondary }}>$</span>
                      <input
                        type="number" min="0" step="5"
                        value={payrollConfig.efficiency_bonus_rate}
                        onChange={(e) => setPayrollConfig({ ...payrollConfig, efficiency_bonus_rate: parseFloat(e.target.value) || 25 })}
                        style={inputStyle}
                      />
                      <span style={{ fontSize: '14px', color: theme.textMuted }}>/hour</span>
                    </div>
                    <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '6px' }}>
                      Each hour the crew saves is worth this amount. This is the foundation of the bonus pool.
                    </div>
                  </div>

                  <div style={{ padding: '16px', backgroundColor: theme.bg, borderRadius: '10px', border: `1px solid ${theme.border}` }}>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '8px' }}>
                      Company Retention
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="number" min="0" max="50" step="5"
                        value={payrollConfig.company_bonus_cut_percent}
                        onChange={(e) => setPayrollConfig({ ...payrollConfig, company_bonus_cut_percent: parseFloat(e.target.value) || 0 })}
                        style={inputStyle}
                      />
                      <span style={{ fontSize: '14px', color: theme.textMuted }}>%</span>
                    </div>
                    <div style={{ fontSize: '12px', color: theme.textSecondary, marginTop: '6px' }}>
                      Faster work benefits <strong>both</strong> the company and the crew. The company keeps <strong>{payrollConfig.company_bonus_cut_percent}%</strong> of the pool as a margin boost, and the crew splits the remaining <strong>{100 - payrollConfig.company_bonus_cut_percent}%</strong>. Set to 0% if you want 100% to go to the crew.
                    </div>
                  </div>

                  <div style={{ padding: '16px', backgroundColor: theme.bg, borderRadius: '10px', border: `1px solid ${theme.border}` }}>
                    <label style={{ display: 'block', fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '8px' }}>
                      Minimum Hours Saved to Qualify
                    </label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="number" min="0" step="0.25"
                        value={payrollConfig.bonus_min_hours_saved}
                        onChange={(e) => setPayrollConfig({ ...payrollConfig, bonus_min_hours_saved: parseFloat(e.target.value) || 0 })}
                        style={inputStyle}
                      />
                      <span style={{ fontSize: '14px', color: theme.textMuted }}>hours</span>
                    </div>
                    <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '6px' }}>
                      Prevents tiny payouts on short jobs. A crew must save at least this many hours for a bonus to apply.
                    </div>
                  </div>

                  <label style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '16px', backgroundColor: theme.bg, borderRadius: '10px', cursor: 'pointer',
                    border: `1px solid ${payrollConfig.bonus_quality_gate ? theme.accent : theme.border}`
                  }}>
                    <input
                      type="checkbox"
                      checked={payrollConfig.bonus_quality_gate}
                      onChange={(e) => setPayrollConfig({ ...payrollConfig, bonus_quality_gate: e.target.checked })}
                      style={{ width: '18px', height: '18px' }}
                    />
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>Quality Gate</div>
                      <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>
                        If a job has any callbacks or rework, the bonus is forfeited. Speed without quality doesn't count.
                      </div>
                    </div>
                  </label>

                  {/* Live example */}
                  <div style={{ padding: '16px 18px', backgroundColor: theme.bgCard, borderRadius: '10px', border: `1px solid ${theme.border}`, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: theme.text, marginBottom: '12px' }}>Live Example With Your Settings</div>
                    <div style={{ fontSize: '12px', color: theme.textSecondary, lineHeight: '1.8' }}>
                      <div>A job is bid at <strong>40 hours</strong>. The crew finishes in <strong>32 hours</strong> — saving <strong>8 hours</strong>.</div>
                      <div style={{ marginTop: '4px' }}>
                        Bonus pool: 8h x <strong>${payrollConfig.efficiency_bonus_rate}</strong>/hr = <strong>${(8 * payrollConfig.efficiency_bonus_rate).toFixed(0)}</strong>
                      </div>
                      <div style={{ display: 'flex', gap: '16px', marginTop: '6px', flexWrap: 'wrap' }}>
                        <div style={{ padding: '6px 10px', borderRadius: '6px', backgroundColor: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)' }}>
                          <div style={{ fontSize: '11px', color: theme.textMuted }}>Company keeps ({payrollConfig.company_bonus_cut_percent}%)</div>
                          <div style={{ fontSize: '15px', fontWeight: '700', color: '#22c55e' }}>${(8 * payrollConfig.efficiency_bonus_rate * payrollConfig.company_bonus_cut_percent / 100).toFixed(0)}</div>
                        </div>
                        <div style={{ padding: '6px 10px', borderRadius: '6px', backgroundColor: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)' }}>
                          <div style={{ fontSize: '11px', color: theme.textMuted }}>Crew splits ({100 - payrollConfig.company_bonus_cut_percent}%)</div>
                          <div style={{ fontSize: '15px', fontWeight: '700', color: '#8b5cf6' }}>${(8 * payrollConfig.efficiency_bonus_rate * (100 - payrollConfig.company_bonus_cut_percent) / 100).toFixed(0)}</div>
                        </div>
                      </div>
                      <div style={{ marginTop: '8px', color: theme.textMuted, fontStyle: 'italic' }}>
                        The crew's ${(8 * payrollConfig.efficiency_bonus_rate * (100 - payrollConfig.company_bonus_cut_percent) / 100).toFixed(0)} is divided by skill-level weight — a Crew Lead (wt 3) earns 3x more than an Installer II (wt 1).
                      </div>
                    </div>
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
            maxWidth: isMobile ? 'calc(100vw - 32px)' : '440px', overflow: 'hidden'
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

            <div style={{ padding: '20px', maxHeight: '70vh', overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
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
      {locationTrailEntry && (
        <LocationTrailModal
          entry={locationTrailEntry}
          employeeName={(() => {
            const emp = employees?.find(e => e.id === locationTrailEntry.employee_id)
            return emp ? emp.name : 'Employee'
          })()}
          onClose={() => setLocationTrailEntry(null)}
          theme={theme}
        />
      )}

    </div>
  )
}

// ── Add Time Entry Modal ─────────────────────────────────
function AddTimeModal({ show, onClose, onSave, saving, theme, isMobile, jobs = [] }) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [startTime, setStartTime] = useState('08:00')
  const [endTime, setEndTime] = useState('17:00')
  const [reason, setReason] = useState('')
  const [jobId, setJobId] = useState('')

  useEffect(() => {
    if (show) {
      setDate(new Date().toISOString().split('T')[0])
      setStartTime('08:00')
      setEndTime('17:00')
      setReason('')
      setJobId('')
    }
  }, [show])

  if (!show) return null

  // Show active/scheduled/in-progress jobs first; completed/cancelled
  // still selectable but surfaced at the bottom so admins can back-fill
  // historical time against any job.
  const jobOptions = (jobs || [])
    .slice()
    .sort((a, b) => {
      const rank = s => {
        const v = (s || '').toLowerCase()
        if (v.includes('progress') || v.includes('scheduled') || v.includes('active')) return 0
        if (v.includes('complete') || v.includes('cancel')) return 2
        return 1
      }
      return rank(a.status) - rank(b.status)
    })

  const inputStyle = {
    width: '100%', padding: '10px 12px', backgroundColor: theme.bg,
    border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px', boxSizing: 'border-box'
  }
  const labelStyle = { display: 'block', fontSize: '13px', color: theme.textMuted, marginBottom: '6px' }

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
      <div style={{ backgroundColor: theme.bgCard, borderRadius: '16px', width: '100%', maxWidth: '420px', overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '20px', borderBottom: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>Add Time Entry — {show.name}</div>
          <button onClick={onClose} style={{ padding: '8px', backgroundColor: theme.border, border: 'none', borderRadius: '8px', cursor: 'pointer', color: theme.textMuted }}><X size={18} /></button>
        </div>
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', overflowY: 'auto' }}>
          <div>
            <label style={labelStyle}>Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Start Time</label>
              <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>End Time</label>
              <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} style={inputStyle} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Assign to Job <span style={{ color: theme.textMuted, fontWeight: '400' }}>(optional)</span></label>
            <select value={jobId} onChange={e => setJobId(e.target.value)} style={inputStyle}>
              <option value="">General / No specific job</option>
              {jobOptions.map(j => {
                const label = [j.customer_name, j.job_title || j.job_id].filter(Boolean).join(' — ')
                const statusSuffix = j.status ? ` [${j.status}]` : ''
                return (
                  <option key={j.id} value={j.id}>
                    {label}{statusSuffix}
                  </option>
                )
              })}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Reason</label>
            <input type="text" value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Missed clock-in, confirmed with employee" style={inputStyle} />
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={onClose} style={{ flex: 1, padding: '12px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '10px', color: theme.text, fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
            <button onClick={() => onSave({ employeeId: show.id, date, startTime, endTime, reason, jobId: jobId ? parseInt(jobId) : null })} disabled={saving}
              style={{ flex: 1, padding: '12px', background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', border: 'none', borderRadius: '10px', color: '#fff', fontSize: '14px', fontWeight: '600', cursor: saving ? 'wait' : 'pointer' }}>
              {saving ? 'Saving...' : 'Add Entry'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Add Commission Modal ─────────────────────────────────
function AddCommissionModal({ show, onClose, onSave, saving, theme, isMobile }) {
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [commissionType, setCommissionType] = useState('manual')

  useEffect(() => {
    if (show) { setAmount(''); setDescription(''); setCommissionType('manual') }
  }, [show])

  if (!show) return null
  const inputStyle = {
    width: '100%', padding: '10px 12px', backgroundColor: theme.bg,
    border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px', boxSizing: 'border-box'
  }
  const labelStyle = { display: 'block', fontSize: '13px', color: theme.textMuted, marginBottom: '6px' }

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
      <div style={{ backgroundColor: theme.bgCard, borderRadius: '16px', width: '100%', maxWidth: '420px', overflow: 'hidden' }}>
        <div style={{ padding: '20px', borderBottom: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>Add Commission — {show.name}</div>
          <button onClick={onClose} style={{ padding: '8px', backgroundColor: theme.border, border: 'none', borderRadius: '8px', cursor: 'pointer', color: theme.textMuted }}><X size={18} /></button>
        </div>
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={labelStyle}>Amount</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: theme.textMuted }}>$</span>
              <input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} style={{ ...inputStyle, paddingLeft: '28px' }} placeholder="0.00" />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Type</label>
            <select value={commissionType} onChange={e => setCommissionType(e.target.value)} style={inputStyle}>
              <option value="manual">Manual Commission</option>
              <option value="appointment_set">Appointment Set</option>
              <option value="lead_source">Lead Source</option>
              <option value="bonus">Bonus</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Description</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Bonus for closing XYZ deal" style={inputStyle} />
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={onClose} style={{ flex: 1, padding: '12px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '10px', color: theme.text, fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
            <button onClick={() => onSave({ employeeId: show.id, amount, commissionType, description })} disabled={saving || !amount}
              style={{ flex: 1, padding: '12px', background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', border: 'none', borderRadius: '10px', color: '#fff', fontSize: '14px', fontWeight: '600', cursor: saving || !amount ? 'default' : 'pointer', opacity: saving || !amount ? 0.5 : 1 }}>
              {saving ? 'Saving...' : 'Add Commission'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Add Adjustment (Deduction/Addition) Modal ────────────
function AddAdjustmentModal({ show, onClose, onSave, saving, theme, isMobile }) {
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [recurring, setRecurring] = useState(false)

  useEffect(() => {
    if (show) { setAmount(''); setReason(''); setRecurring(false) }
  }, [show])

  if (!show) return null
  const isDeduction = show.type === 'deduction'
  const inputStyle = {
    width: '100%', padding: '10px 12px', backgroundColor: theme.bg,
    border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px', boxSizing: 'border-box'
  }
  const labelStyle = { display: 'block', fontSize: '13px', color: theme.textMuted, marginBottom: '6px' }

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
      <div style={{ backgroundColor: theme.bgCard, borderRadius: '16px', width: '100%', maxWidth: '420px', overflow: 'hidden' }}>
        <div style={{ padding: '20px', borderBottom: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>
            {isDeduction ? 'Add Deduction' : 'Add Addition'} — {show.employee?.name}
          </div>
          <button onClick={onClose} style={{ padding: '8px', backgroundColor: theme.border, border: 'none', borderRadius: '8px', cursor: 'pointer', color: theme.textMuted }}><X size={18} /></button>
        </div>
        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={labelStyle}>Amount</label>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: theme.textMuted }}>$</span>
              <input type="number" step="0.01" min="0" value={amount} onChange={e => setAmount(e.target.value)} style={{ ...inputStyle, paddingLeft: '28px' }} placeholder="0.00" />
            </div>
          </div>
          <div>
            <label style={labelStyle}>Reason *</label>
            <input type="text" value={reason} onChange={e => setReason(e.target.value)}
              placeholder={isDeduction ? 'e.g. Fleet vehicle personal use' : 'e.g. Cell phone allowance'}
              style={inputStyle} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '12px', backgroundColor: theme.bg, borderRadius: '8px', cursor: 'pointer' }}>
            <input type="checkbox" checked={recurring} onChange={e => setRecurring(e.target.checked)} />
            <div>
              <div style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>Recurring</div>
              <div style={{ fontSize: '12px', color: theme.textMuted }}>Apply this {isDeduction ? 'deduction' : 'addition'} to every pay period</div>
            </div>
          </label>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button onClick={onClose} style={{ flex: 1, padding: '12px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '10px', color: theme.text, fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>Cancel</button>
            <button onClick={() => onSave({ employeeId: show.employee.id, type: show.type, amount, reason, recurring })} disabled={saving || !amount || !reason.trim()}
              style={{
                flex: 1, padding: '12px', border: 'none', borderRadius: '10px', color: '#fff', fontSize: '14px', fontWeight: '600',
                cursor: saving || !amount || !reason.trim() ? 'default' : 'pointer',
                opacity: saving || !amount || !reason.trim() ? 0.5 : 1,
                background: isDeduction ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)' : 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'
              }}>
              {saving ? 'Saving...' : isDeduction ? 'Add Deduction' : 'Add Addition'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Check Stub Preview Modal ─────────────────────────────
function CheckStubModal({ show, onClose, employeePayData, payrollConfig, periodStart, periodEnd, company, theme, isMobile, fmt }) {
  if (!show) return null
  const emp = show
  const data = employeePayData[emp.id]
  if (!data) return null

  const handlePrint = () => {
    const stubEl = document.getElementById('check-stub-content')
    if (!stubEl) return
    const printWindow = window.open('', '_blank', 'width=800,height=600')
    printWindow.document.write(`
      <html><head><title>Pay Stub - ${emp.name}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 40px; color: #333; }
        table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { font-size: 12px; text-transform: uppercase; color: #666; }
        .header { border-bottom: 2px solid #333; padding-bottom: 16px; margin-bottom: 16px; }
        .total-row { font-weight: 700; border-top: 2px solid #333; }
        .section { margin-top: 24px; }
        .section-title { font-weight: 700; font-size: 14px; margin-bottom: 8px; }
        @media print { body { padding: 20px; } }
      </style></head><body>
      ${stubEl.innerHTML}
      </body></html>
    `)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => { printWindow.print() }, 250)
  }

  const periodLabel = `${periodStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} – ${periodEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
      <div style={{ backgroundColor: theme.bgCard, borderRadius: '16px', width: '100%', maxWidth: '640px', maxHeight: '90vh', overflow: 'auto' }}>
        <div style={{ padding: '20px', borderBottom: `1px solid ${theme.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: 0, backgroundColor: theme.bgCard, zIndex: 1 }}>
          <div style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>Check Stub Preview</div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={handlePrint} style={{
              padding: '8px 14px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px',
              color: theme.textSecondary, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px'
            }}><Printer size={14} /> Print</button>
            <button onClick={onClose} style={{ padding: '8px', backgroundColor: theme.border, border: 'none', borderRadius: '8px', cursor: 'pointer', color: theme.textMuted }}><X size={18} /></button>
          </div>
        </div>

        <div id="check-stub-content" style={{ padding: '24px' }}>
          {/* Stub Header */}
          <div style={{ borderBottom: `2px solid ${theme.text}`, paddingBottom: '16px', marginBottom: '16px' }}>
            <div style={{ fontSize: '20px', fontWeight: '700', color: theme.text }}>{company?.company_name || 'Company'}</div>
            <div style={{ fontSize: '13px', color: theme.textMuted, marginTop: '4px' }}>Pay Stub</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '20px' }}>
            <div>
              <div style={{ fontSize: '12px', color: theme.textMuted }}>Employee</div>
              <div style={{ fontSize: '15px', fontWeight: '600', color: theme.text }}>{emp.name}</div>
              <div style={{ fontSize: '13px', color: theme.textMuted }}>{emp.role}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '12px', color: theme.textMuted }}>Pay Period</div>
              <div style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>{periodLabel}</div>
            </div>
          </div>

          {/* Earnings Table */}
          <div style={{ fontSize: '14px', fontWeight: '700', color: theme.text, marginBottom: '8px' }}>Earnings</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                <th style={{ padding: '8px 0', fontSize: '12px', color: theme.textMuted, textTransform: 'uppercase', textAlign: 'left' }}>Description</th>
                <th style={{ padding: '8px 0', fontSize: '12px', color: theme.textMuted, textTransform: 'uppercase', textAlign: 'center' }}>Hours/Qty</th>
                <th style={{ padding: '8px 0', fontSize: '12px', color: theme.textMuted, textTransform: 'uppercase', textAlign: 'center' }}>Rate</th>
                <th style={{ padding: '8px 0', fontSize: '12px', color: theme.textMuted, textTransform: 'uppercase', textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {emp.is_hourly && data.regularHours > 0 && (
                <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                  <td style={{ padding: '8px 0', color: theme.text }}>Regular Hours</td>
                  <td style={{ padding: '8px 0', textAlign: 'center', color: theme.text }}>{data.regularHours.toFixed(2)}</td>
                  <td style={{ padding: '8px 0', textAlign: 'center', color: theme.text }}>{fmt(data.hourlyRate)}</td>
                  <td style={{ padding: '8px 0', textAlign: 'right', color: theme.text }}>{fmt(data.regularHours * data.hourlyRate)}</td>
                </tr>
              )}
              {emp.is_hourly && data.overtimeHours > 0 && (
                <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                  <td style={{ padding: '8px 0', color: theme.text }}>Overtime Hours</td>
                  <td style={{ padding: '8px 0', textAlign: 'center', color: theme.text }}>{data.overtimeHours.toFixed(2)}</td>
                  <td style={{ padding: '8px 0', textAlign: 'center', color: theme.text }}>{fmt(data.hourlyRate * (payrollConfig.overtime_multiplier || 1.5))}</td>
                  <td style={{ padding: '8px 0', textAlign: 'right', color: theme.text }}>{fmt(data.overtimeHours * data.hourlyRate * (payrollConfig.overtime_multiplier || 1.5))}</td>
                </tr>
              )}
              {emp.is_salary && data.salaryPay > 0 && (
                <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                  <td style={{ padding: '8px 0', color: theme.text }}>Salary</td>
                  <td style={{ padding: '8px 0', textAlign: 'center', color: theme.textMuted }}>—</td>
                  <td style={{ padding: '8px 0', textAlign: 'center', color: theme.textMuted }}>—</td>
                  <td style={{ padding: '8px 0', textAlign: 'right', color: theme.text }}>{fmt(data.salaryPay)}</td>
                </tr>
              )}
              {data.commissionPay > 0 && (
                <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                  <td style={{ padding: '8px 0', color: theme.text }}>Commissions</td>
                  <td style={{ padding: '8px 0', textAlign: 'center', color: theme.textMuted }}>—</td>
                  <td style={{ padding: '8px 0', textAlign: 'center', color: theme.textMuted }}>—</td>
                  <td style={{ padding: '8px 0', textAlign: 'right', color: theme.text }}>{fmt(data.commissionPay)}</td>
                </tr>
              )}
              {data.efficiencyBonus.bonus > 0 && (
                <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                  <td style={{ padding: '8px 0', color: theme.text }}>Efficiency Bonus</td>
                  <td style={{ padding: '8px 0', textAlign: 'center', color: theme.textMuted }}>—</td>
                  <td style={{ padding: '8px 0', textAlign: 'center', color: theme.textMuted }}>—</td>
                  <td style={{ padding: '8px 0', textAlign: 'right', color: theme.text }}>{fmt(data.efficiencyBonus.bonus)}</td>
                </tr>
              )}
              {/* Additions */}
              {data.adjustments.filter(a => a.type === 'addition').map(adj => (
                <tr key={adj.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                  <td style={{ padding: '8px 0', color: '#22c55e' }}>{adj.reason || 'Addition'}</td>
                  <td style={{ padding: '8px 0', textAlign: 'center', color: theme.textMuted }}>—</td>
                  <td style={{ padding: '8px 0', textAlign: 'center', color: theme.textMuted }}>—</td>
                  <td style={{ padding: '8px 0', textAlign: 'right', color: '#22c55e' }}>+{fmt(adj.amount)}</td>
                </tr>
              ))}
              <tr style={{ borderTop: `2px solid ${theme.text}` }}>
                <td colSpan={3} style={{ padding: '10px 0', fontWeight: '700', color: theme.text }}>Gross Earnings</td>
                <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: '700', color: theme.text }}>{fmt(data.grossPay + data.totalAdditions)}</td>
              </tr>
            </tbody>
          </table>

          {/* Deductions Table */}
          {data.totalDeductions > 0 && (
            <>
              <div style={{ fontSize: '14px', fontWeight: '700', color: theme.text, marginBottom: '8px' }}>Deductions</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                    <th style={{ padding: '8px 0', fontSize: '12px', color: theme.textMuted, textTransform: 'uppercase', textAlign: 'left' }}>Description</th>
                    <th style={{ padding: '8px 0', fontSize: '12px', color: theme.textMuted, textTransform: 'uppercase', textAlign: 'right' }}>Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.adjustments.filter(a => a.type === 'deduction').map(adj => (
                    <tr key={adj.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                      <td style={{ padding: '8px 0', color: '#ef4444' }}>{adj.reason || 'Deduction'}</td>
                      <td style={{ padding: '8px 0', textAlign: 'right', color: '#ef4444' }}>-{fmt(adj.amount)}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: `2px solid ${theme.text}` }}>
                    <td style={{ padding: '10px 0', fontWeight: '700', color: theme.text }}>Total Deductions</td>
                    <td style={{ padding: '10px 0', textAlign: 'right', fontWeight: '700', color: '#ef4444' }}>-{fmt(data.totalDeductions)}</td>
                  </tr>
                </tbody>
              </table>
            </>
          )}

          {/* Net Pay */}
          <div style={{
            padding: '20px', backgroundColor: 'rgba(34,197,94,0.1)', borderRadius: '10px',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }}>
            <div style={{ fontSize: '16px', fontWeight: '700', color: theme.text }}>Net Pay</div>
            <div style={{ fontSize: '28px', fontWeight: '700', color: '#22c55e' }}>{fmt(data.netPay)}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
