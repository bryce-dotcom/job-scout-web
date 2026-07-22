import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { useIsMobile } from '../hooks/useIsMobile'
import { DollarSign, TrendingUp, Clock, Calendar, CheckCircle, AlertCircle, ChevronLeft, ChevronRight, ChevronDown, Zap, Eye, FileText, Shield, Umbrella } from 'lucide-react'
import {
  getCurrentPayPeriod,
  calculateInvoiceCommissions,
  PERIODS_PER_YEAR,
} from '../lib/bonusCalc'
import { fetchUserBonuses, bonusStatusLabel } from '../lib/bonusLedger'
import { fetchRepCommissions, earnedRepInPeriod, liveInvoiceAvailable } from '../lib/repCommissions'
import { canViewHR } from '../lib/accessControl'

const money = (n) => '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const BENEFIT_LABELS = { health: 'Health', dental: 'Dental', vision: 'Vision', life: 'Life', disability: 'Disability', retirement_401k: '401(k)', hsa: 'HSA', fsa: 'FSA', other: 'Other' }
const FREQ_LABELS = { per_paycheck: 'Per paycheck', monthly: 'Monthly', annual: 'Annual' }

// Reusable collapsible "pulldown" card so My Pay can carry pay history,
// benefits, etc. without turning into an endless scroll. Collapsed by default.
function CollapsibleCard({ cardStyle, theme, icon, title, summary, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={cardStyle}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        style={{ width: '100%', background: 'none', border: 'none', padding: 0, margin: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, textAlign: 'left' }}
      >
        <span style={{ fontSize: '15px', fontWeight: 700, color: theme.text, display: 'flex', alignItems: 'center', gap: 8 }}>
          {icon}{title}
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {summary != null && <span style={{ fontSize: 12, color: theme.textMuted, fontWeight: 600 }}>{summary}</span>}
          <ChevronDown size={18} style={{ color: theme.textMuted, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
        </span>
      </button>
      {open && <div style={{ marginTop: 14 }}>{children}</div>}
    </div>
  )
}

// One past paycheck, expandable to its full gross → net breakdown. Reads the
// paystubs row saved when a payroll run was finalized.
function PaystubRow({ p, theme }) {
  const [open, setOpen] = useState(false)
  const d = (s) => s ? new Date(s + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
  const tax = (Number(p.federal_income_tax) || 0) + (Number(p.state_income_tax) || 0) + (Number(p.social_security_employee) || 0) + (Number(p.medicare_employee) || 0) + (Number(p.additional_medicare) || 0)
  const ded = (Number(p.pre_tax_deductions) || 0) + (Number(p.post_tax_deductions) || 0)
  const line = (label, val, opts = {}) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0' }}>
      <span style={{ color: theme.textMuted }}>{label}</span>
      <span style={{ color: opts.color || theme.text, fontVariantNumeric: 'tabular-nums' }}>{opts.neg ? '−' : ''}{money(Math.abs(Number(val) || 0))}</span>
    </div>
  )
  return (
    <div style={{ backgroundColor: theme.bg, borderRadius: 8, overflow: 'hidden' }}>
      <button onClick={() => setOpen(o => !o)} aria-expanded={open}
        style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, textAlign: 'left' }}>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: theme.text }}>{d(p.pay_date)}</span>
          <span style={{ display: 'block', fontSize: 11, color: theme.textMuted }}>{d(p.period_start)} – {d(p.period_end)}</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, whiteSpace: 'nowrap' }}>
          <span style={{ textAlign: 'right' }}>
            <span style={{ display: 'block', fontSize: 14, fontWeight: 700, color: theme.text, fontVariantNumeric: 'tabular-nums' }}>{money(p.net_pay)}</span>
            <span style={{ display: 'block', fontSize: 10, color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.4px' }}>net</span>
          </span>
          <ChevronDown size={16} style={{ color: theme.textMuted, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
        </span>
      </button>
      {open && (
        <div style={{ padding: '2px 12px 12px', borderTop: `1px solid ${theme.border}` }}>
          {line('Gross pay', p.gross_pay)}
          {Number(p.commission_pay) > 0 && line('Commission', p.commission_pay)}
          {Number(p.bonus_pay) > 0 && line('Bonus', p.bonus_pay)}
          {Number(p.reimbursement_pay) > 0 && line('Reimbursement', p.reimbursement_pay)}
          {tax > 0 && line('Taxes withheld', tax, { neg: true, color: '#ef4444' })}
          {ded > 0 && line('Deductions', ded, { neg: true, color: '#ef4444' })}
          <div style={{ borderTop: `1px dashed ${theme.border}`, marginTop: 6, paddingTop: 6 }}>
            {line('Net pay', p.net_pay, { color: theme.accent })}
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * MyPay — self-service pay view for every employee.
 *
 * Anyone can land here and see their OWN commissions, hours, and PTO
 * without HR access. Designed primarily for sales reps who need to
 * track:
 *  - Commissions earned this pay period
 *  - "Won jobs" where the customer hasn't paid yet (so no commission
 *    has hit their paycheck yet)
 *  - Basic hours summary for hourly/salary employees
 *
 * This complements /payroll (which is the full-roster admin view).
 */
export default function MyPay() {
  const { theme } = useTheme()
  const isMobile = useIsMobile()
  const companyId = useStore((state) => state.companyId)
  const user = useStore((state) => state.user)

  const [payrollConfig, setPayrollConfig] = useState({
    pay_frequency: 'bi-weekly',
    pay_day_1: '20',
    pay_day_2: '5',
    pay_anchor_date: '',
    commission_trigger: 'payment_received',
  })
  const [jobs, setJobs] = useState([])
  const [leads, setLeads] = useState([])
  const [invoices, setInvoices] = useState([])
  const [payments, setPayments] = useState([])
  // ALL payments (not period-filtered) — needed to compute lifetime paid
  // per invoice for the pending bucket and for the paid-threshold bonus
  // gate. Scoped to company.
  const [allPayments, setAllPayments] = useState([])
  const [timeEntries, setTimeEntries] = useState([])
  const [utilityInvoices, setUtilityInvoices] = useState([])
  const [myPtoRequests, setMyPtoRequests] = useState([])
  // Persistent efficiency-bonus ledger (job_bonuses) — what the tech has
  // EARNED and is OWED, independent of the pay period. This is the source of
  // truth so a bonus never vanishes when hours are corrected or the period
  // rolls over. Payroll keeps it fresh; MyPay only reads it.
  const [ledgerBonuses, setLedgerBonuses] = useState([])
  // Self-service HR data — not period-scoped. Pay history is every past
  // paycheck (paystubs); benefits are the employee's active enrollments
  // (employee_benefits). Both are READ-ONLY here.
  const [paystubs, setPaystubs] = useState([])
  const [benefits, setBenefits] = useState([])
  // Frozen rep (%) commissions (rep_commissions) for this employee — read-only
  // here; Payroll is the writer. Replaces the drifty live invoice-commission
  // amount so My Pay and Payroll always agree.
  const [repCommissions, setRepCommissions] = useState([])
  const [loading, setLoading] = useState(true)
  // Fresh copy of the user's employee row (rate, commission flags) re-read
  // from DB on every mount so a just-updated rate shows here immediately
  // instead of waiting for the next full login.
  const [empRow, setEmpRow] = useState(null)
  // 0 = current period, -1 = previous, -2 = two back, etc.
  // Lets a rep look at a past pay period to see commissions that have
  // already been paid out (or would have been). Payroll admin page has
  // the same control; MyPay was missing it so reps could only ever see
  // the current period.
  const [periodOffset, setPeriodOffset] = useState(0)

  // Admin "View as" — Bryce/Doug can audit what each rep sees on their
  // MyPay without logging in as them. Gated by canViewHR (the same flag
  // that controls full Payroll access). Defaults to the logged-in user
  // so reps see themselves automatically.
  const isHRAdmin = canViewHR(user)
  const [viewAsEmployeeId, setViewAsEmployeeId] = useState(user?.id || null)
  const [allEmployees, setAllEmployees] = useState([])
  const effectiveUserId = viewAsEmployeeId || user?.id
  const isImpersonating = effectiveUserId && effectiveUserId !== user?.id

  // When the logged-in user changes (rare — page reload), reset the
  // impersonation pointer to themselves.
  useEffect(() => { setViewAsEmployeeId(user?.id || null) }, [user?.id])

  // Load active employees for the View-as dropdown (admin only)
  useEffect(() => {
    if (!isHRAdmin || !companyId) return
    ;(async () => {
      const { data } = await supabase.from('employees')
        .select('id, name, email, role, is_commission, commission_processor_rate')
        .eq('company_id', companyId).eq('active', true).order('name')
      setAllEmployees(data || [])
    })()
  }, [isHRAdmin, companyId])

  // Read the persistent bonus ledger for this employee. Not period-scoped —
  // shows everything owed until it's marked paid out.
  useEffect(() => {
    if (!companyId || !effectiveUserId) { setLedgerBonuses([]); return }
    let cancelled = false
    ;(async () => {
      const rows = await fetchUserBonuses(supabase, companyId, effectiveUserId)
      if (!cancelled) setLedgerBonuses(rows)
    })()
    return () => { cancelled = true }
  }, [companyId, effectiveUserId])

  // Pay history + benefits — not period-scoped, so loaded on their own (small,
  // additive; never touches the commission/bonus math above).
  useEffect(() => {
    if (!companyId || !effectiveUserId) { setPaystubs([]); setBenefits([]); return }
    let cancelled = false
    ;(async () => {
      const [ps, bf, rc] = await Promise.all([
        supabase.from('paystubs')
          .select('id, period_start, period_end, pay_date, regular_hours, overtime_hours, pto_hours, gross_pay, net_pay, bonus_pay, commission_pay, reimbursement_pay, federal_income_tax, state_income_tax, social_security_employee, medicare_employee, additional_medicare, pre_tax_deductions, post_tax_deductions')
          .eq('company_id', companyId).eq('employee_id', effectiveUserId)
          .order('pay_date', { ascending: false }).limit(24),
        supabase.from('employee_benefits')
          .select('id, benefit_type, plan_name, employee_contribution, employer_contribution, is_pre_tax, frequency, status')
          .eq('company_id', companyId).eq('employee_id', effectiveUserId).eq('status', 'active')
          .order('benefit_type'),
        fetchRepCommissions(supabase, companyId, effectiveUserId),
      ])
      if (!cancelled) { setPaystubs(ps.data || []); setBenefits(bf.data || []); setRepCommissions(rc || []) }
    })()
    return () => { cancelled = true }
  }, [companyId, effectiveUserId])

  useEffect(() => {
    if (!companyId || !effectiveUserId) return
    ;(async () => {
      setLoading(true)
      try {
        // Fetch payroll config first so period math is right
        const { data: cfgRow } = await supabase
          .from('settings')
          .select('value')
          .eq('company_id', companyId)
          .eq('key', 'payroll_config')
          .maybeSingle()
        let cfg = payrollConfig
        if (cfgRow?.value) {
          try {
            const parsed = JSON.parse(cfgRow.value)
            cfg = { ...payrollConfig, ...parsed }
            setPayrollConfig(cfg)
          } catch { /* keep defaults on malformed config */ }
        }

        const { periodStart, periodEnd } = getCurrentPayPeriod(cfg, periodOffset)
        const periodStartStr = periodStart.toISOString().split('T')[0]
        const periodEndStr = periodEnd.toISOString().split('T')[0]

        // Leads owned by this rep (explicit or via salesperson_ids array).
        // Needed because most ownership lives on leads, not jobs.
        const leadsPromise = supabase
          .from('leads')
          .select('id, salesperson_id, salesperson_ids')
          .eq('company_id', companyId)
          .or(`salesperson_id.eq.${effectiveUserId},salesperson_ids.cs.{${effectiveUserId}}`)

        // All jobs — we need any job owned directly by the user OR linked
        // to one of their leads. Paginate because HHH has >6k jobs.
        const fetchAllJobs = async () => {
          const all = []
          const pageSize = 1000
          for (let from = 0; ; from += pageSize) {
            const { data, error } = await supabase
              .from('jobs')
              .select('id, job_id, salesperson_id, lead_id, status, customer_name, job_title, invoice_status, allotted_time_hours')
              .eq('company_id', companyId)
              .or('salesperson_id.not.is.null,lead_id.not.is.null')
              .range(from, from + pageSize - 1)
            if (error) return { data: null, error }
            all.push(...(data || []))
            if (!data || data.length < pageSize) break
          }
          return { data: all, error: null }
        }
        const jobsPromise = fetchAllJobs()

        // Invoices — fetch all company invoices so we can match against any
        // job owned directly or via a lead. HHH has >5k invoices so the
        // default 1000-row cap silently drops most of them; paginate with
        // .range() until exhausted.
        const fetchAllInvoices = async () => {
          const all = []
          const pageSize = 1000
          for (let from = 0; ; from += pageSize) {
            const { data, error } = await supabase
              .from('invoices')
              .select('id, invoice_id, job_id, amount, payment_status, created_at, updated_at, job_description, invoice_type')
              .eq('company_id', companyId)
              // unpaid (need pending bucket) OR touched in period (for the
              // synthetic-payment fallback — Paid invoices with no payment
              // row but updated_at in period count as paid in period)
              .or(`payment_status.neq.Paid,updated_at.gte.${periodStartStr}`)
              .range(from, from + pageSize - 1)
            if (error) return { data: null, error }
            all.push(...(data || []))
            if (!data || data.length < pageSize) break
          }
          return { data: all, error: null }
        }
        const invoicesPromise = fetchAllInvoices()

        // Payments in current period — used to compute earned-this-period
        const paymentsPromise = supabase
          .from('payments')
          .select('id, invoice_id, amount, date')
          .eq('company_id', companyId)
          .gte('date', periodStartStr)
          .lte('date', periodEndStr)

        // Own time entries in period (for hourly pay + bonus crew share)
        const timePromise = supabase
          .from('time_clock')
          .select('id, job_id, employee_id, clock_in, clock_out, total_hours')
          .eq('company_id', companyId)
          .eq('employee_id', effectiveUserId)
          .gte('clock_in', periodStart.toISOString())
          .lte('clock_in', periodEnd.toISOString())
          .not('clock_out', 'is', null)

        // All payments (lifetime, scoped by company) — needed to compute
        // proper paid-threshold bonus gate and lifetime-paid bucket for
        // pending commission math.
        const fetchAllPayments = async () => {
          const all = []
          const pageSize = 1000
          for (let from = 0; ; from += pageSize) {
            const { data, error } = await supabase
              .from('payments')
              .select('invoice_id, amount')
              .eq('company_id', companyId)
              .range(from, from + pageSize - 1)
            if (error) return { data: null, error }
            all.push(...(data || []))
            if (!data || data.length < pageSize) break
          }
          return { data: all, error: null }
        }
        const allPaymentsPromise = fetchAllPayments()

        // Re-fetch my own employee row — pulls processor fields too so
        // Alayda-style roles show their processor commissions here.
        const empPromise = supabase
          .from('employees')
          .select('id, name, email, is_commission, commission_services_rate, commission_services_type, commission_goods_rate, commission_goods_type, commission_processor_rate, commission_processor_type, is_hourly, is_salary, hourly_rate, annual_salary')
          .eq('id', effectiveUserId).maybeSingle()

        // Utility invoices on jobs the user might own — we fetch them all
        // and filter client-side via the shared calc's ownership lookup.
        const utilPromise = supabase
          .from('utility_invoices')
          .select('id, utility_invoice_id, job_id, customer_name, utility_name, amount, incentive_amount, project_cost, net_cost, payment_status, paid_at, created_at')
          .eq('company_id', companyId)

        // User's own time-off requests (Alayda asked "How can I see
        // requests for time off?" — give every employee a self-view).
        const ptoPromise = supabase
          .from('time_off_requests')
          .select('id, start_date, end_date, request_type, status, reason, created_at, approved_at')
          .eq('company_id', companyId)
          .eq('employee_id', effectiveUserId)
          .order('created_at', { ascending: false })
          .limit(20)

        const [jr, lr, ir, pr, tr, er, ur, apr, ptr] = await Promise.all([
          jobsPromise, leadsPromise, invoicesPromise, paymentsPromise,
          timePromise, empPromise, utilPromise,
          allPaymentsPromise, ptoPromise,
        ])
        setJobs(jr.data || [])
        setLeads(lr.data || [])
        setInvoices(ir.data || [])
        setPayments(pr.data || [])
        setTimeEntries(tr.data || [])
        setEmpRow(er?.data || null)
        setUtilityInvoices(ur?.data || [])
        setAllPayments(apr?.data || [])
        setMyPtoRequests(ptr?.data || [])
      } finally {
        setLoading(false)
      }
    })()
    // periodOffset in deps so changing the period refetches in-period payments
  }, [companyId, effectiveUserId, periodOffset])

  const { periodStart, periodEnd } = getCurrentPayPeriod(payrollConfig, periodOffset)
  const periodStartStr = periodStart.toISOString().split('T')[0]
  const periodEndStr = periodEnd.toISOString().split('T')[0]

  // Build a Map<invoice_id, lifetimePaid> once — feeds both the
  // calculateInvoiceCommissions pending bucket and the paid-threshold
  // bonus gate below.
  const allPaymentsByInvoiceId = useMemo(() => {
    const m = new Map()
    ;(allPayments || []).forEach(p => {
      if (!p.invoice_id) return
      m.set(p.invoice_id, (m.get(p.invoice_id) || 0) + (parseFloat(p.amount) || 0))
    })
    return m
  }, [allPayments])

  const commData = useMemo(() => {
    if (!effectiveUserId) return { available: 0, pending: 0, details: [] }
    const me = empRow || user
    return calculateInvoiceCommissions({
      employee: me,
      jobs,
      leads,
      invoices,
      inPeriodPayments: payments,
      allPaymentsByInvoiceId,
      utilityInvoices,
      payrollConfig,
      periodStartStr,
      periodEndStr,
    })
  }, [effectiveUserId, empRow, jobs, leads, invoices, payments, allPaymentsByInvoiceId, utilityInvoices, payrollConfig, periodStartStr, periodEndStr])

  // Swap the invoice-commission (services/goods) portion of `available` for the
  // FROZEN rep_commissions ledger — same number today, but it stops drifting
  // and now matches Payroll exactly. Utility/processor + pending stay live.
  // All rep commissions (invoice + utility + processor) are frozen rows now, so
  // the whole available comes from the ledger — no live component. (Pending is
  // still projected live below via commData.pending.)
  const commAvailable = useMemo(
    () => earnedRepInPeriod(repCommissions, effectiveUserId, periodStartStr, periodEndStr),
    [repCommissions, effectiveUserId, periodStartStr, periodEndStr]
  )

  // Efficiency bonuses now come from the persistent job_bonuses ledger
  // (loaded into ledgerBonuses above), not a live per-period recompute —
  // that's what stopped bonuses from vanishing across pay periods.

  const totalHours = timeEntries.reduce((s, e) => {
    let h = e.total_hours
    if (!h && e.clock_in && e.clock_out) h = (new Date(e.clock_out) - new Date(e.clock_in)) / 36e5
    return s + (h || 0)
  }, 0)

  // Calculate expected hourly/salary pay (own-view only, no HR access needed)
  const periodsPerYear = PERIODS_PER_YEAR[payrollConfig.pay_frequency] || 26
  const me = empRow || user || {}
  const hourlyPay = (me.is_hourly && me.hourly_rate) ? totalHours * parseFloat(me.hourly_rate) : 0
  const salaryPay = (me.is_salary && me.annual_salary) ? parseFloat(me.annual_salary) / periodsPerYear : 0
  // ── Bonus ledger groupings (persistent, not period-scoped) ───────────
  // accrued = money came in, OWED now (counts toward this paycheck's gross).
  // pending = earned by saved hours but the job's money hasn't landed yet.
  // paid    = already paid out — kept visible with the date, per Bryce's ask
  //           for "an indicator of when it gets paid."
  const accruedBonuses = ledgerBonuses.filter(b => b.status === 'accrued')
  const pendingBonuses = ledgerBonuses.filter(b => b.status === 'pending')
  const paidBonuses = ledgerBonuses.filter(b => b.status === 'paid')
  const accruedBonusTotal = accruedBonuses.reduce((s, b) => s + (parseFloat(b.amount) || 0), 0)
  const pendingBonusTotal = pendingBonuses.reduce((s, b) => s + (parseFloat(b.amount) || 0), 0)
  const needsVerCount = ledgerBonuses.filter(b => b.needs_verification && b.status !== 'paid').length

  // Owed bonuses (money already collected) count toward gross pay.
  const grossPay = hourlyPay + salaryPay + commAvailable + accruedBonusTotal

  // What's been STAGED into the next payroll run (an admin added it) — so the
  // tech sees what's actually coming next run vs what's owed but not yet added.
  const queuedBonusTotal = accruedBonuses.filter(b => b.queued_for_payroll).reduce((s, b) => s + (parseFloat(b.amount) || 0), 0)
  const queuedRepTotal = repCommissions.filter(r => r.payment_status === 'earned' && r.queued_for_payroll && (r.earned_at || '').slice(0, 10) >= periodStartStr && (r.earned_at || '').slice(0, 10) <= periodEndStr).reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)
  const inNextPaycheck = queuedBonusTotal + queuedRepTotal

  // Split commissions into buckets the UI renders separately so it's
  // obvious to the rep where each dollar is coming from.
  const earnedInvoice = commData.details.filter(d => d.status === 'available' && d.type === 'invoice_commission')
  const earnedUtility = commData.details.filter(d => d.status === 'available' && d.type === 'utility_commission')
  const earnedProcessor = commData.details.filter(d => d.status === 'available' && d.type === 'processor_commission')
  const pendingInvoice = commData.details.filter(d => d.status === 'pending' && d.type === 'invoice_commission')
  const pendingUtility = commData.details.filter(d => d.status === 'pending' && d.type === 'utility_commission')
  const pendingProcessor = commData.details.filter(d => d.status === 'pending' && d.type === 'processor_commission')
  const processorEarnedTotal = earnedProcessor.reduce((s, d) => s + d.amount, 0)
  const processorPendingTotal = pendingProcessor.reduce((s, d) => s + d.amount, 0)

  const fmt = (n) => `$${(n || 0).toFixed(2)}`
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''
  const bonusJobTitle = (b) => b.jobs?.job_title || b.jobs?.customer_name || `Job ${b.jobs?.job_id || b.job_id}`

  const triggerLabel = {
    payment_received: 'paid when the customer pays the invoice',
    invoice_created: 'paid when the invoice is created',
    job_completed: 'paid when the job is marked Completed',
  }[payrollConfig.commission_trigger] || 'paid when the customer pays the invoice'

  // Earned / Pending sales lists — show invoice + utility commissions.
  // Processor commissions are rendered in their own card below so users
  // can see them as a distinct pay line.
  const earned = [...earnedInvoice, ...earnedUtility]
  const pendingList = [...pendingInvoice, ...pendingUtility]

  const cardStyle = {
    backgroundColor: theme.bgCard,
    borderRadius: '12px',
    border: `1px solid ${theme.border}`,
    padding: '20px',
    marginBottom: '16px'
  }

  if (loading) {
    return (
      <div style={{ padding: '24px' }}>
        <p style={{ color: theme.textMuted }}>Loading your pay...</p>
      </div>
    )
  }

  return (
    <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '900px', margin: '0 auto' }}>
      {/* Build marker — appears for everyone, helps debug stale-bundle
          confusion. If you don't see "v2026.04.25" you're on an old build. */}
      <div style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '8px', textAlign: 'right', fontFamily: 'monospace' }}>
        MyPay v2026.04.27 · view-as enabled
      </div>
      {/* Admin "View as" banner — visible only to HR-enabled users.
          Lets Bryce/Doug pick any active employee and see their MyPay
          exactly as that person would see it (commissions, bonuses,
          processor cuts, blocked items). The dropdown defaults to the
          logged-in user so non-impersonating loads stay clean. */}
      {isHRAdmin && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap',
          padding: '10px 14px', marginBottom: '16px',
          backgroundColor: isImpersonating ? 'rgba(245,158,11,0.10)' : 'rgba(90,99,73,0.06)',
          border: `1px solid ${isImpersonating ? 'rgba(245,158,11,0.4)' : theme.border}`,
          borderRadius: '10px',
        }}>
          <Eye size={14} style={{ color: isImpersonating ? '#d97706' : theme.textMuted }} />
          <span style={{ fontSize: '12px', fontWeight: 600, color: isImpersonating ? '#92400e' : theme.textSecondary }}>
            {isImpersonating ? 'Viewing as:' : 'View as:'}
          </span>
          <select
            value={effectiveUserId || ''}
            onChange={(e) => setViewAsEmployeeId(e.target.value ? parseInt(e.target.value) : user?.id)}
            style={{
              padding: '6px 10px', borderRadius: '6px', border: `1px solid ${theme.border}`,
              backgroundColor: theme.bgCard, fontSize: '13px', color: theme.text, minWidth: '180px',
            }}
          >
            {/* Self always at top */}
            {user && <option value={user.id}>{user.name} (me)</option>}
            <option disabled>──────</option>
            {(allEmployees || []).filter(e => e.id !== user?.id).map(e => (
              <option key={e.id} value={e.id}>
                {e.name}{e.role ? ` · ${e.role}` : ''}
              </option>
            ))}
          </select>
          {isImpersonating && (
            <button
              onClick={() => setViewAsEmployeeId(user?.id)}
              style={{ padding: '5px 10px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}
            >
              Back to mine
            </button>
          )}
          <span style={{ marginLeft: 'auto', fontSize: '11px', color: theme.textMuted, fontStyle: 'italic' }}>
            Admin tool — only visible to HR-enabled users
          </span>
        </div>
      )}

      <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text, margin: 0 }}>
            {isImpersonating ? `${empRow?.name || 'Employee'}'s Pay` : 'My Pay'}
          </h1>
          <div style={{ fontSize: '13px', color: theme.textMuted, marginTop: '4px' }}>
            Pay period: {periodStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {periodEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            {periodOffset !== 0 && (
              <span style={{ marginLeft: '8px', padding: '2px 8px', backgroundColor: 'rgba(59,130,246,0.10)', border: '1px solid rgba(59,130,246,0.3)', color: '#3b82f6', borderRadius: '10px', fontSize: '11px', fontWeight: '600' }}>
                {periodOffset < 0 ? `${Math.abs(periodOffset)} period${Math.abs(periodOffset) === 1 ? '' : 's'} ago` : 'future'}
              </span>
            )}
          </div>
        </div>
        {/* Period navigation — step back/forward through pay periods */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <button
            onClick={() => setPeriodOffset(p => p - 1)}
            title="Previous pay period"
            style={{ padding: '6px 10px', background: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '8px', cursor: 'pointer', color: theme.textSecondary, display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
          >
            <ChevronLeft size={14} /> Prev
          </button>
          {periodOffset !== 0 && (
            <button
              onClick={() => setPeriodOffset(0)}
              style={{ padding: '6px 10px', background: theme.accent, color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '600' }}
            >
              Current
            </button>
          )}
          <button
            onClick={() => setPeriodOffset(p => p + 1)}
            disabled={periodOffset >= 0}
            title="Next pay period"
            style={{
              padding: '6px 10px', background: theme.bgCard,
              border: `1px solid ${theme.border}`, borderRadius: '8px',
              cursor: periodOffset >= 0 ? 'not-allowed' : 'pointer',
              color: periodOffset >= 0 ? theme.border : theme.textSecondary,
              display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px',
              opacity: periodOffset >= 0 ? 0.4 : 1
            }}
          >
            Next <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Gross pay summary */}
      <div style={{ ...cardStyle, background: 'linear-gradient(135deg, rgba(90,99,73,0.08) 0%, rgba(90,99,73,0.02) 100%)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(5, 1fr)', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Gross this period</div>
            <div style={{ fontSize: '22px', fontWeight: '700', color: theme.text, marginTop: '2px' }}>{fmt(grossPay)}</div>
          </div>
          {hourlyPay > 0 && (
            <div>
              <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Hourly</div>
              <div style={{ fontSize: '18px', fontWeight: '600', color: '#3b82f6', marginTop: '2px' }}>{fmt(hourlyPay)}</div>
              <div style={{ fontSize: '11px', color: theme.textMuted }}>{totalHours.toFixed(2)}h × ${parseFloat(me.hourly_rate).toFixed(2)}</div>
            </div>
          )}
          {salaryPay > 0 && (
            <div>
              <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Salary</div>
              <div style={{ fontSize: '18px', fontWeight: '600', color: '#3b82f6', marginTop: '2px' }}>{fmt(salaryPay)}</div>
              <div style={{ fontSize: '11px', color: theme.textMuted }}>${(parseFloat(me.annual_salary) || 0).toLocaleString()}/yr ÷ {periodsPerYear}</div>
            </div>
          )}
          <div>
            <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Commission</div>
            <div style={{ fontSize: '18px', fontWeight: '600', color: '#22c55e', marginTop: '2px' }}>{fmt(commAvailable)}</div>
            {commData.pending > 0 && <div style={{ fontSize: '11px', color: '#f59e0b' }}>{fmt(commData.pending)} pending</div>}
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Bonus owed</div>
            <div style={{ fontSize: '18px', fontWeight: '600', color: '#8b5cf6', marginTop: '2px' }}>{fmt(accruedBonusTotal)}</div>
            {pendingBonusTotal > 0 && <div style={{ fontSize: '11px', color: '#f59e0b' }}>{fmt(pendingBonusTotal)} upcoming</div>}
          </div>
        </div>
      </div>

      {/* In your next paycheck — what an admin has staged (added to the run). */}
      {inNextPaycheck > 0 && (
        <div style={{ ...cardStyle, background: 'linear-gradient(135deg, rgba(34,197,94,0.10) 0%, rgba(34,197,94,0.03) 100%)', border: '1px solid rgba(34,197,94,0.3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <CheckCircle size={18} style={{ color: '#16a34a' }} />
              <span style={{ fontSize: 15, fontWeight: 700, color: theme.text }}>In your next paycheck</span>
            </div>
            <span style={{ fontSize: 20, fontWeight: 700, color: '#16a34a' }}>{fmt(inNextPaycheck)}</span>
          </div>
          <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 6 }}>
            {fmt(queuedBonusTotal)} bonus + {fmt(queuedRepTotal)} commission added to the next payroll run.
          </div>
        </div>
      )}

      {/* Pending commissions — jobs won but not paid */}
      {pendingList.length > 0 && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: '700', color: theme.text, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={18} style={{ color: '#f59e0b' }} />
              Won jobs · awaiting payment
            </h2>
            <span style={{ fontSize: '18px', fontWeight: '700', color: '#f59e0b' }}>{fmt(commData.pending)}</span>
          </div>
          <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '12px' }}>
            These are invoices on your jobs that haven't been fully paid yet. Commissions are {triggerLabel}, so they'll hit your paycheck once the customer pays.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {pendingList.map((d, i) => (
              <div key={i} style={{ padding: '12px', backgroundColor: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.jobTitle}</div>
                  <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>
                    Invoice {d.invoiceId} · Total ${d.invoiceAmount.toFixed(2)}
                    {d.remaining != null && ` · $${d.remaining.toFixed(2)} still owed`}
                  </div>
                  <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '2px' }}>
                    Status: {d.paymentStatus || d.jobStatus || 'Open'}
                    {d.rateType === 'percent' && ` · your rate: ${d.rate}%`}
                  </div>
                </div>
                <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: '#f59e0b' }}>{fmt(d.amount)}</div>
                  <div style={{ fontSize: '10px', color: theme.textMuted, textTransform: 'uppercase' }}>Pending</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Earned this period */}
      {earned.length > 0 && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: '700', color: theme.text, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle size={18} style={{ color: '#22c55e' }} />
              Commissions earned this period
            </h2>
            <span style={{ fontSize: '18px', fontWeight: '700', color: '#22c55e' }}>{fmt(commAvailable)}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {earned.map((d, i) => (
              <div key={i} style={{ padding: '12px', backgroundColor: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 600, color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.jobTitle}</div>
                  <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>
                    Invoice {d.invoiceId} · ${(d.paidAmount || d.invoiceAmount).toFixed(2)} paid
                    {d.paidDate && ` on ${new Date(d.paidDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                    {d.rateType === 'percent' && ` · ${d.rate}%`}
                  </div>
                </div>
                <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                  <div style={{ fontSize: '16px', fontWeight: 700, color: '#22c55e' }}>{fmt(d.amount)}</div>
                  <div style={{ fontSize: '10px', color: theme.textMuted, textTransform: 'uppercase' }}>Earned</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Processor commissions — utility invoices you processed this period */}
      {(earnedProcessor.length > 0 || pendingProcessor.length > 0) && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: '700', color: theme.text, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <TrendingUp size={18} style={{ color: '#a855f7' }} />
              Utility processing
            </h2>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '18px', fontWeight: '700', color: '#a855f7' }}>{fmt(processorEarnedTotal)}</div>
              {processorPendingTotal > 0 && <div style={{ fontSize: '11px', color: '#f59e0b' }}>{fmt(processorPendingTotal)} pending</div>}
            </div>
          </div>
          <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '12px' }}>
            Paid on every utility invoice you handle. Rate: {me.commission_processor_rate}{me.commission_processor_type === 'flat' ? '$ flat' : '%'} of incentive.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {[...earnedProcessor, ...pendingProcessor].map((d, i) => (
              <div key={i} style={{
                padding: '10px 12px',
                backgroundColor: d.status === 'pending' ? 'rgba(245,158,11,0.06)' : 'rgba(168,85,247,0.06)',
                border: `1px solid ${d.status === 'pending' ? 'rgba(245,158,11,0.25)' : 'rgba(168,85,247,0.25)'}`,
                borderRadius: '8px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px'
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.jobTitle}
                  </div>
                  <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '2px' }}>
                    {d.utilityInvoiceId} · {d.utilityName || 'Utility'} · incentive ${d.invoiceAmount.toFixed(2)}
                    {d.paidDate && ` · paid ${new Date(d.paidDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
                    {!d.paidDate && ` · ${d.paymentStatus || 'Pending'}`}
                  </div>
                </div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: d.status === 'pending' ? '#f59e0b' : '#a855f7', whiteSpace: 'nowrap' }}>
                  {fmt(d.amount)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Efficiency bonuses — owed now + upcoming. From the persistent
          ledger, so they stay put until payroll marks them paid. */}
      {(accruedBonuses.length > 0 || pendingBonuses.length > 0) && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: '700', color: theme.text, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Zap size={18} style={{ color: '#8b5cf6' }} />
              Efficiency bonuses
            </h2>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '18px', fontWeight: '700', color: '#8b5cf6' }}>{fmt(accruedBonusTotal)}</div>
              <div style={{ fontSize: '11px', color: theme.textMuted }}>owed{pendingBonusTotal > 0 ? ` · ${fmt(pendingBonusTotal)} upcoming` : ''}</div>
            </div>
          </div>
          <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '12px' }}>
            <strong>Owed</strong> bonuses are on jobs the customer has paid — they stay here until payroll pays them out. <strong>Upcoming</strong> are earned but waiting on the job's money to come in.
            {needsVerCount > 0 && ` ${needsVerCount} still need${needsVerCount === 1 ? 's' : ''} verification — payroll can release ${needsVerCount === 1 ? 'it' : 'them'}.`}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {[...accruedBonuses, ...pendingBonuses].map((b) => {
              const st = bonusStatusLabel(b)
              return (
                <div key={b.id} style={{ padding: '10px 12px', backgroundColor: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bonusJobTitle(b)}</div>
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '2px' }}>
                      Allotted {b.allotted_hours}h · Actual {Number(b.actual_hours || 0).toFixed(1)}h · Saved {Number(b.saved_hours || 0).toFixed(1)}h
                      {b.crew_size > 1 && ` · split ${b.crew_size} ways`}
                    </div>
                    <div style={{ display: 'flex', gap: '6px', marginTop: '5px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '10px', fontWeight: 700, color: st.color, backgroundColor: `${st.color}1f`, padding: '2px 7px', borderRadius: '999px', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{st.label}</span>
                      {b.needs_verification && (
                        <span style={{ fontSize: '10px', fontWeight: 700, color: '#b45309', backgroundColor: 'rgba(245,158,11,0.15)', padding: '2px 7px', borderRadius: '999px', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                          <AlertCircle size={10} /> Needs verification
                        </span>
                      )}
                    </div>
                    {/* Plain-language "what this status means" so nobody has to guess. */}
                    <div style={{ fontSize: '10.5px', color: theme.textMuted, marginTop: '5px', lineHeight: 1.4 }}>
                      {b.status === 'accrued'
                        ? 'The customer has paid this job — it goes out on your next paycheck.'
                        : "Earned by finishing under the hours bid. Held until the customer pays this job's invoice, then it moves to your next paycheck."}
                    </div>
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 700, color: b.status === 'accrued' ? '#8b5cf6' : '#f59e0b', whiteSpace: 'nowrap' }}>{fmt(b.amount)}</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Paid-out bonuses — kept visible with the date money hit (Bryce's
          "indicator of when it gets paid"). */}
      {paidBonuses.length > 0 && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: '700', color: theme.text, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <CheckCircle size={18} style={{ color: '#22c55e' }} />
              Bonuses paid out
            </h2>
            <span style={{ fontSize: '14px', fontWeight: 700, color: '#22c55e' }}>{fmt(paidBonuses.reduce((s, b) => s + (parseFloat(b.amount) || 0), 0))}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {paidBonuses.slice(0, 12).map((b) => (
              <div key={b.id} style={{ padding: '9px 12px', backgroundColor: 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bonusJobTitle(b)}</div>
                  <div style={{ fontSize: '11px', color: '#16a34a', marginTop: '2px', fontWeight: 600 }}>
                    Paid {fmtDate(b.paid_at)}{b.paid_pay_period_end ? ` · pay period ending ${fmtDate(b.paid_pay_period_end)}` : ''}
                  </div>
                </div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#16a34a', whiteSpace: 'nowrap' }}>{fmt(b.amount)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hours summary */}
      {timeEntries.length > 0 && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: '700', color: theme.text, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={18} style={{ color: '#3b82f6' }} />
              Hours this period
            </h2>
            <span style={{ fontSize: '18px', fontWeight: '700', color: '#3b82f6' }}>{totalHours.toFixed(2)}h</span>
          </div>
          <div style={{ fontSize: '12px', color: theme.textMuted }}>
            {timeEntries.length} time entries logged this pay period. Full detail on the Time Clock page.
          </div>
        </div>
      )}

      {/* My time-off requests — own status, regardless of HR access. */}
      {myPtoRequests.length > 0 && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: '700', color: theme.text, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Clock size={18} style={{ color: '#a855f7' }} />
              My Time Off Requests
            </h2>
            <span style={{ fontSize: '12px', color: theme.textMuted }}>{myPtoRequests.length} on file</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {myPtoRequests.slice(0, 8).map(r => {
              const statusStyles = {
                pending: { bg: 'rgba(234,179,8,0.12)', fg: '#a16207', label: 'Pending review' },
                approved: { bg: 'rgba(34,197,94,0.12)', fg: '#15803d', label: 'Approved' },
                denied: { bg: 'rgba(239,68,68,0.12)', fg: '#b91c1c', label: 'Denied' },
              }
              const s = statusStyles[r.status] || { bg: theme.bg, fg: theme.textSecondary, label: r.status }
              const fmt = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''
              const range = r.start_date === r.end_date ? fmt(r.start_date) : `${fmt(r.start_date)} – ${fmt(r.end_date)}`
              return (
                <div key={r.id} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '8px 10px', backgroundColor: theme.bg, borderRadius: '8px', gap: 8,
                }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>
                      {range} · {r.request_type === 'pto' ? 'PTO' : (r.request_type || '').toUpperCase()}
                    </div>
                    {r.reason && (
                      <div style={{ fontSize: 11, color: theme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {r.reason}
                      </div>
                    )}
                  </div>
                  <span style={{
                    padding: '3px 8px', borderRadius: 999, backgroundColor: s.bg, color: s.fg,
                    fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap',
                  }}>
                    {s.label}
                  </span>
                </div>
              )
            })}
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: theme.textMuted }}>
            Submit new requests on the Time Clock page.
          </div>
        </div>
      )}

      {/* Pay history — every finalized paycheck (paystubs). Read-only, all-time. */}
      {paystubs.length > 0 && (
        <CollapsibleCard
          cardStyle={cardStyle} theme={theme}
          icon={<FileText size={18} style={{ color: theme.accent }} />}
          title="Pay history"
          summary={`${paystubs.length} paycheck${paystubs.length === 1 ? '' : 's'}`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {paystubs.map(p => <PaystubRow key={p.id} p={p} theme={theme} />)}
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: theme.textMuted }}>
            Your last {paystubs.length} pay period{paystubs.length === 1 ? '' : 's'} · tap a paycheck for the full breakdown.
          </div>
        </CollapsibleCard>
      )}

      {/* Benefits & deductions — active enrollments + what comes out of each
          check. Shown for anyone with a pay record; empty state (no fake data)
          when nothing is enrolled. */}
      {(benefits.length > 0 || paystubs.length > 0) && (
        <CollapsibleCard
          cardStyle={cardStyle} theme={theme}
          icon={<Shield size={18} style={{ color: '#0ea5e9' }} />}
          title="Benefits & deductions"
          summary={benefits.length ? `${benefits.length} active` : 'None on file'}
        >
          {benefits.length === 0 ? (
            <div style={{ fontSize: 13, color: theme.textMuted, padding: '4px 0', lineHeight: 1.5 }}>
              No benefits are on file for you yet. Health, dental, 401(k) and other enrollments your employer sets up will show here — ask an admin if you expect to see something.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {benefits.map(b => (
                <div key={b.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 12px', backgroundColor: theme.bg, borderRadius: 8 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>
                      {BENEFIT_LABELS[b.benefit_type] || b.benefit_type}{b.plan_name ? ` · ${b.plan_name}` : ''}
                    </div>
                    <div style={{ fontSize: 11, color: theme.textMuted }}>
                      {b.is_pre_tax ? 'Pre-tax' : 'Post-tax'} · {FREQ_LABELS[b.frequency] || b.frequency}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: theme.text, fontVariantNumeric: 'tabular-nums' }}>{money(b.employee_contribution)}</div>
                    {Number(b.employer_contribution) > 0 && <div style={{ fontSize: 10, color: theme.textMuted }}>+{money(b.employer_contribution)} employer</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
          {paystubs[0] && ((Number(paystubs[0].pre_tax_deductions) || 0) + (Number(paystubs[0].post_tax_deductions) || 0) > 0) && (
            <div style={{ marginTop: 12, fontSize: 12, color: theme.textMuted, borderTop: `1px dashed ${theme.border}`, paddingTop: 10 }}>
              Last paycheck deductions: <strong style={{ color: theme.text }}>{money((Number(paystubs[0].pre_tax_deductions) || 0) + (Number(paystubs[0].post_tax_deductions) || 0))}</strong>
            </div>
          )}
        </CollapsibleCard>
      )}

      {/* Empty states */}
      {!commData.details.length && !timeEntries.length && !ledgerBonuses.length && !paystubs.length && (
        <div style={{ ...cardStyle, textAlign: 'center', padding: '40px 20px' }}>
          <DollarSign size={32} style={{ color: theme.textMuted, margin: '0 auto 8px' }} />
          <div style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '4px' }}>Nothing to show yet</div>
          <div style={{ fontSize: '12px', color: theme.textMuted }}>
            Commissions, bonuses, and hours will appear here once activity lands in this pay period.
          </div>
        </div>
      )}
    </div>
  )
}
