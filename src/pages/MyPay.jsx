import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { useIsMobile } from '../hooks/useIsMobile'
import { DollarSign, TrendingUp, Clock, Calendar, CheckCircle, AlertCircle, ChevronLeft, ChevronRight, Zap } from 'lucide-react'
import {
  getCurrentPayPeriod,
  calculateInvoiceCommissions,
  calculateEfficiencyBonus,
  timeClockToJobHours,
  PERIODS_PER_YEAR,
} from '../lib/bonusCalc'

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
  // time_log entries for bonus math — MyPay needs both the user's own
  // entries (for their hours share) and every entry on jobs the user
  // worked on (for the saved-hours denominator).
  const [timeLogEntries, setTimeLogEntries] = useState([])
  const [verificationReports, setVerificationReports] = useState([])
  const [utilityInvoices, setUtilityInvoices] = useState([])
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

  useEffect(() => {
    if (!companyId || !user?.id) return
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
          } catch {}
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
          .or(`salesperson_id.eq.${user.id},salesperson_ids.cs.{${user.id}}`)

        // All jobs — we need any job owned directly by the user OR linked
        // to one of their leads. Paginate because HHH has >6k jobs.
        const fetchAllJobs = async () => {
          const all = []
          const pageSize = 1000
          for (let from = 0; ; from += pageSize) {
            const { data, error } = await supabase
              .from('jobs')
              .select('id, job_id, salesperson_id, lead_id, status, customer_name, job_title, invoice_status')
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
          .eq('employee_id', user.id)
          .gte('clock_in', periodStart.toISOString())
          .lte('clock_in', periodEnd.toISOString())
          .not('clock_out', 'is', null)

        // All time_log entries in period — bonus calc needs everyone's
        // hours on the user's jobs to compute saved hours correctly.
        const timeLogPromise = supabase
          .from('time_log')
          .select('id, employee_id, job_id, hours, date, created_at')
          .eq('company_id', companyId)
          .gte('created_at', periodStart.toISOString())
          .lte('created_at', periodEnd.toISOString())

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

        // Verification reports in period — Victor gate signal
        const verPromise = supabase
          .from('verification_reports')
          .select('job_id, verification_type, score, created_at')
          .eq('company_id', companyId)
          .eq('voided', false)
          .gte('score', 60)

        // Re-fetch my own employee row — pulls processor fields too so
        // Alayda-style roles show their processor commissions here.
        const empPromise = supabase
          .from('employees')
          .select('id, name, email, is_commission, commission_services_rate, commission_services_type, commission_goods_rate, commission_goods_type, commission_processor_rate, commission_processor_type, is_hourly, is_salary, hourly_rate, annual_salary')
          .eq('id', user.id).maybeSingle()

        // Utility invoices on jobs the user might own — we fetch them all
        // and filter client-side via the shared calc's ownership lookup.
        const utilPromise = supabase
          .from('utility_invoices')
          .select('id, utility_invoice_id, job_id, customer_name, utility_name, amount, incentive_amount, project_cost, net_cost, payment_status, paid_at, created_at')
          .eq('company_id', companyId)

        const [jr, lr, ir, pr, tr, er, ur, tlr, apr, vr] = await Promise.all([
          jobsPromise, leadsPromise, invoicesPromise, paymentsPromise,
          timePromise, empPromise, utilPromise, timeLogPromise,
          allPaymentsPromise, verPromise,
        ])
        setJobs(jr.data || [])
        setLeads(lr.data || [])
        setInvoices(ir.data || [])
        setPayments(pr.data || [])
        setTimeEntries(tr.data || [])
        setEmpRow(er?.data || null)
        setUtilityInvoices(ur?.data || [])
        setTimeLogEntries(tlr?.data || [])
        setAllPayments(apr?.data || [])
        setVerificationReports(vr?.data || [])
      } finally {
        setLoading(false)
      }
    })()
    // periodOffset in deps so changing the period refetches in-period payments
  }, [companyId, user?.id, periodOffset])

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

  // Per-job paid/total for the paid-threshold bonus gate. Mirrors the
  // Payroll page builder so MyPay gates bonuses identically.
  const jobPaymentStatus = useMemo(() => {
    const map = new Map()
    const utilByJob = new Map()
    ;(utilityInvoices || []).forEach(u => {
      if (!u.job_id) return
      if (!utilByJob.has(u.job_id)) utilByJob.set(u.job_id, [])
      utilByJob.get(u.job_id).push(u)
    })
    const jobIds = new Set()
    ;(invoices || []).forEach(inv => { if (inv.job_id) jobIds.add(inv.job_id) })
    utilByJob.forEach((_, jobId) => jobIds.add(jobId))
    jobIds.forEach(jobId => {
      const stdInvs = (invoices || []).filter(i => i.job_id === jobId)
      const utils = utilByJob.get(jobId) || []
      const stdPaid = stdInvs.reduce((s, inv) => s + (inv.payment_status === 'Paid'
        ? (parseFloat(inv.amount) || 0)
        : (allPaymentsByInvoiceId.get(inv.id) || 0)
      ), 0)
      const utilPaid = utils.filter(u => u.payment_status === 'Paid').reduce((s, u) => s + (parseFloat(u.incentive_amount) || parseFloat(u.amount) || 0), 0)
      let total
      if (utils.length > 0 && utils.some(u => parseFloat(u.project_cost) > 0)) {
        total = utils.reduce((s, u) => s + (parseFloat(u.project_cost) || 0), 0)
      } else {
        total = stdInvs.reduce((s, inv) => s + (parseFloat(inv.amount) || 0), 0)
      }
      map.set(jobId, {
        standardPaid: stdPaid,
        standardTotal: stdInvs.reduce((s, inv) => s + (parseFloat(inv.amount) || 0), 0),
        utilityPaid: utilPaid,
        utilityTotal: utils.reduce((s, u) => s + (parseFloat(u.incentive_amount) || parseFloat(u.amount) || 0), 0),
        paid: stdPaid + utilPaid,
        total,
      })
    })
    return map
  }, [invoices, utilityInvoices, allPaymentsByInvoiceId])

  const commData = useMemo(() => {
    if (!user?.id) return { available: 0, pending: 0, details: [] }
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
  }, [user, empRow, jobs, leads, invoices, payments, allPaymentsByInvoiceId, utilityInvoices, payrollConfig, periodStartStr, periodEndStr])

  // Efficiency bonus for this user — same calc Payroll uses. Uses the
  // user's own time entries plus every other crew member's time_log
  // rows on the same jobs so saved-hours math matches Payroll exactly.
  const bonusData = useMemo(() => {
    if (!user?.id) return { bonus: 0, details: [] }
    // Combine user's time_clock (normalized to job hours) with all
    // company time_log rows so the crew split is accurate.
    const myClockToJob = timeClockToJobHours(timeEntries)
    const combinedTimeLog = [...timeLogEntries, ...myClockToJob]
    // Only pass jobs the user worked on so the calc is scoped
    const verifiedJobIds = new Set(
      (verificationReports || [])
        .filter(r => r.verification_type === 'completion')
        .map(r => r.job_id)
        .filter(Boolean)
    )
    return calculateEfficiencyBonus({
      employeeId: user.id,
      timeLogEntries: combinedTimeLog,
      timeClockRows: timeEntries,
      jobs,
      employees: [empRow || user],
      skillLevels: [],
      payrollConfig,
      verifiedJobIds,
      dailyVerifiedJobDays: null,
      jobPaymentStatus,
      bonusOverrides: [],
    })
  }, [user, empRow, timeEntries, timeLogEntries, jobs, payrollConfig, verificationReports, jobPaymentStatus])

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
  const grossPay = hourlyPay + salaryPay + commData.available + (bonusData.bonus || 0)

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

  const earnedBonuses = (bonusData.details || []).filter(d => !d.blockedReason)
  const blockedBonuses = (bonusData.details || []).filter(d => d.blockedReason)
  const blockedBonusTotal = blockedBonuses.reduce((s, d) => s + (d.wouldHaveEarned || 0), 0)

  const fmt = (n) => `$${(n || 0).toFixed(2)}`

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
      <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text, margin: 0 }}>My Pay</h1>
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
            <div style={{ fontSize: '18px', fontWeight: '600', color: '#22c55e', marginTop: '2px' }}>{fmt(commData.available)}</div>
            {commData.pending > 0 && <div style={{ fontSize: '11px', color: '#f59e0b' }}>{fmt(commData.pending)} pending</div>}
          </div>
          <div>
            <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Bonus</div>
            <div style={{ fontSize: '18px', fontWeight: '600', color: '#8b5cf6', marginTop: '2px' }}>{fmt(bonusData.bonus)}</div>
            {blockedBonusTotal > 0 && <div style={{ fontSize: '11px', color: '#ef4444' }}>{fmt(blockedBonusTotal)} blocked</div>}
          </div>
        </div>
      </div>

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
            <span style={{ fontSize: '18px', fontWeight: '700', color: '#22c55e' }}>{fmt(commData.available)}</span>
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

      {/* Efficiency bonuses earned */}
      {earnedBonuses.length > 0 && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: '700', color: theme.text, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Zap size={18} style={{ color: '#8b5cf6' }} />
              Efficiency bonuses earned
            </h2>
            <span style={{ fontSize: '18px', fontWeight: '700', color: '#8b5cf6' }}>{fmt(bonusData.bonus)}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {earnedBonuses.map((d, i) => (
              <div key={i} style={{ padding: '10px 12px', backgroundColor: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.25)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.jobTitle}</div>
                  <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '2px' }}>
                    Allotted {d.allottedHours}h · Actual {d.actualHours?.toFixed(1)}h · Saved {d.savedHours?.toFixed(1)}h
                    {d.crewSize > 1 && ` · split ${d.crewSize} ways`}
                  </div>
                  {d.releaseReason && d.releaseReason !== 'victor_verified' && (
                    <div style={{ fontSize: '10px', color: '#f59e0b', marginTop: '2px', fontWeight: 600 }}>
                      Released via {d.releaseReason === 'paid_threshold_met' ? `paid threshold (${d.paidPercent}%)` : d.releaseReason === 'admin_override' ? 'admin override' : 'gate off'}
                    </div>
                  )}
                </div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#8b5cf6', whiteSpace: 'nowrap' }}>{fmt(d.bonusAmount)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Blocked bonuses — user needs to know why they didn't get paid */}
      {blockedBonuses.length > 0 && (
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h2 style={{ fontSize: '15px', fontWeight: '700', color: theme.text, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={18} style={{ color: '#ef4444' }} />
              Bonuses on hold
            </h2>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '18px', fontWeight: '700', color: theme.textMuted, textDecoration: 'line-through' }}>{fmt(blockedBonusTotal)}</div>
              <div style={{ fontSize: '11px', color: '#ef4444' }}>not paid</div>
            </div>
          </div>
          <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '12px' }}>
            These bonuses weren't released this period. The most common reason is missing Victor completion verification. Ask your admin to verify the job or release the bonus manually.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {blockedBonuses.map((d, i) => (
              <div key={i} style={{ padding: '10px 12px', backgroundColor: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.jobTitle}</div>
                  <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '2px' }}>
                    Allotted {d.allottedHours}h · Actual {d.actualHours?.toFixed(1)}h · Saved {d.savedHours?.toFixed(1)}h
                  </div>
                  <div style={{ fontSize: '11px', color: '#ef4444', marginTop: '3px', fontWeight: 600 }}>
                    {d.blockedReason === 'no_completion_verification' ? 'Blocked — completion verification missing' : 'Blocked'}
                    {d.paidPercent != null && ` · ${d.paidPercent}% paid (need ${d.paidThresholdPct}%)`}
                  </div>
                </div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: theme.textMuted, whiteSpace: 'nowrap', textDecoration: 'line-through' }}>
                  {fmt(d.wouldHaveEarned)}
                </div>
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

      {/* Empty states */}
      {!commData.details.length && !timeEntries.length && !bonusData.details?.length && (
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
