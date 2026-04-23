import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { useIsMobile } from '../hooks/useIsMobile'
import { DollarSign, TrendingUp, Clock, Calendar, CheckCircle, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  getCurrentPayPeriod,
  calculateInvoiceCommissions,
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
  const [timeEntries, setTimeEntries] = useState([])
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
              // amount_paid / total_paid removed — they don't exist on the
              // invoices table; selecting them returned 400 and broke the
              // entire page silently. Lifetime paid is computed from the
              // payments table via allPaymentsByInvoiceId in bonusCalc.
              .select('id, invoice_id, job_id, amount, payment_status, created_at, job_description')
              .eq('company_id', companyId)
              .or(`payment_status.neq.Paid,created_at.gte.${periodStartStr}`)
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

        // Own time entries in period
        const timePromise = supabase
          .from('time_clock')
          .select('id, job_id, clock_in, clock_out, total_hours')
          .eq('company_id', companyId)
          .eq('employee_id', user.id)
          .gte('clock_in', periodStart.toISOString())
          .lte('clock_in', periodEnd.toISOString())
          .not('clock_out', 'is', null)

        // Re-fetch my own employee row so commission_services_rate /
        // commission_goods_rate / is_commission reflect the latest edits
        // (store snapshot from login would otherwise go stale).
        const empPromise = supabase
          .from('employees')
          .select('id, name, email, is_commission, commission_services_rate, commission_services_type, commission_goods_rate, commission_goods_type, is_hourly, is_salary, hourly_rate, annual_salary')
          .eq('id', user.id).maybeSingle()

        const [jr, lr, ir, pr, tr, er] = await Promise.all([jobsPromise, leadsPromise, invoicesPromise, paymentsPromise, timePromise, empPromise])
        setJobs(jr.data || [])
        setLeads(lr.data || [])
        setInvoices(ir.data || [])
        setPayments(pr.data || [])
        setTimeEntries(tr.data || [])
        setEmpRow(er?.data || null)
      } finally {
        setLoading(false)
      }
    })()
    // periodOffset in deps so changing the period refetches in-period payments
  }, [companyId, user?.id, periodOffset])

  const { periodStart, periodEnd } = getCurrentPayPeriod(payrollConfig, periodOffset)
  const periodStartStr = periodStart.toISOString().split('T')[0]
  const periodEndStr = periodEnd.toISOString().split('T')[0]

  const commData = useMemo(() => {
    if (!user?.id) return { available: 0, pending: 0, details: [] }
    // Prefer freshly-fetched empRow; fall back to the store's user until it arrives.
    const me = empRow || user
    return calculateInvoiceCommissions({
      employee: me,
      jobs,
      leads,
      invoices,
      inPeriodPayments: payments,
      payrollConfig,
      periodStartStr,
      periodEndStr,
    })
  }, [user, empRow, jobs, leads, invoices, payments, payrollConfig, periodStartStr, periodEndStr])

  const totalHours = timeEntries.reduce((s, e) => {
    let h = e.total_hours
    if (!h && e.clock_in && e.clock_out) h = (new Date(e.clock_out) - new Date(e.clock_in)) / 36e5
    return s + (h || 0)
  }, 0)

  // Calculate expected hourly/salary pay (own-view only, no HR access needed)
  const periodsPerYear = PERIODS_PER_YEAR[payrollConfig.pay_frequency] || 26
  const hourlyPay = (user?.is_hourly && user?.hourly_rate) ? totalHours * parseFloat(user.hourly_rate) : 0
  const salaryPay = (user?.is_salary && user?.annual_salary) ? parseFloat(user.annual_salary) / periodsPerYear : 0
  const grossPay = hourlyPay + salaryPay + commData.available

  const fmt = (n) => `$${(n || 0).toFixed(2)}`

  const triggerLabel = {
    payment_received: 'paid when the customer pays the invoice',
    invoice_created: 'paid when the invoice is created',
    job_completed: 'paid when the job is marked Completed',
  }[payrollConfig.commission_trigger] || 'paid when the customer pays the invoice'

  const earned = commData.details.filter(d => d.status === 'available')
  const pendingList = commData.details.filter(d => d.status === 'pending')

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
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr 1fr', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Gross this period</div>
            <div style={{ fontSize: '22px', fontWeight: '700', color: theme.text, marginTop: '2px' }}>{fmt(grossPay)}</div>
          </div>
          {hourlyPay > 0 && (
            <div>
              <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Hourly</div>
              <div style={{ fontSize: '18px', fontWeight: '600', color: '#3b82f6', marginTop: '2px' }}>{fmt(hourlyPay)}</div>
              <div style={{ fontSize: '11px', color: theme.textMuted }}>{totalHours.toFixed(2)}h × ${parseFloat(user.hourly_rate).toFixed(2)}</div>
            </div>
          )}
          {salaryPay > 0 && (
            <div>
              <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Salary</div>
              <div style={{ fontSize: '18px', fontWeight: '600', color: '#3b82f6', marginTop: '2px' }}>{fmt(salaryPay)}</div>
              <div style={{ fontSize: '11px', color: theme.textMuted }}>${(parseFloat(user.annual_salary) || 0).toLocaleString()}/yr ÷ {periodsPerYear}</div>
            </div>
          )}
          <div>
            <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Commission</div>
            <div style={{ fontSize: '18px', fontWeight: '600', color: '#22c55e', marginTop: '2px' }}>{fmt(commData.available)}</div>
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
      {!commData.details.length && !timeEntries.length && (
        <div style={{ ...cardStyle, textAlign: 'center', padding: '40px 20px' }}>
          <DollarSign size={32} style={{ color: theme.textMuted, margin: '0 auto 8px' }} />
          <div style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '4px' }}>Nothing to show yet</div>
          <div style={{ fontSize: '12px', color: theme.textMuted }}>
            Commissions and hours will appear here once activity lands in this pay period.
          </div>
        </div>
      )}
    </div>
  )
}
