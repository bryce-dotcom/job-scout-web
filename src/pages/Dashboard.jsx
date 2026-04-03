import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { useIsMobile } from '../hooks/useIsMobile'
import { supabase } from '../lib/supabase'
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
  Truck,
  ChevronRight,
  Plus,
  CreditCard,
  Settings,
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
  { id: 'mtdSalesWon', label: 'MTD Jobs Won', icon: TrendingUp, color: '#16a34a', nav: '/jobs', hint: 'Total value of completed jobs this month (from job_total). Same number as Pipeline Jobs Won when set to MTD.' },
  { id: 'activeLeads', label: 'Active Leads', icon: UserPlus, color: null, nav: '/leads', hint: 'Leads currently in the pipeline (not Won, Lost, or Closed). These are prospects being worked.' },
  { id: 'openJobs', label: 'Open Jobs', icon: Briefcase, color: null, nav: '/jobs', hint: 'Jobs that are Scheduled, In Progress, or Chillin. Does not include Completed or Archived.' },
  { id: 'pendingInvoices', label: 'Pending Invoices', icon: Receipt, color: null, nav: '/invoices', hint: 'Invoices sent but not yet paid. The dollar amount is what customers owe you (accounts receivable).' },
  { id: 'mtdRevenue', label: 'MTD Revenue', icon: DollarSign, color: '#4a7c59', nav: null, hint: 'Cash received this month = Paid Invoices (from Invoices page) + Deposits (from Lead Payments page) + Bank Deposits (from Plaid/Books) + Collected Incentives. This is actual money in, not estimates.' },
  { id: 'mtdDeposits', label: 'MTD Deposits', icon: TrendingUp, color: '#4a7c59', nav: '/lead-payments', hint: 'Lead and job deposits collected this month within JobScout. These are pre-job payments logged in the system.' },
  { id: 'mtdExpenses', label: 'MTD Expenses', icon: CreditCard, color: '#c25a5a', nav: '/expenses', hint: 'Money spent this month: manually logged expenses + bank outflows from Plaid. Does not include transfers between accounts.' },
  { id: 'completedJobs', label: 'Completed Jobs (MTD)', icon: Briefcase, color: '#10b981', nav: '/jobs', hint: 'Number of jobs marked Completed this month. YTD shows the full year count.' },
  { id: 'totalLeads', label: 'Total Leads', icon: UserPlus, color: '#8b5cf6', nav: '/leads', hint: 'All leads in the system across all statuses including Closed.' },
  { id: 'netIncome', label: 'MTD Net Income', icon: DollarSign, color: '#16a34a', nav: null, hint: 'Revenue minus expenses this month. Positive = profit, negative = loss. Based on actual cash flow, not estimates.' },
  { id: 'avgJobValue', label: 'Avg Job Value', icon: DollarSign, color: '#3b82f6', nav: null, hint: 'Average dollar amount per completed job across all time. Calculated from job totals.' },
  { id: 'conversionRate', label: 'Win Rate', icon: TrendingUp, color: '#10b981', nav: '/pipeline', hint: 'Percentage of decided leads (Won + Lost) that were Won. Higher is better.' },
]

// Alert type definitions
const ALERT_DEFS = [
  { id: 'lowStock', label: 'Low Stock Items', icon: Package, color: '#c25a5a', bg: 'rgba(194,90,90,0.1)' },
  { id: 'fleetPM', label: 'Fleet PM Overdue', icon: Truck, color: '#d4940a', bg: 'rgba(244,185,66,0.15)' },
  { id: 'overdueInvoices', label: 'Overdue Invoices (30+ days)', icon: Receipt, color: '#c25a5a', bg: 'rgba(194,90,90,0.1)' },
  { id: 'todaysAppts', label: 'Today\'s Appointments', icon: Calendar, color: '#5a9bd5', bg: 'rgba(90,155,213,0.15)' },
]

// Default preferences
const DEFAULT_PREFS = {
  metrics: ['mtdSalesWon', 'activeLeads', 'openJobs', 'pendingInvoices', 'mtdRevenue', 'mtdDeposits', 'mtdExpenses'],
  pipelineDisplay: 'count', // 'count' | 'dollars' | 'both'
  rollingDays: 90,
  showRolling: true,
  sections: { pipeline: true, schedule: true, activity: true, alerts: true, quickActions: true },
  alerts: { lowStock: true, fleetPM: true, overdueInvoices: true, todaysAppts: true },
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

  const currentEmployee = employees.find(e => e.email === user?.email)

  const [clockedIn, setClockedIn] = useState(false)
  const [activeTimeLog, setActiveTimeLog] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [prefs, setPrefs] = useState(loadPrefs)
  const settingsRef = useRef(null)

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
      await supabase.from('time_clock').update({ clock_out: new Date().toISOString() }).eq('id', activeTimeLog.id)
      setClockedIn(false); setActiveTimeLog(null)
    } else {
      const { data } = await supabase.from('time_clock').insert({ company_id: companyId, employee_id: currentEmployee?.id, clock_in: new Date().toISOString() }).select().single()
      if (data) { setClockedIn(true); setActiveTimeLog(data) }
    }
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
  const accountsReceivable = unpaidInvoices.reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0)

  const isThisMonth = (dateStr) => dateStr && new Date(dateStr) >= firstOfMonth
  // Revenue: match Books.jsx formula (paid invoices + deposits + Plaid bank deposits + collected incentives)
  const paidInvoicesMTD = (invoices || []).filter(inv => inv.payment_status === 'Paid' && isThisMonth(inv.created_at)).reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0)
  const thisMonthDeposits = (leadPayments || []).filter(d => isThisMonth(d.date_created || d.created_at)).reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0)
  const plaidInMTD = (plaidTransactions || []).filter(t => t.amount < 0 && isThisMonth(t.date) && !t.is_transfer).reduce((sum, t) => sum + Math.abs(parseFloat(t.amount) || 0), 0)
  const collectedIncentiveMTD = (utilityInvoices || []).filter(i => i.payment_status === 'Paid' && isThisMonth(i.updated_at || i.created_at)).reduce((sum, i) => sum + (parseFloat(i.amount || i.incentive_amount) || 0), 0)
  const thisMonthRevenue = paidInvoicesMTD + thisMonthDeposits + plaidInMTD + collectedIncentiveMTD
  // Expenses: manual expenses + Plaid outflows (match Books.jsx)
  const manualExpensesMTD = (expenses || []).filter(e => e.date && isThisMonth(e.date)).reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0)
  const plaidOutMTD = (plaidTransactions || []).filter(t => t.amount > 0 && isThisMonth(t.date) && !t.is_transfer).reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0)
  const thisMonthExpenses = manualExpensesMTD + plaidOutMTD

  const wonOrDeliveryStatuses = ['Won', 'Job Scheduled', 'In Progress', 'Job Complete', 'Invoiced', 'Closed']
  // Sales Won = completed jobs value (every completed job is a win)
  // Uses job start_date for date filtering (most reliable date from HCP)
  const mtdCompletedJobsForSales = jobs.filter(j => {
    if (j.status !== 'Completed') return false
    const jobDate = j.start_date || j.updated_at
    return jobDate && new Date(jobDate) >= firstOfMonth
  })
  const mtdSalesWon = mtdCompletedJobsForSales.reduce((sum, j) => sum + (parseFloat(j.job_total) || 0), 0)
  const mtdWonLeads = { length: mtdCompletedJobsForSales.length }

  // Extra metrics
  const completedJobsMTD = jobs.filter(j => j.status === 'Completed' && j.updated_at && new Date(j.updated_at) >= firstOfMonth).length
  const totalLeadsCount = leads.length
  const netIncome = thisMonthRevenue - thisMonthExpenses
  const completedJobsAll = jobs.filter(j => j.status === 'Completed')
  const avgJobValue = completedJobsAll.length > 0
    ? completedJobsAll.reduce((sum, j) => sum + (parseFloat(j.job_total) || 0), 0) / completedJobsAll.length
    : 0
  const wonLeads = leads.filter(l => wonOrDeliveryStatuses.includes(l.status)).length
  const decidedLeads = leads.filter(l => [...wonOrDeliveryStatuses, 'Lost'].includes(l.status)).length
  const conversionRate = decidedLeads > 0 ? Math.round((wonLeads / decidedLeads) * 100) : 0

  // ── YTD calculations ──
  const firstOfYear = new Date(today.getFullYear(), 0, 1)
  const isThisYear = (dateStr) => dateStr && new Date(dateStr) >= firstOfYear

  const paidInvoicesYTD = (invoices || []).filter(inv => inv.payment_status === 'Paid' && isThisYear(inv.created_at)).reduce((sum, i) => sum + (parseFloat(i.amount) || 0), 0)
  const depositsYTD = (leadPayments || []).filter(d => isThisYear(d.date_created || d.created_at)).reduce((sum, d) => sum + (parseFloat(d.amount) || 0), 0)
  const plaidInYTD = (plaidTransactions || []).filter(t => t.amount < 0 && isThisYear(t.date) && !t.is_transfer).reduce((sum, t) => sum + Math.abs(parseFloat(t.amount) || 0), 0)
  const collectedIncentiveYTD = (utilityInvoices || []).filter(i => i.payment_status === 'Paid' && isThisYear(i.updated_at || i.created_at)).reduce((sum, i) => sum + (parseFloat(i.amount || i.incentive_amount) || 0), 0)
  const ytdRevenue = paidInvoicesYTD + depositsYTD + plaidInYTD + collectedIncentiveYTD

  const manualExpensesYTD = (expenses || []).filter(e => e.date && isThisYear(e.date)).reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0)
  const plaidOutYTD = (plaidTransactions || []).filter(t => t.amount > 0 && isThisYear(t.date) && !t.is_transfer).reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0)
  const ytdExpenses = manualExpensesYTD + plaidOutYTD
  const ytdNetIncome = ytdRevenue - ytdExpenses

  // YTD Sales Won = completed jobs this year (same logic as MTD)
  const ytdCompletedJobsForSales = jobs.filter(j => {
    if (j.status !== 'Completed') return false
    const jobDate = j.start_date || j.updated_at
    return jobDate && new Date(jobDate) >= firstOfYear
  })
  const ytdSalesWon = ytdCompletedJobsForSales.reduce((sum, j) => sum + (parseFloat(j.job_total) || 0), 0)

  const ytdDeposits = depositsYTD
  const completedJobsYTD = ytdCompletedJobsForSales.length

  // ── Build revenue/expense breakdown descriptions ──
  const revenueParts = []
  if (paidInvoicesMTD > 0) revenueParts.push(`${formatCurrency(paidInvoicesMTD)} invoices`)
  if (thisMonthDeposits > 0) revenueParts.push(`${formatCurrency(thisMonthDeposits)} deposits`)
  if (plaidInMTD > 0) revenueParts.push(`${formatCurrency(plaidInMTD)} bank`)
  if (collectedIncentiveMTD > 0) revenueParts.push(`${formatCurrency(collectedIncentiveMTD)} incentives`)
  const revenueSubtitle = revenueParts.length > 0 ? revenueParts.join(' + ') : 'No revenue this month'

  const expenseParts = []
  if (manualExpensesMTD > 0) expenseParts.push(`${formatCurrency(manualExpensesMTD)} manual`)
  if (plaidOutMTD > 0) expenseParts.push(`${formatCurrency(plaidOutMTD)} bank`)
  const expenseSubtitle = expenseParts.length > 0 ? expenseParts.join(' + ') : 'No expenses this month'

  // Metric values map — subtitles explain exactly where each number comes from
  const metricValues = {
    mtdSalesWon: { value: formatCurrency(mtdSalesWon), subtitle: `${mtdWonLeads.length} completed job${mtdWonLeads.length !== 1 ? 's' : ''} (from Jobs)`, ytdValue: formatCurrency(ytdSalesWon), ytdLabel: 'YTD Jobs Won' },
    activeLeads: { value: activeLeads, subtitle: 'Leads in pipeline (not Won/Lost)' },
    openJobs: { value: openJobs, subtitle: 'Scheduled + In Progress + Chillin' },
    pendingInvoices: { value: pendingInvoices, subtitle: `${formatCurrency(accountsReceivable)} owed (from Invoices)` },
    mtdRevenue: { value: formatCurrency(thisMonthRevenue), subtitle: revenueSubtitle || 'Paid invoices + deposits + bank', ytdValue: formatCurrency(ytdRevenue), ytdLabel: 'YTD Revenue' },
    mtdDeposits: { value: formatCurrency(thisMonthDeposits), subtitle: 'From Lead Payments page', ytdValue: formatCurrency(ytdDeposits), ytdLabel: 'YTD Deposits' },
    mtdExpenses: { value: formatCurrency(thisMonthExpenses), subtitle: expenseSubtitle || 'Manual expenses + bank outflows', ytdValue: formatCurrency(ytdExpenses), ytdLabel: 'YTD Expenses' },
    completedJobs: { value: completedJobsMTD, subtitle: 'From Job Board (Completed status)', ytdValue: completedJobsYTD, ytdLabel: 'YTD Completed' },
    totalLeads: { value: totalLeadsCount, subtitle: 'All leads in pipeline' },
    netIncome: { value: formatCurrency(netIncome), subtitle: 'Revenue - Expenses (cash basis)', ytdValue: formatCurrency(ytdNetIncome), ytdLabel: 'YTD Net Income' },
    avgJobValue: { value: formatCurrency(avgJobValue), subtitle: `Across ${completedJobsAll.length} completed jobs` },
    conversionRate: { value: `${conversionRate}%`, subtitle: `${wonLeads} won / ${decidedLeads} decided` },
  }

  // Pipeline
  // Quote amounts by lead (for pipeline mini-chart)
  const quoteByLead = {}
  ;(quotes || []).forEach(q => {
    const amt = parseFloat(q.quote_amount) || 0
    if (q.lead_id && amt > (quoteByLead[q.lead_id] || 0)) quoteByLead[q.lead_id] = amt
  })

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

  // Rolling average — based on completed jobs
  const rollingCutoff = new Date(today.getTime() - prefs.rollingDays * 24 * 60 * 60 * 1000)
  const rollingCompletedJobs = jobs.filter(j => {
    if (j.status !== 'Completed') return false
    const jobDate = j.start_date || j.updated_at
    return jobDate && new Date(jobDate) >= rollingCutoff
  })
  const rollingWonTotal = rollingCompletedJobs.reduce((sum, j) => sum + (parseFloat(j.job_total) || 0), 0)
  const rollingWonCount = rollingCompletedJobs.length
  const rollingAvgPerMonth = prefs.rollingDays > 0 ? (rollingWonTotal / prefs.rollingDays) * 30 : 0

  // Today's jobs
  const todaysJobs = jobs.filter(j => j.start_date?.startsWith(todayStr))

  // Recent activity
  const recentLeads = [...leads].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 5)
  const recentCompletedJobs = jobs.filter(j => j.status === 'Completed').sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)).slice(0, 5)

  // Alerts
  const alertData = {
    lowStock: { items: inventory.filter(i => i.quantity < (i.min_quantity || 10)), nav: '/inventory' },
    fleetPM: { items: fleet.filter(f => f.next_pm_due && new Date(f.next_pm_due) < today), nav: '/fleet' },
    overdueInvoices: { items: invoices.filter(i => { if (i.payment_status !== 'Pending') return false; return Math.floor((today - new Date(i.created_at)) / 86400000) > 30 }), nav: '/invoices' },
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
                onClick={def.nav ? () => navigate(def.nav) : undefined}
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
              <div>
                <div style={{ fontSize: '12px', color: theme.textMuted, fontWeight: '500', marginBottom: '2px' }}>
                  {prefs.rollingDays}-Day Rolling Avg
                </div>
                <div style={{ fontSize: isMobile ? '20px' : '22px', fontWeight: '700', color: '#16a34a' }}>
                  {formatCurrency(rollingAvgPerMonth)}<span style={{ fontSize: '13px', fontWeight: '400', color: theme.textMuted }}>/mo</span>
                </div>
              </div>
              <div style={{ borderLeft: isMobile ? 'none' : `1px solid ${theme.border}`, paddingLeft: isMobile ? 0 : '16px', borderTop: isMobile ? `1px solid ${theme.border}` : 'none', paddingTop: isMobile ? '12px' : 0, width: isMobile ? '100%' : 'auto' }}>
                <div style={{ fontSize: '12px', color: theme.textMuted, fontWeight: '500', marginBottom: '2px' }}>
                  Won Deals ({prefs.rollingDays}d)
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
    </div>
  )
}
