import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { useIsMobile } from '../hooks/useIsMobile'
import { supabase } from '../lib/supabase'
import WhosWorking from '../components/WhosWorking'
import { canViewHR } from '../lib/accessControl'
import { wonJobsInRange, deliveredJobsInRange, sumJobTotal, getDeliveredStatusIds, startOfMonth, startOfYear, daysAgo } from '../lib/jobMetrics'
import { totalCustomerAR, totalUtilityAR } from '../lib/arHelpers'
import { computeRevenue, cashExpenses } from '../lib/revenueBasis'
import { toast } from '../lib/toast'
import {
  UserPlus,
  Briefcase,
  Receipt,
  DollarSign,
  AlertTriangle,
  Clock,
  Calendar,
  TrendingUp,
  Package,
  FileText,
  Truck,
  ChevronRight,
  Plus,
  CreditCard,
  Settings,
  RefreshCw,
  X,
  Eye,
  EyeOff,
  ToggleLeft,
  ToggleRight
} from 'lucide-react'

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

// Pipeline stages matching actual SalesPipeline page
const PIPELINE_STAGES = [
  { id: 'New', name: 'New', color: '#3b82f6' },
  { id: 'Contacted', name: 'Contacted', color: '#8b5cf6' },
  { id: 'Appointment Set', name: 'Scheduled', color: '#22c55e' },
  { id: 'Appointment Scheduled', name: 'Scheduled', color: '#22c55e' },
  { id: 'Qualified', name: 'Qualified', color: '#f97316' },
  { id: 'Quote Sent', name: 'Estimate Sent', color: '#eab308' },
  { id: 'Negotiation', name: 'Negotiation', color: '#f59e0b' },
  { id: 'Won', name: 'Won', color: '#10b981' },
  { id: 'Lost', name: 'Lost', color: '#64748b' }
]
const DISPLAY_STAGES = ['New', 'Contacted', 'Scheduled', 'Qualified', 'Estimate Sent', 'Negotiation', 'Won', 'Lost']
const STAGE_COLORS = { 'New': '#3b82f6', 'Contacted': '#8b5cf6', 'Scheduled': '#22c55e', 'Qualified': '#f97316', 'Estimate Sent': '#eab308', 'Negotiation': '#f59e0b', 'Won': '#10b981', 'Lost': '#64748b' }

// All available metric card definitions
const METRIC_DEFS = [
  { id: 'mtdSalesWon', label: 'MTD Sales Won', icon: TrendingUp, color: '#16a34a', nav: '/pipeline', hint: 'Total $ value of jobs WON this month — counts every job whose created_at falls in the current month, regardless of current status. "Won" means the deal entered the work queue (estimate approved or job created directly). Pair with MTD Delivered for the delivery side.' },
  { id: 'mtdDelivered', label: 'MTD Delivered', icon: Briefcase, color: '#10b981', nav: '/jobs', hint: 'Total $ value of jobs DELIVERED this month — sums job_total for every job whose status moved into a delivered category (Completed, Verified Complete, Invoiced, etc.) this month. A deal can be Won in one month and Delivered in another, so this and MTD Sales Won are intentionally separate.' },
  { id: 'activeLeads', label: 'Active Leads', icon: UserPlus, color: null, nav: '/leads', hint: 'Leads currently in the pipeline (not Won, Lost, or Closed). These are prospects being worked.' },
  { id: 'openJobs', label: 'Open Jobs', icon: Briefcase, color: null, nav: '/jobs', hint: 'Jobs that are Scheduled, In Progress, or Chillin. Does not include Completed or Archived.' },
  { id: 'pendingInvoices', label: 'Pending Invoices', icon: Receipt, color: null, nav: '/invoices', hint: 'Invoices sent but not yet paid. The dollar amount is what customers owe you (accounts receivable).' },
  { id: 'mtdRevenue', label: 'MTD Revenue', icon: DollarSign, color: '#4a7c59', nav: null, hint: 'Cash collected this month (cash basis): actual payments recorded against invoices + lead/job deposits + collected utility incentives. Counts real money in once — no double-counting of bank deposits, no internal transfers.' },
  { id: 'mtdDeposits', label: 'MTD Deposits', icon: TrendingUp, color: '#4a7c59', nav: '/lead-payments', hint: 'Lead and job deposits collected this month within JobScout. These are pre-job payments logged in the system.' },
  { id: 'mtdExpenses', label: 'MTD Expenses', icon: CreditCard, color: '#c25a5a', nav: '/expenses', hint: 'Money spent this month: manually logged expenses + bank outflows from Plaid. Does not include transfers between accounts.' },
  { id: 'completedJobs', label: 'Jobs Completed (MTD)', icon: Briefcase, color: '#10b981', nav: '/jobs', hint: 'Jobs that moved into a delivered status this month (Completed, Verified Complete, Post Inspected, Invoiced, Closed — whichever your pipeline marks as category=delivered in /settings). Counts every job whose status changed into a delivered category this month.' },
  { id: 'totalLeads', label: 'Total Leads', icon: UserPlus, color: '#8b5cf6', nav: '/leads', hint: 'All leads in the system across all statuses including Closed.' },
  { id: 'netIncome', label: 'MTD Net Income', icon: DollarSign, color: '#16a34a', nav: null, hint: 'Revenue minus expenses this month. Positive = profit, negative = loss. Based on actual cash flow, not estimates.' },
  { id: 'avgJobValue', label: 'Avg Job Value', icon: DollarSign, color: '#3b82f6', nav: null, hint: 'Average dollar amount per completed job across all time. Calculated from job totals.' },
  { id: 'conversionRate', label: 'Win Rate', icon: TrendingUp, color: '#10b981', nav: '/pipeline', hint: 'Percentage of decided leads (Won + Lost) that were Won. Higher is better.' },
  // ── PO module tiles (opt-in via preferences) ────────────────────────
  { id: 'needsOrder', label: 'Jobs Needing Parts', icon: Package, color: '#ea580c', nav: '/procurement', hint: 'Jobs with parts_status=needs_order. Batch these into vendor POs on the Procurement Queue page.' },
  { id: 'openPOs', label: 'Open Purchase Orders', icon: FileText, color: '#3b82f6', nav: '/purchase-orders', hint: 'POs in Draft / Sent / Partial-Received status. Total $ on order to vendors.' },
  { id: 'billsDueWeek', label: 'Bills Due This Week', icon: DollarSign, color: '#c28b38', nav: '/bills', hint: 'Vendor bills with due_date inside the next 7 days. Cash you need on hand.' },
]

// Alert type definitions
const ALERT_DEFS = [
  { id: 'lowStock', label: 'Low Stock Items', icon: Package, color: '#c25a5a', bg: 'rgba(194,90,90,0.1)' },
  { id: 'fleetPM', label: 'Fleet PM Overdue', icon: Truck, color: '#d4940a', bg: 'rgba(244,185,66,0.15)' },
  { id: 'overdueInvoices', label: 'Overdue Invoices (30+ days)', icon: Receipt, color: '#c25a5a', bg: 'rgba(194,90,90,0.1)' },
  { id: 'staleEstimates', label: 'Stale Estimates ($5k+, sent 7+ days ago)', icon: AlertTriangle, color: '#d4940a', bg: 'rgba(244,185,66,0.15)' },
  { id: 'pendingTimeOff', label: 'Pending Time-Off Requests', icon: Calendar, color: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
  { id: 'todaysAppts', label: 'Today\'s Appointments', icon: Calendar, color: '#5a9bd5', bg: 'rgba(90,155,213,0.15)' },
]

// Default preferences
const DEFAULT_PREFS = {
  metrics: ['mtdSalesWon', 'mtdDelivered', 'activeLeads', 'openJobs', 'pendingInvoices', 'mtdRevenue', 'mtdDeposits', 'mtdExpenses'],
  pipelineDisplay: 'count', // 'count' | 'dollars' | 'both'
  rollingDays: 90,
  showRolling: true,
  sections: { pipeline: true, whosWorking: true, schedule: true, activity: true, alerts: true, quickActions: true },
  alerts: { lowStock: true, fleetPM: true, overdueInvoices: true, staleEstimates: true, pendingTimeOff: true, todaysAppts: true },
}

const PREFS_KEY = 'jobscout_dashboard_prefs'

function loadPrefs() {
  try {
    const saved = localStorage.getItem(PREFS_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      return { ...DEFAULT_PREFS, ...parsed, sections: { ...DEFAULT_PREFS.sections, ...parsed.sections }, alerts: { ...DEFAULT_PREFS.alerts, ...parsed.alerts } }
    }
  } catch (e) { /* ignore */ }
  return { ...DEFAULT_PREFS }
}

function savePrefs(prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)) } catch (e) { /* ignore */ }
}

export default function Dashboard() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const company = useStore((state) => state.company)
  const user = useStore((state) => state.user)
  const leads = useStore((state) => state.leads)
  const jobs = useStore((state) => state.jobs)
  const jobStatuses = useStore((state) => state.jobStatuses)
  const quotes = useStore((state) => state.quotes)
  const invoices = useStore((state) => state.invoices)
  const payments = useStore((state) => state.payments)
  const inventory = useStore((state) => state.inventory)
  const fleet = useStore((state) => state.fleet)
  const appointments = useStore((state) => state.appointments)
  const employees = useStore((state) => state.employees)
  const expenses = useStore((state) => state.expenses)
  const leadPayments = useStore((state) => state.leadPayments)
  const plaidTransactions = useStore((state) => state.plaidTransactions)
  const utilityInvoices = useStore((state) => state.utilityInvoices)
  const syncPlaidTransactions = useStore((state) => state.syncPlaidTransactions)

  const currentEmployee = employees.find(e => e.email === user?.email)
  const [syncing, setSyncing] = useState(false)

  const [clockedIn, setClockedIn] = useState(false)
  const [activeTimeLog, setActiveTimeLog] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [prefs, setPrefs] = useState(loadPrefs)
  const [drill, setDrill] = useState(null) // metric drill-down: { title, items, total, page }
  const [accountingBasis, setAccountingBasis] = useState('cash') // company revenue basis (set in Books)
  const [pendingTimeOff, setPendingTimeOff] = useState([])
  // PO module stats — lazy-loaded so the Dashboard doesn't pay the cost
  // for companies that don't use the PO/Bills modules. Empty defaults
  // are safe; metric tiles only render when added to user prefs.
  const [poStats, setPoStats] = useState({ needsOrder: 0, openPOs: 0, openPOTotal: 0, billsDueWeek: 0, billsDueWeekCount: 0 })
  const settingsRef = useRef(null)

  // Pending time-off requests — Alayda asked "How can I see requests for
  // time off?" The Payroll page already had them but they were not
  // surfaced anywhere prominent. Now they pop as a dashboard alert badge
  // so HR/owners see pending requests on landing.
  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    supabase
      .from('time_off_requests')
      .select('id, employee_id, start_date, end_date, status, reason')
      .eq('company_id', companyId)
      .eq('status', 'pending')
      .then(({ data }) => { if (!cancelled) setPendingTimeOff(data || []) })
    return () => { cancelled = true }
  }, [companyId])

  // Revenue basis (cash | accrual) — company setting controlled from Books.
  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    supabase.from('settings').select('value').eq('company_id', companyId).eq('key', 'accounting_basis').maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data?.value) return
        let b = data.value
        if (typeof b === 'string') { try { b = JSON.parse(b) } catch { /* bare string */ } }
        if (b === 'cash' || b === 'accrual') setAccountingBasis(b)
      })
    return () => { cancelled = true }
  }, [companyId])

  // PO module stats — three concurrent counts for the new dashboard tiles
  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    const now = new Date(); now.setHours(0,0,0,0)
    const weekOut = new Date(now); weekOut.setDate(weekOut.getDate() + 7)
    Promise.all([
      supabase.from('jobs').select('id', { count: 'exact', head: true })
        .eq('company_id', companyId).eq('parts_status', 'needs_order'),
      supabase.from('purchase_orders').select('total')
        .eq('company_id', companyId).in('status', ['draft', 'sent', 'partial_received']),
      supabase.from('bills').select('balance_due, due_date')
        .eq('company_id', companyId).neq('status', 'paid').neq('status', 'void')
        .gte('due_date', now.toISOString().slice(0,10))
        .lte('due_date', weekOut.toISOString().slice(0,10)),
    ]).then(([nRes, pRes, bRes]) => {
      if (cancelled) return
      const openPOTotal = (pRes.data || []).reduce((s, p) => s + (parseFloat(p.total) || 0), 0)
      const billsDueWeek = (bRes.data || []).reduce((s, b) => s + (parseFloat(b.balance_due) || 0), 0)
      setPoStats({
        needsOrder: nRes.count || 0,
        openPOs: (pRes.data || []).length,
        openPOTotal,
        billsDueWeek,
        billsDueWeekCount: (bRes.data || []).length,
      })
    })
    return () => { cancelled = true }
  }, [companyId])

  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme
  const isMobile = useIsMobile()

  const updatePrefs = (update) => {
    setPrefs(prev => {
      const next = typeof update === 'function' ? update(prev) : { ...prev, ...update }
      savePrefs(next)
      return next
    })
  }

  useEffect(() => {
    if (!companyId) { navigate('/'); return }
    checkActiveTimeLog()
  }, [companyId, navigate])

  // Close settings on outside click
  useEffect(() => {
    if (!showSettings) return
    const handler = (e) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target)) setShowSettings(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showSettings])

  const checkActiveTimeLog = async () => {
    if (!currentEmployee?.id) return
    const { data } = await supabase
      .from('time_clock')
      .select('*')
      .eq('employee_id', currentEmployee.id)
      .eq('company_id', companyId)
      .is('clock_out', null)
      .single()
    if (data) { setClockedIn(true); setActiveTimeLog(data) }
  }

  const handleClockToggle = async () => {
    if (clockedIn && activeTimeLog) {
      const clockOut = new Date()
      let totalHours = 0
      if (activeTimeLog.clock_in) {
        totalHours = (clockOut - new Date(activeTimeLog.clock_in)) / (1000 * 60 * 60)
        if (activeTimeLog.lunch_start && activeTimeLog.lunch_end) {
          totalHours -= (new Date(activeTimeLog.lunch_end) - new Date(activeTimeLog.lunch_start)) / (1000 * 60 * 60)
        }
        totalHours = Math.max(0, totalHours)
      }
      await supabase.from('time_clock').update({ clock_out: clockOut.toISOString(), total_hours: totalHours }).eq('id', activeTimeLog.id)
      setClockedIn(false); setActiveTimeLog(null)
    } else {
      const { data } = await supabase.from('time_clock').insert({ company_id: companyId, employee_id: currentEmployee?.id, clock_in: new Date().toISOString() }).select().single()
      if (data) { setClockedIn(true); setActiveTimeLog(data) }
    }
  }

  // Bank sync from the dashboard — the Plaid sync otherwise only lives on
  // Books > Transactions, which is hard to reach on the phone (Bryce: "no way
  // to sync on the phone app").
  const handleSync = async () => {
    if (syncing || !syncPlaidTransactions) return
    setSyncing(true)
    try {
      const r = await syncPlaidTransactions()
      if (r?.error) toast.error('Sync failed: ' + r.error)
      else toast.success('Bank synced')
    } catch (e) {
      toast.error('Sync failed: ' + (e?.message || 'unknown error'))
    }
    setSyncing(false)
  }

  // ── Calculate all metrics ──
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)

  const activeLeads = leads.filter(l => !['Won', 'Lost', 'Converted', 'Not Qualified'].includes(l.status)).length
  const openJobs = jobs.filter(j => {
    const s = (j.status || '').toLowerCase()
    return ['scheduled', 'in progress', 'needs scheduling', 'chillin', 'waiting product'].includes(s)
  }).length
  const unpaidInvoices = invoices.filter(i => ['Pending', 'Sent', 'Partial', 'Overdue'].includes(i.payment_status))
  const pendingInvoices = unpaidInvoices.length
  // AR = customer balance (gross − discount − applied payments) PLUS what
  // utilities still owe in unpaid rebates. Reading inv.amount alone for
  // an Energy Scout project inflated AR by ~$200k per job (gross included
  // the incentive that's not the customer's to pay). Utility invoices
  // were also being ignored entirely, which under-counted real AR.
  const customerAR = totalCustomerAR(invoices, payments)
  const utilityAR = totalUtilityAR(utilityInvoices)
  const accountsReceivable = customerAR + utilityAR

  const isThisMonth = (dateStr) => dateStr && new Date(dateStr) >= firstOfMonth
  // Revenue — CASH BASIS (money actually collected). Uses the payments table
  // (each row is a real, dated, invoice-linked payment) instead of the old
  // "paid-invoice gross + bank deposits" formula, which double-counted — a
  // check both marks the invoice Paid AND lands as a Plaid deposit — and swept
  // in internal transfers. Bank deposits are computed separately, NOT added in.
  const isCollected = (p) => (p.status || 'Completed') !== 'Refunded' && (p.status || '') !== 'Voided'
  const paymentsMTD = (payments || []).filter(p => isCollected(p) && isThisMonth(p.date || p.created_at)).reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
  const thisMonthDeposits = (leadPayments || []).filter(d => isThisMonth(d.date_created || d.created_at)).reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0)
  const collectedIncentiveMTD = (utilityInvoices || []).filter(i => i.payment_status === 'Paid' && isThisMonth(i.updated_at || i.created_at)).reduce((sum, i) => sum + (parseFloat(i.amount || i.incentive_amount) || 0), 0)
  const thisMonthRevenue = computeRevenue(accountingBasis, { payments, leadPayments, utilityInvoices, invoices }, isThisMonth)
  // Expenses: manual expenses + Plaid outflows (match Books.jsx)
  // Expenses — cash basis, deduped (bank outflows + manual not linked to a
  // bank txn), so a manual expense that's also a bank transaction isn't counted
  // twice. manualExpensesMTD/plaidOutMTD kept for the breakdown subtitle.
  const manualExpensesMTD = (expenses || []).filter(e => e.date && isThisMonth(e.date)).reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0)
  const plaidOutMTD = (plaidTransactions || []).filter(t => t.amount > 0 && isThisMonth(t.date) && !t.is_transfer).reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0)
  const thisMonthExpenses = cashExpenses({ expenses, plaidTransactions }, isThisMonth)

  // Quote amounts by lead (for sales won + pipeline chart)
  const quoteByLead = {}
  ;(quotes || []).forEach(q => {
    const amt = parseFloat(q.quote_amount) || 0
    if (q.lead_id && amt > (quoteByLead[q.lead_id] || 0)) quoteByLead[q.lead_id] = amt
  })

  // ─── Sales Won + Jobs Delivered ─────────────────────────────────────────
  // Single source of truth: src/lib/jobMetrics.js. See that file for the
  // definitions. Status sets are config-driven from the company's
  // `jobStatuses` settings — custom pipelines just work.
  //
  // WON  = a job exists (estimate→job approval OR fresh job). Timestamp =
  //        jobs.created_at.
  // DELIVERED = a job is in a status flagged category='delivered' in the
  //        company's settings (Completed, Verified Complete, etc.).
  //        Timestamp = jobs.last_status_change_at (set by DB trigger).
  const mtdWonJobs = wonJobsInRange(jobs, firstOfMonth, null)
  const mtdSalesWon = sumJobTotal(mtdWonJobs)
  const mtdDeliveredJobs = deliveredJobsInRange(jobs, jobStatuses, firstOfMonth, null)
  const completedJobsMTD = mtdDeliveredJobs.length
  const mtdDelivered = sumJobTotal(mtdDeliveredJobs)

  // Avg-job-value uses ALL delivered jobs (not just MTD)
  const allDeliveredJobs = deliveredJobsInRange(jobs, jobStatuses, null, null)
  const avgJobValue = allDeliveredJobs.length > 0 ? sumJobTotal(allDeliveredJobs) / allDeliveredJobs.length : 0

  // Win rate still measured at the LEAD level — it answers "of the leads
  // that got a decision, what % were wins?" — which is a sales-funnel
  // question, not a job-delivery question. Kept separate intentionally.
  const totalLeadsCount = leads.length
  const netIncome = thisMonthRevenue - thisMonthExpenses
  const wonLeads = leads.filter(l => l.status === 'Won').length
  const decidedLeads = leads.filter(l => l.status === 'Won' || l.status === 'Lost').length
  const conversionRate = decidedLeads > 0 ? Math.round((wonLeads / decidedLeads) * 100) : 0

  // ── YTD calculations ──
  const firstOfYear = new Date(today.getFullYear(), 0, 1)
  const isThisYear = (dateStr) => dateStr && new Date(dateStr) >= firstOfYear

  const paymentsYTD = (payments || []).filter(p => isCollected(p) && isThisYear(p.date || p.created_at)).reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0)
  const depositsYTD = (leadPayments || []).filter(d => isThisYear(d.date_created || d.created_at)).reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0)
  const collectedIncentiveYTD = (utilityInvoices || []).filter(i => i.payment_status === 'Paid' && isThisYear(i.updated_at || i.created_at)).reduce((sum, i) => sum + (parseFloat(i.amount || i.incentive_amount) || 0), 0)
  const ytdRevenue = computeRevenue(accountingBasis, { payments, leadPayments, utilityInvoices, invoices }, isThisYear)

  const ytdExpenses = cashExpenses({ expenses, plaidTransactions }, isThisYear)
  const ytdNetIncome = ytdRevenue - ytdExpenses

  // YTD — same definitions as MTD, just a wider window.
  const ytdWonJobs = wonJobsInRange(jobs, firstOfYear, null)
  const ytdSalesWon = sumJobTotal(ytdWonJobs)
  const ytdDeposits = depositsYTD
  const ytdDeliveredJobs = deliveredJobsInRange(jobs, jobStatuses, firstOfYear, null)
  const completedJobsYTD = ytdDeliveredJobs.length
  const ytdDelivered = sumJobTotal(ytdDeliveredJobs)

  // ── Build revenue/expense breakdown descriptions ──
  const revenueParts = []
  if (paymentsMTD > 0) revenueParts.push(`${formatCurrency(paymentsMTD)} collected`)
  if (thisMonthDeposits > 0) revenueParts.push(`${formatCurrency(thisMonthDeposits)} deposits`)
  if (collectedIncentiveMTD > 0) revenueParts.push(`${formatCurrency(collectedIncentiveMTD)} incentives`)
  const revenueSubtitle = accountingBasis === 'accrual'
    ? 'Invoiced this month (accrual basis)'
    : (revenueParts.length > 0 ? revenueParts.join(' + ') : 'No payments collected this month')

  const unmatchedManualMTD = (expenses || []).filter(e => !e.plaid_transaction_id && e.date && isThisMonth(e.date)).reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0)
  const expenseParts = []
  if (plaidOutMTD > 0) expenseParts.push(`${formatCurrency(plaidOutMTD)} bank`)
  if (unmatchedManualMTD > 0) expenseParts.push(`${formatCurrency(unmatchedManualMTD)} manual`)
  const expenseSubtitle = expenseParts.length > 0 ? expenseParts.join(' + ') : 'No expenses this month'

  // Metric values map — subtitles explain exactly where each number comes from
  const metricValues = {
    mtdSalesWon: { value: formatCurrency(mtdSalesWon), subtitle: `${mtdWonJobs.length} job${mtdWonJobs.length !== 1 ? 's' : ''} won this month`, ytdValue: formatCurrency(ytdSalesWon), ytdLabel: 'YTD Sales Won' },
    mtdDelivered: { value: formatCurrency(mtdDelivered), subtitle: `${mtdDeliveredJobs.length} job${mtdDeliveredJobs.length !== 1 ? 's' : ''} delivered this month`, ytdValue: formatCurrency(ytdDelivered), ytdLabel: 'YTD Delivered' },
    activeLeads: { value: activeLeads, subtitle: 'Leads in pipeline (not Won/Lost)' },
    openJobs: { value: openJobs, subtitle: 'Scheduled + In Progress + Chillin' },
    pendingInvoices: {
      value: pendingInvoices,
      subtitle: utilityAR > 0
        ? `${formatCurrency(customerAR)} customers + ${formatCurrency(utilityAR)} utilities = ${formatCurrency(accountsReceivable)} owed`
        : `${formatCurrency(accountsReceivable)} owed`,
    },
    mtdRevenue: { value: formatCurrency(thisMonthRevenue), subtitle: revenueSubtitle || 'Paid invoices + deposits + bank', ytdValue: formatCurrency(ytdRevenue), ytdLabel: 'YTD Revenue' },
    mtdDeposits: { value: formatCurrency(thisMonthDeposits), subtitle: 'From Lead Payments page', ytdValue: formatCurrency(ytdDeposits), ytdLabel: 'YTD Deposits' },
    mtdExpenses: { value: formatCurrency(thisMonthExpenses), subtitle: expenseSubtitle || 'Manual expenses + bank outflows', ytdValue: formatCurrency(ytdExpenses), ytdLabel: 'YTD Expenses' },
    completedJobs: { value: completedJobsMTD, subtitle: 'Delivery completed (from Job Board)', ytdValue: completedJobsYTD, ytdLabel: 'YTD Completed' },
    totalLeads: { value: totalLeadsCount, subtitle: 'All leads in pipeline' },
    netIncome: { value: formatCurrency(netIncome), subtitle: 'Revenue - Expenses (cash basis)', ytdValue: formatCurrency(ytdNetIncome), ytdLabel: 'YTD Net Income' },
    avgJobValue: { value: formatCurrency(avgJobValue), subtitle: `Across ${allDeliveredJobs.length} delivered jobs` },
    conversionRate: { value: `${conversionRate}%`, subtitle: `${wonLeads} won / ${decidedLeads} decided` },
    // ── PO module tiles (numbers from poStats lazy-fetch above) ─────
    needsOrder: { value: poStats.needsOrder, subtitle: poStats.needsOrder > 0 ? 'Click to batch into vendor POs' : 'No jobs waiting on parts' },
    openPOs: { value: poStats.openPOs, subtitle: `${formatCurrency(poStats.openPOTotal)} on order to vendors` },
    billsDueWeek: { value: formatCurrency(poStats.billsDueWeek), subtitle: `${poStats.billsDueWeekCount} bill${poStats.billsDueWeekCount === 1 ? '' : 's'} due in the next 7 days` },
  }

  // Pipeline
  const mapLeadToDisplay = (status) => {
    const stage = PIPELINE_STAGES.find(s => s.id === status || s.id === (status || '').trim())
    return stage?.name || null
  }
  const pipelineData = DISPLAY_STAGES.map(displayName => {
    const stageLeads = leads.filter(l => mapLeadToDisplay(l.status) === displayName)
    return {
      stage: displayName,
      count: stageLeads.length,
      dollars: stageLeads.reduce((sum, l) => sum + (quoteByLead[l.id] || 0), 0)
    }
  })
  const totalPipelineCount = pipelineData.reduce((sum, p) => sum + p.count, 0)
  const totalPipelineDollars = pipelineData.reduce((sum, p) => sum + p.dollars, 0)

  // Rolling average — DELIVERED revenue averaged over the user's chosen
  // window. Uses last_status_change_at, not start_date, so a 90-day rolling
  // means "delivered in the last 90 days" not "scheduled to start in".
  const rollingCutoff = daysAgo(prefs.rollingDays, today)
  const rollingCompletedJobs = deliveredJobsInRange(jobs, jobStatuses, rollingCutoff, null)
  const rollingWonTotal = sumJobTotal(rollingCompletedJobs)
  const rollingWonCount = rollingCompletedJobs.length
  const rollingAvgPerMonth = prefs.rollingDays > 0 ? (rollingWonTotal / prefs.rollingDays) * 30 : 0

  // Today's jobs
  const todaysJobs = jobs.filter(j => j.start_date?.startsWith(todayStr))

  // Recent activity
  const recentLeads = [...leads].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5)
  const recentCompletedJobs = jobs.filter(j => j.status === 'Completed').sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)).slice(0, 5)

  // Alerts
  // Stale estimates: status='Sent', $5K+, sent 7+ days ago. The safety net
  // for option-A on the "estimate stuck in Sent forever" problem — surfaces
  // every Pacific-Steel-style gap so reps either close or kill them.
  const sevenDaysAgo = new Date(today.getTime() - 7 * 86400000)
  const staleEstimates = (quotes || []).filter(q => {
    if (q.status !== 'Sent') return false
    const amt = parseFloat(q.quote_amount) || 0
    if (amt < 5000) return false
    const sentAt = q.sent_date || q.last_sent_at
    if (!sentAt) return false
    return new Date(sentAt) < sevenDaysAgo
  })
  const alertData = {
    lowStock: { items: inventory.filter(i => i.quantity < (i.min_quantity || 10)), nav: '/inventory' },
    fleetPM: { items: fleet.filter(f => f.next_pm_due && new Date(f.next_pm_due) < today), nav: '/fleet' },
    overdueInvoices: { items: invoices.filter(i => { if (i.payment_status !== 'Pending') return false; return Math.floor((today - new Date(i.created_at)) / 86400000) > 30 }), nav: '/invoices' },
    staleEstimates: { items: staleEstimates, nav: '/estimates' },
    pendingTimeOff: { items: pendingTimeOff, nav: '/payroll' },
    todaysAppts: { items: appointments.filter(a => a.start_time?.startsWith(todayStr)), nav: '/appointments' },
  }
  const visibleAlerts = ALERT_DEFS.filter(a => prefs.alerts[a.id] && alertData[a.id].items.length > 0)

  function formatCurrency(val) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val || 0)
  }

  function formatDate(dateStr) {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  // Drill-down: the actual records BEHIND a metric number, so clicking a tile
  // shows what it's made of (which jobs closed, which payments, etc.) instead
  // of dumping you on a generic page.
  const buildDrill = (id) => {
    const mtdPayments = (payments || []).filter(p => isCollected(p) && isThisMonth(p.date || p.created_at))
    const invById = (iid) => (invoices || []).find(i => i.id === iid)
    switch (id) {
      case 'mtdRevenue': return {
        title: 'Cash collected this month', total: formatCurrency(thisMonthRevenue), page: '/books',
        items: mtdPayments.sort((a, b) => new Date(b.date || b.created_at) - new Date(a.date || a.created_at))
          .map(p => ({ primary: invById(p.invoice_id)?.invoice_id || 'Payment', secondary: `${p.method || ''} · ${formatDate(p.date || p.created_at)}`, amount: formatCurrency(p.amount), nav: p.invoice_id ? `/invoices/${p.invoice_id}` : null })),
      }
      case 'mtdSalesWon': return {
        title: 'Jobs won this month', total: formatCurrency(mtdSalesWon), page: '/pipeline',
        items: [...mtdWonJobs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          .map(j => ({ primary: j.job_title || j.job_id, secondary: formatDate(j.created_at), amount: formatCurrency(j.job_total), nav: `/jobs/${j.id}` })),
      }
      case 'mtdDelivered':
      case 'completedJobs': return {
        title: 'Jobs delivered this month', total: formatCurrency(mtdDelivered), page: '/jobs',
        items: [...mtdDeliveredJobs].sort((a, b) => new Date(b.last_status_change_at || b.updated_at || 0) - new Date(a.last_status_change_at || a.updated_at || 0))
          .map(j => ({ primary: j.job_title || j.job_id, secondary: formatDate(j.last_status_change_at || j.updated_at), amount: formatCurrency(j.job_total), nav: `/jobs/${j.id}` })),
      }
      case 'mtdDeposits': return {
        title: 'Deposits collected this month', total: formatCurrency(thisMonthDeposits), page: '/lead-payments',
        items: (leadPayments || []).filter(d => isThisMonth(d.date_created || d.created_at))
          .map(d => ({ primary: d.customer_name || d.lead_name || 'Deposit', secondary: formatDate(d.date_created || d.created_at), amount: formatCurrency(d.amount), nav: '/lead-payments' })),
      }
      case 'mtdExpenses': {
        const bankOut = (plaidTransactions || []).filter(t => t.amount > 0 && !t.is_transfer && isThisMonth(t.date))
          .map(t => ({ primary: t.name || 'Bank expense', secondary: `Bank · ${formatDate(t.date)}`, amount: formatCurrency(t.amount), nav: '/books', _amt: parseFloat(t.amount) || 0 }))
        const manualOut = (expenses || []).filter(e => !e.plaid_transaction_id && e.date && isThisMonth(e.date))
          .map(e => ({ primary: e.description || e.category || 'Expense', secondary: `Manual · ${formatDate(e.date)}`, amount: formatCurrency(e.amount), nav: '/expenses', _amt: parseFloat(e.amount) || 0 }))
        return { title: 'Expenses this month', total: formatCurrency(thisMonthExpenses), page: '/expenses', items: [...bankOut, ...manualOut].sort((a, b) => b._amt - a._amt) }
      }
      case 'pendingInvoices': return {
        title: 'Unpaid invoices', total: formatCurrency(accountsReceivable), page: '/invoices',
        items: [...unpaidInvoices].sort((a, b) => (parseFloat(b.amount) || 0) - (parseFloat(a.amount) || 0))
          .map(i => ({ primary: i.invoice_id || `INV-${i.id}`, secondary: i.payment_status, amount: formatCurrency(i.amount), nav: `/invoices/${i.id}` })),
      }
      case 'openJobs': return {
        title: 'Open jobs', total: null, page: '/jobs',
        items: jobs.filter(j => ['scheduled', 'in progress', 'needs scheduling', 'chillin', 'waiting product'].includes((j.status || '').toLowerCase()))
          .map(j => ({ primary: j.job_title || j.job_id, secondary: j.status, amount: '', nav: `/jobs/${j.id}` })),
      }
      case 'activeLeads': return {
        title: 'Active leads', total: null, page: '/leads',
        items: leads.filter(l => !['Won', 'Lost', 'Converted', 'Not Qualified'].includes(l.status))
          .map(l => ({ primary: l.customer_name || l.business_name || 'Lead', secondary: l.status, amount: '', nav: '/leads' })),
      }
      default: return null
    }
  }

  // ── Toggle helpers for settings ──
  const toggleMetric = (id) => {
    updatePrefs(p => ({
      ...p,
      metrics: p.metrics.includes(id) ? p.metrics.filter(m => m !== id) : [...p.metrics, id]
    }))
  }

  const toggleSection = (key) => {
    updatePrefs(p => ({ ...p, sections: { ...p.sections, [key]: !p.sections[key] } }))
  }

  const toggleAlert = (id) => {
    updatePrefs(p => ({ ...p, alerts: { ...p.alerts, [id]: !p.alerts[id] } }))
  }

  // ── Reusable components ──
  const MetricCard = ({ icon: Icon, label, value, color, onClick, subtitle, ytdLabel, ytdValue, hint }) => (
    <div
      onClick={onClick}
      title={hint || ''}
      style={{
        backgroundColor: theme.bgCard,
        borderRadius: '12px',
        border: `1px solid ${theme.border}`,
        padding: '20px',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.15s ease'
      }}
      onMouseEnter={(e) => onClick && (e.currentTarget.style.transform = 'translateY(-2px)')}
      onMouseLeave={(e) => onClick && (e.currentTarget.style.transform = 'translateY(0)')}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
        <div style={{
          width: '44px', height: '44px', borderRadius: '10px',
          backgroundColor: color || theme.accentBg,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <Icon size={22} style={{ color: color ? '#fff' : theme.accent }} />
        </div>
        <span style={{ fontSize: '13px', color: theme.textMuted, fontWeight: '500' }}>{label}</span>
      </div>
      <div style={{ fontSize: isMobile ? '26px' : '32px', fontWeight: '700', color: theme.text }}>{value}</div>
      {subtitle && (
        <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '4px', lineHeight: '1.4' }}>{subtitle}</div>
      )}
      {ytdValue !== undefined && (
        <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: `1px solid ${theme.border}` }}>
          <div style={{ fontSize: '12px', color: theme.textMuted, fontWeight: '500', marginBottom: '2px' }}>{ytdLabel || 'YTD'}</div>
          <div style={{ fontSize: isMobile ? '18px' : '20px', fontWeight: '700', color: theme.text }}>{ytdValue}</div>
        </div>
      )}
    </div>
  )

  const ToggleSwitch = ({ on, onToggle, label }) => (
    <div
      onClick={onToggle}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', cursor: 'pointer', minHeight: '44px' }}
    >
      <span style={{ fontSize: '14px', color: theme.text }}>{label}</span>
      {on
        ? <ToggleRight size={24} style={{ color: theme.accent, flexShrink: 0 }} />
        : <ToggleLeft size={24} style={{ color: theme.textMuted, flexShrink: 0 }} />
      }
    </div>
  )

  // Pipeline bar value for display mode
  const getPipelineBarValue = (p) => {
    if (prefs.pipelineDisplay === 'dollars') return p.dollars
    return p.count
  }
  const getPipelineBarTotal = () => {
    if (prefs.pipelineDisplay === 'dollars') return totalPipelineDollars
    return totalPipelineCount
  }
  const getPipelineBarLabel = (p) => {
    if (prefs.pipelineDisplay === 'dollars') return formatCurrency(p.dollars)
    if (prefs.pipelineDisplay === 'both') return `${p.count} / ${formatCurrency(p.dollars)}`
    return p.count
  }

  return (
    <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '100%', overflowX: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '12px' : '16px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <img
          src="/Scout_LOGO_GUY.png"
          alt="Job Scout"
          style={{ width: isMobile ? '44px' : '56px', height: isMobile ? '44px' : '56px', objectFit: 'contain', flexShrink: 0, opacity: 0.85 }}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ fontSize: isMobile ? '20px' : '28px', fontWeight: '700', color: theme.text, marginBottom: '4px' }}>
            Welcome back, {user?.name || 'User'}
          </h1>
          <div style={{ fontSize: isMobile ? '12px' : '14px', color: theme.textMuted }}>
            {company?.company_name} &middot; {today.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
        </div>
        <button
          onClick={() => setShowSettings(true)}
          style={{
            padding: '10px',
            backgroundColor: theme.accentBg,
            border: `1px solid ${theme.border}`,
            borderRadius: '10px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0
          }}
          title="Dashboard Settings"
        >
          <Settings size={20} style={{ color: theme.accent }} />
        </button>
      </div>

      {/* ═══ Settings Panel (slide-out) ═══ */}
      {showSettings && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 1000,
          display: 'flex', justifyContent: 'flex-end'
        }}>
          <div
            ref={settingsRef}
            style={{
              width: isMobile ? '100vw' : '380px', maxWidth: '90vw', height: '100%',
              backgroundColor: theme.bgCard,
              borderLeft: `1px solid ${theme.border}`,
              overflowY: 'auto',
              boxShadow: '-4px 0 20px rgba(0,0,0,0.1)'
            }}
          >
            {/* Settings Header */}
            <div style={{
              padding: '20px', borderBottom: `1px solid ${theme.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              position: 'sticky', top: 0, backgroundColor: theme.bgCard, zIndex: 1
            }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: theme.text, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Settings size={20} /> Dashboard Settings
              </h2>
              <button
                onClick={() => setShowSettings(false)}
                style={{ padding: '8px', backgroundColor: 'transparent', border: 'none', cursor: 'pointer', borderRadius: '6px' }}
              >
                <X size={20} style={{ color: theme.textMuted }} />
              </button>
            </div>

            <div style={{ padding: '20px' }}>
              {/* ── Sections Visibility ── */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', marginBottom: '8px' }}>
                  Visible Sections
                </div>
                <ToggleSwitch on={prefs.sections.pipeline} onToggle={() => toggleSection('pipeline')} label="Sales Pipeline" />
                {canViewHR(currentEmployee) && (
                  <ToggleSwitch on={prefs.sections.whosWorking} onToggle={() => toggleSection('whosWorking')} label="Who's Working (Live Map)" />
                )}
                <ToggleSwitch on={prefs.sections.schedule} onToggle={() => toggleSection('schedule')} label="Today's Schedule" />
                <ToggleSwitch on={prefs.sections.activity} onToggle={() => toggleSection('activity')} label="Recent Activity" />
                <ToggleSwitch on={prefs.sections.alerts} onToggle={() => toggleSection('alerts')} label="Alerts & Warnings" />
                <ToggleSwitch on={prefs.sections.quickActions} onToggle={() => toggleSection('quickActions')} label="Quick Actions" />
              </div>

              {/* ── Metric Cards ── */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', marginBottom: '8px' }}>
                  Metric Cards
                </div>
                {METRIC_DEFS.map(m => (
                  <ToggleSwitch key={m.id} on={prefs.metrics.includes(m.id)} onToggle={() => toggleMetric(m.id)} label={m.label} />
                ))}
              </div>

              {/* ── Pipeline Display ── */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', marginBottom: '12px' }}>
                  Pipeline Display
                </div>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                  {[
                    { value: 'count', label: 'Count' },
                    { value: 'dollars', label: 'Dollars' },
                    { value: 'both', label: 'Both' },
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => updatePrefs({ pipelineDisplay: opt.value })}
                      style={{
                        flex: 1,
                        padding: '10px',
                        backgroundColor: prefs.pipelineDisplay === opt.value ? theme.accent : 'transparent',
                        color: prefs.pipelineDisplay === opt.value ? '#fff' : theme.text,
                        border: `1px solid ${prefs.pipelineDisplay === opt.value ? theme.accent : theme.border}`,
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: '500',
                        cursor: 'pointer',
                        minHeight: '44px'
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {/* Rolling Average */}
                <ToggleSwitch on={prefs.showRolling} onToggle={() => updatePrefs({ showRolling: !prefs.showRolling })} label="Show Rolling Average" />
                {prefs.showRolling && (
                  <div style={{ marginTop: '8px' }}>
                    <div style={{ fontSize: '13px', color: theme.textSecondary, marginBottom: '8px' }}>Rolling Window</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {[30, 60, 90, 120, 180, 365].map(d => (
                        <button
                          key={d}
                          onClick={() => updatePrefs({ rollingDays: d })}
                          style={{
                            padding: '8px 14px',
                            backgroundColor: prefs.rollingDays === d ? theme.accent : 'transparent',
                            color: prefs.rollingDays === d ? '#fff' : theme.text,
                            border: `1px solid ${prefs.rollingDays === d ? theme.accent : theme.border}`,
                            borderRadius: '6px',
                            fontSize: '13px',
                            fontWeight: prefs.rollingDays === d ? '600' : '400',
                            cursor: 'pointer',
                            minHeight: '44px'
                          }}
                        >
                          {d}d
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Alert Types ── */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', marginBottom: '8px' }}>
                  Alert Types
                </div>
                {ALERT_DEFS.map(a => (
                  <ToggleSwitch key={a.id} on={prefs.alerts[a.id]} onToggle={() => toggleAlert(a.id)} label={a.label} />
                ))}
              </div>

              {/* Reset */}
              <button
                onClick={() => { updatePrefs(() => ({ ...DEFAULT_PREFS })) }}
                style={{
                  width: '100%',
                  padding: '12px',
                  backgroundColor: 'rgba(194,90,90,0.1)',
                  color: '#c25a5a',
                  border: `1px solid rgba(194,90,90,0.3)`,
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  minHeight: '44px'
                }}
              >
                Reset to Defaults
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Row 1: Key Metrics ═══ */}
      {prefs.metrics.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          {prefs.metrics.map(id => {
            const def = METRIC_DEFS.find(m => m.id === id)
            if (!def) return null
            const mv = metricValues[id] || {}
            const val = typeof mv === 'object' ? mv.value : mv
            return (
              <MetricCard
                key={id}
                icon={def.icon}
                label={def.label}
                value={val}
                color={def.color}
                onClick={() => { const d = buildDrill(id); if (d && d.items.length) setDrill(d); else if (def.nav) navigate(def.nav) }}
                subtitle={mv.subtitle}
                ytdValue={mv.ytdValue}
                ytdLabel={mv.ytdLabel}
                hint={def.hint}
              />
            )
          })}
        </div>
      )}

      {/* ═══ Row 2: Pipeline Overview ═══ */}
      {prefs.sections.pipeline && (
        <div style={{
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          padding: '20px',
          marginBottom: '24px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TrendingUp size={20} style={{ color: theme.accent }} />
              Sales Pipeline
              {prefs.pipelineDisplay === 'dollars' && (
                <span style={{ fontSize: '13px', fontWeight: '400', color: theme.textMuted, marginLeft: '4px' }}>
                  ({formatCurrency(totalPipelineDollars)})
                </span>
              )}
            </h2>
            <button
              onClick={() => navigate('/pipeline')}
              style={{
                padding: '6px 12px', backgroundColor: theme.accentBg, color: theme.accent,
                border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '500',
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
              }}
            >
              View All <ChevronRight size={14} />
            </button>
          </div>

          {/* Pipeline Bar */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', height: '32px', borderRadius: '8px', overflow: 'hidden', backgroundColor: theme.bg }}>
              {pipelineData.map((p) => {
                const val = getPipelineBarValue(p)
                const total = getPipelineBarTotal()
                if (val <= 0) return null
                return (
                  <div
                    key={p.stage}
                    style={{
                      width: `${(val / Math.max(total, 1)) * 100}%`,
                      backgroundColor: STAGE_COLORS[p.stage] || '#6b7280',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      minWidth: '40px'
                    }}
                    title={`${p.stage}: ${p.count} leads / ${formatCurrency(p.dollars)}`}
                  >
                    <span style={{ color: '#fff', fontSize: isMobile ? '10px' : '12px', fontWeight: '600' }}>
                      {prefs.pipelineDisplay === 'dollars' ? formatCurrency(p.dollars) : p.count}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Pipeline Legend */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: isMobile ? '8px 12px' : '16px' }}>
            {pipelineData.filter(p => p.count > 0).map(p => (
              <div key={p.stage} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: STAGE_COLORS[p.stage] || '#6b7280' }} />
                <span style={{ fontSize: '13px', color: theme.textSecondary }}>{p.stage}</span>
                <span style={{ fontSize: '13px', fontWeight: '600', color: theme.text }}>
                  {getPipelineBarLabel(p)}
                </span>
              </div>
            ))}
          </div>

          {/* Rolling Average */}
          {prefs.showRolling && (
            <div style={{
              marginTop: '16px', paddingTop: '16px', borderTop: `1px solid ${theme.border}`,
              display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', flexDirection: isMobile ? 'column' : 'row', flexWrap: 'wrap', gap: isMobile ? '12px' : '16px'
            }}>
              <div title={`Average monthly delivered revenue. Sums the last ${prefs.rollingDays} days of completed jobs and normalizes to a 30-day rate. Not the same as the Pipeline page's raw last-30-days total.`}>
                <div style={{ fontSize: '12px', color: theme.textMuted, fontWeight: '500', marginBottom: '2px' }}>
                  Avg monthly delivered &middot; last {prefs.rollingDays}d
                </div>
                <div style={{ fontSize: isMobile ? '20px' : '22px', fontWeight: '700', color: '#16a34a' }}>
                  {formatCurrency(rollingAvgPerMonth)}<span style={{ fontSize: '13px', fontWeight: '400', color: theme.textMuted }}>/mo</span>
                </div>
              </div>
              <div style={{ borderLeft: isMobile ? 'none' : `1px solid ${theme.border}`, paddingLeft: isMobile ? 0 : '16px', borderTop: isMobile ? `1px solid ${theme.border}` : 'none', paddingTop: isMobile ? '12px' : 0, width: isMobile ? '100%' : 'auto' }}>
                <div style={{ fontSize: '12px', color: theme.textMuted, fontWeight: '500', marginBottom: '2px' }}>
                  Completed Jobs ({prefs.rollingDays}d)
                </div>
                <div style={{ fontSize: isMobile ? '20px' : '22px', fontWeight: '700', color: theme.text }}>
                  {rollingWonCount}
                  <span style={{ fontSize: '13px', fontWeight: '400', color: theme.textMuted }}> &middot; {formatCurrency(rollingWonTotal)} total</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ Who's Working — live map of clocked-in employees ═══ */}
      {/* Gated to users with HR access — knowing where employees are physically
          located is a manager/HR visibility concern. Office/bookkeeper roles
          (Tracy) don't see this; managers with HR access (Alayda, owners) do. */}
      {prefs.sections.whosWorking && canViewHR(currentEmployee) && (
        <WhosWorking theme={theme} />
      )}

      {/* ═══ Row 3: Today's Schedule & Recent Activity ═══ */}
      {(prefs.sections.schedule || prefs.sections.activity) && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(350px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          {/* Today's Schedule */}
          {prefs.sections.schedule && (
            <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                <h2 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Calendar size={20} style={{ color: theme.accent }} />
                  Today's Schedule
                </h2>
                <button
                  onClick={() => navigate('/jobs/calendar')}
                  style={{ padding: '6px 12px', backgroundColor: theme.accentBg, color: theme.accent, border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '500', cursor: 'pointer' }}
                >
                  Calendar
                </button>
              </div>
              {todaysJobs.length === 0 ? (
                <div style={{ padding: '20px', textAlign: 'center', color: theme.textMuted }}>No jobs scheduled for today</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {todaysJobs.slice(0, 5).map(job => (
                    <div
                      key={job.id}
                      onClick={() => navigate(`/jobs/${job.id}`)}
                      style={{ padding: '12px', backgroundColor: theme.bg, borderRadius: '8px', cursor: 'pointer', transition: 'background-color 0.15s ease' }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.bgCardHover}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = theme.bg}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>{job.job_title || job.job_id}</div>
                          <div style={{ fontSize: '12px', color: theme.textMuted }}>{job.customer?.name}</div>
                        </div>
                        <span style={{
                          padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: '500',
                          backgroundColor: job.status === 'Scheduled' ? 'rgba(90,155,213,0.15)' : 'rgba(74,124,89,0.15)',
                          color: job.status === 'Scheduled' ? '#5a9bd5' : '#4a7c59'
                        }}>
                          {job.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Recent Activity */}
          {prefs.sections.activity && (
            <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, padding: '20px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={20} style={{ color: theme.accent }} />
                Recent Activity
              </h2>
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: theme.textMuted, marginBottom: '8px', textTransform: 'uppercase' }}>New Leads</div>
                {recentLeads.slice(0, 3).map(lead => (
                  <div key={lead.id} onClick={() => navigate('/leads')} style={{ padding: '8px 0', borderBottom: `1px solid ${theme.border}`, cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '13px', color: theme.text }}>{lead.customer_name}</span>
                    <span style={{ fontSize: '12px', color: theme.textMuted }}>{formatDate(lead.created_at)}</span>
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontSize: '12px', fontWeight: '600', color: theme.textMuted, marginBottom: '8px', textTransform: 'uppercase' }}>Completed Jobs</div>
                {recentCompletedJobs.slice(0, 3).map(job => (
                  <div key={job.id} onClick={() => navigate(`/jobs/${job.id}`)} style={{ padding: '8px 0', borderBottom: `1px solid ${theme.border}`, cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '13px', color: theme.text }}>{job.job_title || job.job_id}</span>
                    <span style={{ fontSize: '12px', color: theme.textMuted }}>{formatDate(job.updated_at || job.created_at)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ Row 4: Alerts & Warnings ═══ */}
      {prefs.sections.alerts && visibleAlerts.length > 0 && (
        <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, padding: '20px', marginBottom: '24px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={20} style={{ color: '#f4b942' }} />
            Alerts & Warnings
          </h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            {visibleAlerts.map(alertDef => {
              const data = alertData[alertDef.id]
              return (
                <div
                  key={alertDef.id}
                  onClick={() => navigate(data.nav)}
                  style={{
                    padding: '10px 16px', backgroundColor: alertDef.bg, borderRadius: '8px',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px'
                  }}
                >
                  <alertDef.icon size={16} style={{ color: alertDef.color }} />
                  <span style={{ fontSize: '13px', color: alertDef.color, fontWeight: '500' }}>
                    {data.items.length} {alertDef.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ═══ Row 5: Quick Actions ═══ */}
      {prefs.sections.quickActions && (
        <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, padding: '20px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '16px' }}>Quick Actions</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
            <button onClick={handleSync} disabled={syncing} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: isMobile ? '12px 16px' : '12px 20px', backgroundColor: theme.accentBg, color: theme.accent, border: `1px solid ${theme.accent}`, borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: syncing ? 'not-allowed' : 'pointer', opacity: syncing ? 0.6 : 1, flex: isMobile ? '1 1 calc(50% - 6px)' : 'none', justifyContent: 'center', minHeight: '44px' }}>
              <RefreshCw size={18} style={syncing ? { animation: 'spin 1s linear infinite' } : {}} /> {syncing ? 'Syncing…' : 'Sync Bank'}
            </button>
            <button onClick={() => navigate('/leads')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: isMobile ? '12px 16px' : '12px 20px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer', flex: isMobile ? '1 1 calc(50% - 6px)' : 'none', justifyContent: 'center', minHeight: '44px' }}>
              <Plus size={18} /> New Lead
            </button>
            <button onClick={() => navigate('/jobs')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: isMobile ? '12px 16px' : '12px 20px', backgroundColor: theme.accentBg, color: theme.accent, border: `1px solid ${theme.accent}`, borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer', flex: isMobile ? '1 1 calc(50% - 6px)' : 'none', justifyContent: 'center', minHeight: '44px' }}>
              <Plus size={18} /> New Job
            </button>
            <button onClick={() => navigate('/invoices')} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: isMobile ? '12px 16px' : '12px 20px', backgroundColor: theme.accentBg, color: theme.accent, border: `1px solid ${theme.accent}`, borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer', flex: isMobile ? '1 1 calc(50% - 6px)' : 'none', justifyContent: 'center', minHeight: '44px' }}>
              <Plus size={18} /> New Invoice
            </button>
            <button onClick={handleClockToggle} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: isMobile ? '12px 16px' : '12px 20px', backgroundColor: clockedIn ? 'rgba(194,90,90,0.1)' : 'rgba(74,124,89,0.15)', color: clockedIn ? '#c25a5a' : '#4a7c59', border: `1px solid ${clockedIn ? '#c25a5a' : '#4a7c59'}`, borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer', flex: isMobile ? '1 1 calc(50% - 6px)' : 'none', justifyContent: 'center', minHeight: '44px' }}>
              <Clock size={18} /> {clockedIn ? 'Clock Out' : 'Clock In'}
            </button>
          </div>
        </div>
      )}

      {/* ═══ Metric drill-down — the records behind a clicked number ═══ */}
      {drill && (
        <div onClick={() => setDrill(null)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)', zIndex: 1100, display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: isMobile ? '0' : '40px 16px' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ backgroundColor: theme.bgCard, borderRadius: isMobile ? 0 : 12, width: isMobile ? '100%' : 'min(560px, 100%)', maxHeight: isMobile ? '100%' : '80vh', height: isMobile ? '100%' : 'auto', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${theme.border}` }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: theme.text }}>{drill.title}</div>
                <div style={{ fontSize: 13, color: theme.textMuted }}>{drill.items.length} item{drill.items.length !== 1 ? 's' : ''}{drill.total ? ` · ${drill.total} total` : ''}</div>
              </div>
              <button onClick={() => setDrill(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, padding: 4, flexShrink: 0 }}><X size={20} /></button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {drill.items.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: theme.textMuted }}>No records.</div>
              ) : drill.items.map((it, idx) => (
                <div key={idx} onClick={() => { if (it.nav) { setDrill(null); navigate(it.nav) } }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 20px', borderBottom: `1px solid ${theme.border}`, cursor: it.nav ? 'pointer' : 'default' }}
                  onMouseEnter={(e) => { if (it.nav) e.currentTarget.style.backgroundColor = theme.bgCardHover }}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.primary}</div>
                    {it.secondary && <div style={{ fontSize: 12, color: theme.textMuted }}>{it.secondary}</div>}
                  </div>
                  {it.amount && <div style={{ fontSize: 14, fontWeight: 600, color: theme.text, flexShrink: 0 }}>{it.amount}</div>}
                </div>
              ))}
            </div>
            {drill.page && (
              <div style={{ padding: '12px 20px', borderTop: `1px solid ${theme.border}` }}>
                <button onClick={() => { setDrill(null); navigate(drill.page) }} style={{ width: '100%', padding: '10px', backgroundColor: theme.accentBg, color: theme.accent, border: `1px solid ${theme.accent}`, borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', minHeight: 44 }}>
                  Open full page
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
