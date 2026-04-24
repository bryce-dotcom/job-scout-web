// Shared efficiency-bonus calculation + pay-period helpers.
// Used by both Payroll.jsx (admin view) and FieldScout.jsx (tech view)
// so every surface computes bonuses identically.

// Default bi-weekly anchor: a known Friday payday in 2024. Companies on
// bi-weekly should set their own pay_anchor_date in payroll_config; this
// fallback keeps period math sane if they haven't yet.
const DEFAULT_BIWEEKLY_ANCHOR = '2024-01-05' // Friday

export const PERIODS_PER_YEAR = {
  weekly: 52,
  'bi-weekly': 26,
  'semi-monthly': 24,
  monthly: 12,
}

// ── Invoice-based commission calculator ────────────────────────────────
// Given an employee, their jobs/invoices/in-period payments, and the
// payroll config, return { available, pending, details[] }.
//  available: commission earned THIS pay period
//  pending:   commission the rep hasn't been paid yet on open/unpaid work
//  details:   per-invoice breakdown { status, amount, invoiceId, jobTitle,
//             rate, rateType, paymentStatus, remaining, paidAmount, paidDate }
//
// Args:
//  employee       — row from `employees` (needs commission_services_rate,
//                   commission_services_type, commission_goods_rate,
//                   commission_goods_type, is_commission)
//  jobs           — all jobs (for salesperson_id match)
//  invoices       — all invoices (scan for ones on rep's jobs)
//  inPeriodPayments — payments with date within current pay period
//  payrollConfig  — { commission_trigger: 'payment_received' | 'invoice_created' | 'job_completed' }
//  periodStartStr / periodEndStr — ISO date strings bounding the current period
//  leads          — (optional) all leads. When a job has no salesperson_id,
//                   we fall back to the linked lead's salesperson. Most
//                   ownership lives on the lead in practice, so omitting
//                   this will under-count commission.
export function calculateInvoiceCommissions({
  employee,
  jobs,
  invoices,
  inPeriodPayments,
  payrollConfig,
  periodStartStr,
  periodEndStr,
  leads = [],
  // Map<invoice_id, totalPaid>. Used for the pending bucket so we can
  // subtract every lifetime payment from invoice.amount, not just
  // in-period ones. If omitted we approximate with in-period only.
  allPaymentsByInvoiceId,
  // Rows from utility_invoices. When a utility invoice's paid_at falls in
  // the current pay period AND the linked job is owned by this rep, the
  // incentive amount × rate is earned commission for that period.
  utilityInvoices = [],
}) {
  if (!employee?.is_commission) return { available: 0, pending: 0, details: [] }

  const svcRate = parseFloat(employee.commission_services_rate) || 0
  const svcType = employee.commission_services_type || 'percent'
  const goodsRate = parseFloat(employee.commission_goods_rate) || 0
  const goodsType = employee.commission_goods_type || 'percent'
  const rate = svcRate > 0 ? svcRate : goodsRate
  const rateType = svcRate > 0 ? svcType : goodsType

  if (rate <= 0) return { available: 0, pending: 0, details: [] }

  const commissionOn = (amount) => rateType === 'percent' ? amount * (rate / 100) : rate

  const details = []
  let available = 0
  let pending = 0

  // Ownership resolution: a job belongs to the employee if
  //   job.salesperson_id === employee.id         (explicit job owner)
  //   OR the linked lead's salesperson_id === employee.id
  //   OR the lead.salesperson_ids array includes employee.id (multi-rep)
  // Fall-through to lead is critical — most ownership lives on the lead.
  //
  // Defensive coercion: jobs.lead_id sometimes comes back as a string
  // ("1669") and sometimes as a number (1669) depending on how the row
  // was inserted. Same for leads.id. We coerce both to string when
  // building the lookup and when querying so type mismatch doesn't
  // silently drop an entire rep's ownership chain (as happened on
  // Redman #2 — lead_id was a string and leadsById was keyed by int).
  const leadsById = new Map((leads || []).map(l => [String(l.id), l]))
  const empId = employee.id
  const empIdStr = String(empId)
  const matchId = (a, b) => a != null && b != null && String(a) === String(b)
  const ownsJob = (job) => {
    if (matchId(job.salesperson_id, empId)) return true
    if (job.lead_id) {
      const lead = leadsById.get(String(job.lead_id))
      if (!lead) return false
      if (matchId(lead.salesperson_id, empId)) return true
      if (Array.isArray(lead.salesperson_ids) && lead.salesperson_ids.map(String).includes(empIdStr)) return true
    }
    return false
  }
  const empJobs = (jobs || []).filter(ownsJob)
  const empJobIds = empJobs.map(j => j.id)
  const empInvoices = (invoices || []).filter(inv => empJobIds.includes(inv.job_id))
  const trigger = payrollConfig?.commission_trigger || 'payment_received'

  empInvoices.forEach(inv => {
    const invAmount = parseFloat(inv.amount) || 0
    if (invAmount <= 0) return
    const job = empJobs.find(j => j.id === inv.job_id)
    const jobLabel = job?.job_title || job?.customer_name || inv.job_description || 'Unknown'
    const fullCommission = commissionOn(invAmount)
    if (fullCommission <= 0) return

    if (trigger === 'payment_received') {
      // inPeriodPayments = payments with date inside the current pay
      // period window (caller filters). EVERY in-period payment earns
      // commission on its amount × rate, regardless of whether the
      // invoice is now fully paid or still partial.
      const inPeriodMatches = (inPeriodPayments || []).filter(p => p.invoice_id === inv.id)
      let paidInPeriod = inPeriodMatches.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
      let paidDate = inPeriodMatches[0]?.date

      // Fallback: some Paid invoices (esp. deposits imported from HCP) never
      // got a matching row in the payments table. If an invoice is marked
      // Paid AND its updated_at/created_at lands in the period AND we have
      // no payment rows for it, count it as paid-in-period for the full
      // invoice amount. This patches a data sync gap without requiring a
      // mass-backfill of 300+ historical rows.
      const lifetimePaidFromPays = allPaymentsByInvoiceId?.get(inv.id) || 0
      if (inv.payment_status === 'Paid' && lifetimePaidFromPays === 0 && paidInPeriod === 0) {
        const effectiveDate = (inv.updated_at || inv.created_at || '').split('T')[0]
        if (periodStartStr && periodEndStr && effectiveDate >= periodStartStr && effectiveDate <= periodEndStr) {
          paidInPeriod = invAmount
          paidDate = effectiveDate
        }
      }

      if (paidInPeriod > 0) {
        const earned = rateType === 'percent'
          ? commissionOn(paidInPeriod)
          : fullCommission // flat rate earned once when any in-period payment lands
        if (earned > 0) {
          available += earned
          details.push({
            type: 'invoice_commission', status: 'available', amount: earned,
            invoiceId: inv.invoice_id, invoiceDbId: inv.id, jobId: inv.job_id,
            jobTitle: jobLabel, invoiceAmount: invAmount, paidAmount: paidInPeriod,
            paidDate, rate, rateType,
          })
        }
      }

      // Pending commission = rate on the amount that has not yet been paid.
      // For invoices flagged Paid we trust the flag. For anything else we
      // sum ALL payments (`allPaymentsByInvoiceId`) so partial-paid
      // invoices only count the remaining balance. When the caller doesn't
      // pass allPaymentsByInvoiceId, fall back to the in-period sum, which
      // is less accurate but never double-counts.
      const lifetimePaid = inv.payment_status === 'Paid'
        ? invAmount
        : (allPaymentsByInvoiceId?.get(inv.id) ?? paidInPeriod)
      const remaining = Math.max(0, invAmount - lifetimePaid)
      if (remaining > 0 && inv.payment_status !== 'Paid') {
        const pendingAmt = rateType === 'percent' ? commissionOn(remaining) : fullCommission
        pending += pendingAmt
        details.push({
          type: 'invoice_commission', status: 'pending', amount: pendingAmt,
          invoiceId: inv.invoice_id, invoiceDbId: inv.id, jobId: inv.job_id,
          jobTitle: jobLabel, invoiceAmount: invAmount, paidAmount: lifetimePaid,
          remaining, rate, rateType, paymentStatus: inv.payment_status,
        })
      }
    } else if (trigger === 'invoice_created') {
      const createdStr = (inv.created_at || '').split('T')[0]
      const inPeriod = periodStartStr && periodEndStr && createdStr >= periodStartStr && createdStr <= periodEndStr
      if (inPeriod) {
        available += fullCommission
        details.push({
          type: 'invoice_commission', status: 'available', amount: fullCommission,
          invoiceId: inv.invoice_id, invoiceDbId: inv.id, jobId: inv.job_id,
          jobTitle: jobLabel, invoiceAmount: invAmount, createdDate: inv.created_at,
          rate, rateType,
        })
      }
    } else if (trigger === 'job_completed') {
      const isComplete = job?.status === 'Completed' || job?.status === 'Complete'
      if (isComplete) {
        available += fullCommission
        details.push({
          type: 'invoice_commission', status: 'available', amount: fullCommission,
          invoiceId: inv.invoice_id, invoiceDbId: inv.id, jobId: inv.job_id,
          jobTitle: jobLabel, invoiceAmount: invAmount, rate, rateType,
        })
      } else {
        pending += fullCommission
        details.push({
          type: 'invoice_commission', status: 'pending', amount: fullCommission,
          invoiceId: inv.invoice_id, invoiceDbId: inv.id, jobId: inv.job_id,
          jobTitle: jobLabel, invoiceAmount: invAmount,
          jobStatus: job?.status || 'In Progress', rate, rateType,
        })
      }
    }
  })

  // ── Utility invoice commissions ─────────────────────────────────────
  // Commission on incentive paid by the utility, attributed to the rep who
  // owns the job. A utility invoice is a commissionable event in the period
  // whose paid_at date falls inside [periodStart, periodEnd]. Pending =
  // incentive × rate for utility invoices on rep's jobs that aren't paid yet.
  const empUtilities = (utilityInvoices || []).filter(u => empJobIds.includes(u.job_id))
  empUtilities.forEach(u => {
    const incentive = parseFloat(u.incentive_amount) || parseFloat(u.amount) || 0
    if (incentive <= 0) return
    const earnedAmount = rateType === 'percent' ? commissionOn(incentive) : fullCommissionFlat(rate)
    if (earnedAmount <= 0) return

    const job = empJobs.find(j => j.id === u.job_id)
    const jobLabel = job?.job_title || job?.customer_name || u.customer_name || 'Utility incentive'
    const isPaid = u.payment_status === 'Paid'
    const paidAtStr = (u.paid_at || '').split('T')[0]
    const paidInPeriod = isPaid && periodStartStr && periodEndStr &&
      paidAtStr >= periodStartStr && paidAtStr <= periodEndStr

    if (paidInPeriod) {
      available += earnedAmount
      details.push({
        type: 'utility_commission', status: 'available', amount: earnedAmount,
        utilityInvoiceId: u.utility_invoice_id || `UTL-${u.id}`,
        utilityInvoiceDbId: u.id,
        jobId: u.job_id, jobTitle: jobLabel,
        invoiceAmount: incentive, paidAmount: incentive,
        paidDate: u.paid_at,
        utilityName: u.utility_name,
        rate, rateType,
      })
    } else if (!isPaid) {
      pending += earnedAmount
      details.push({
        type: 'utility_commission', status: 'pending', amount: earnedAmount,
        utilityInvoiceId: u.utility_invoice_id || `UTL-${u.id}`,
        utilityInvoiceDbId: u.id,
        jobId: u.job_id, jobTitle: jobLabel,
        invoiceAmount: incentive, paymentStatus: u.payment_status,
        utilityName: u.utility_name, rate, rateType,
      })
    }
    // else: paid in a different period (past or future) — don't include
  })

  return { available, pending, details }
}

// Flat-rate helper — a flat commission is earned once per qualifying event
function fullCommissionFlat(rate) { return rate }

// ── Pay period window from payroll config ──────────────────────────────
// weekly: Mon–Sun window containing today
// bi-weekly: 14-day windows anchored on payroll_config.pay_anchor_date
//   (period ENDS on an anchor payday; the 14 days prior are the period)
// semi-monthly: 1st–15th / 16th–end-of-month
// monthly: 1st–end-of-month
export function getCurrentPayPeriod(payrollConfig = {}, offset = 0) {
  const today = new Date()
  const frequency = payrollConfig.pay_frequency || 'bi-weekly'
  let periodStart, periodEnd

  if (frequency === 'weekly') {
    const day = today.getDay()
    periodStart = new Date(today)
    periodStart.setDate(today.getDate() - (day === 0 ? 6 : day - 1))
    periodEnd = new Date(periodStart)
    periodEnd.setDate(periodStart.getDate() + 6)
    if (offset !== 0) {
      periodStart.setDate(periodStart.getDate() + offset * 7)
      periodEnd.setDate(periodEnd.getDate() + offset * 7)
    }
  } else if (frequency === 'bi-weekly') {
    // Anchor date is a known payday. Each pay period covers the 14 days
    // ending on a payday, so pay period N = (anchor + 14*N - 14) .. (anchor + 14*N - 1)
    const anchorStr = payrollConfig.pay_anchor_date || DEFAULT_BIWEEKLY_ANCHOR
    const anchor = new Date(anchorStr + 'T00:00:00')
    const MS_PER_DAY = 86400000
    const daysSinceAnchor = Math.floor((today - anchor) / MS_PER_DAY)
    // Find the payday that is >= today (current period's payday)
    const cycle = ((daysSinceAnchor % 14) + 14) % 14
    const daysUntilPayday = cycle === 0 ? 0 : 14 - cycle
    const currentPayday = new Date(today)
    currentPayday.setDate(today.getDate() + daysUntilPayday)
    // Period ENDS on payday - 1 (last worked day); period STARTS 14 days earlier
    periodEnd = new Date(currentPayday)
    periodStart = new Date(currentPayday)
    periodStart.setDate(currentPayday.getDate() - 13)
    if (offset !== 0) {
      periodStart.setDate(periodStart.getDate() + offset * 14)
      periodEnd.setDate(periodEnd.getDate() + offset * 14)
    }
  } else if (frequency === 'semi-monthly') {
    if (today.getDate() <= 15) {
      periodStart = new Date(today.getFullYear(), today.getMonth(), 1)
      periodEnd = new Date(today.getFullYear(), today.getMonth(), 15)
    } else {
      periodStart = new Date(today.getFullYear(), today.getMonth(), 16)
      periodEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    }
    if (offset !== 0) {
      let m = periodStart.getMonth()
      let y = periodStart.getFullYear()
      let isFirstHalf = periodStart.getDate() === 1
      const steps = Math.abs(offset)
      const dir = offset > 0 ? 1 : -1
      for (let i = 0; i < steps; i++) {
        if (dir > 0) {
          if (isFirstHalf) { isFirstHalf = false }
          else { isFirstHalf = true; m++ }
        } else {
          if (!isFirstHalf) { isFirstHalf = true }
          else { isFirstHalf = false; m-- }
        }
        if (m > 11) { m = 0; y++ }
        if (m < 0) { m = 11; y-- }
      }
      if (isFirstHalf) {
        periodStart = new Date(y, m, 1)
        periodEnd = new Date(y, m, 15)
      } else {
        periodStart = new Date(y, m, 16)
        periodEnd = new Date(y, m + 1, 0)
      }
    }
  } else {
    // monthly
    periodStart = new Date(today.getFullYear(), today.getMonth(), 1)
    periodEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0)
    if (offset !== 0) {
      periodStart = new Date(today.getFullYear(), today.getMonth() + offset, 1)
      periodEnd = new Date(today.getFullYear(), today.getMonth() + offset + 1, 0)
    }
  }

  periodStart.setHours(0, 0, 0, 0)
  periodEnd.setHours(23, 59, 59, 999)
  return { periodStart, periodEnd }
}

// Skill weight lookup — defaults to 1 so unlabeled crews still get a share.
function getSkillWeight(empId, employees, skillLevels) {
  const emp = employees.find(e => e.id === empId)
  if (!emp?.skill_level) return 1
  const found = (skillLevels || []).find(s => s.name === emp.skill_level)
  return found ? found.weight : 1
}

// ── time_clock → job-hours normalizer ─────────────────────────────────
// time_clock is the single source of truth for "hours a tech spent on a
// job". Each row has employee_id, job_id, clock_in, clock_out, total_hours.
// This helper converts those rows into the shape the bonus calc wants
// ({ employee_id, job_id, hours }), skipping rows that are missing data
// (no job_id, still actively clocked in, etc.). Lunch breaks are already
// subtracted in time_clock.total_hours at clock-out time.
export function timeClockToJobHours(timeClockRows = []) {
  return (timeClockRows || []).flatMap(row => {
    if (!row?.job_id || !row?.employee_id) return []
    let hours = parseFloat(row.total_hours)
    if (!(hours > 0) && row.clock_in && row.clock_out) {
      hours = (new Date(row.clock_out) - new Date(row.clock_in)) / 36e5
      if (row.lunch_start && row.lunch_end) {
        hours -= (new Date(row.lunch_end) - new Date(row.lunch_start)) / 36e5
      }
    }
    if (!(hours > 0)) return []
    return [{
      employee_id: row.employee_id,
      job_id: row.job_id,
      hours: Math.round(hours * 100) / 100,
    }]
  })
}

// ── Efficiency bonus for a single employee ─────────────────────────────
// Uses time_clock (the same rows Payroll's edit screen adjusts) to figure
// out total actual hours per job and who the crew was, then splits the
// (savedHours * rate) pool by skill weight. Returns { bonus, details[] }.
//
// The `timeLogEntries` parameter accepts the pre-normalized shape
// { employee_id, job_id, hours } — callers should pass
// `timeClockToJobHours(timeClockRows)` so one edit in Payroll flows
// through every surface that reads from this function.
//
// Victor gates:
//   - `verifiedJobIds` (Set/array of job IDs): jobs with a passing completion
//     Victor verification. Required for the job to earn a bonus at all.
//   - `dailyVerifiedJobDays` (Set of `${job_id}|YYYY-MM-DD` strings): job-days
//     where a passing daily Victor verification exists. If the crew worked a
//     day without a daily check, those hours still count toward savedHours but
//     the bonus multiplier for that employee's share is reduced via a
//     per-employee coverage ratio — missing a day costs you proportionally.
export function calculateEfficiencyBonus({
  employeeId,
  timeLogEntries = [],
  jobs = [],
  employees = [],
  skillLevels = [],
  payrollConfig = {},
  verifiedJobIds = null,      // null = legacy no-op (no gate); Set/array to enforce
  dailyVerifiedJobDays = null, // null = legacy no-op; Set of "jobId|YYYY-MM-DD"
  timeClockRows = null,        // raw rows (with clock_in) for daily-coverage lookup
  // Map<job_id, { standardPaid, standardTotal, utilityPaid, utilityTotal }>.
  // Used by the paid-threshold gate override: if a job's Victor verification
  // is missing but >= threshold% of its combined billable has been collected
  // (standard invoice + utility incentive), the bonus is released instead
  // of hard-blocked. Caller builds this from invoices + utility_invoices.
  jobPaymentStatus = null,
  // Override list from payroll_adjustments where category='bonus_override'.
  // Array of { job_id, employee_id } tuples — the admin has explicitly said
  // "pay this bonus anyway" for that employee/job combo. Always releases.
  bonusOverrides = [],
}) {
  if (!payrollConfig.efficiency_bonus_enabled) return { bonus: 0, details: [] }

  const rate = payrollConfig.efficiency_bonus_rate || 25
  const companyCut = payrollConfig.company_bonus_cut_percent || 0
  const minSaved = payrollConfig.bonus_min_hours_saved || 0
  // Verification gate mode:
  //   'strict'        — Victor completion required (legacy behavior)
  //   'paid_override' — Victor required UNLESS >= threshold% of the job has
  //                     been paid (combining standard invoice + utility
  //                     incentive). Default threshold 50%.
  //   'off'           — no verification required at all
  const gateMode = payrollConfig.bonus_verification_gate || 'strict'
  const paidThresholdPct = Number.isFinite(parseFloat(payrollConfig.bonus_paid_threshold_percent))
    ? parseFloat(payrollConfig.bonus_paid_threshold_percent)
    : 50
  const verifiedSet = verifiedJobIds ? new Set([...verifiedJobIds].map(String)) : null
  const dailySet = dailyVerifiedJobDays ? new Set([...dailyVerifiedJobDays]) : null
  const overrideSet = new Set((bonusOverrides || []).map(o => `${o.job_id}|${o.employee_id}`))

  const details = []
  let totalBonus = 0

  // Jobs this employee logged time on during the period
  const empTimeLogs = timeLogEntries.filter(tl => tl.employee_id === employeeId)
  const jobMap = {}
  empTimeLogs.forEach(tl => {
    if (!tl.job_id) return
    jobMap[tl.job_id] = (jobMap[tl.job_id] || 0) + (tl.hours || 0)
  })

  Object.keys(jobMap).forEach(jobId => {
    const job = jobs.find(j => String(j.id) === String(jobId))
    if (!job?.allotted_time_hours) return

    const allJobTimeLogs = timeLogEntries.filter(tl => String(tl.job_id) === String(jobId))
    const totalActualHours = allJobTimeLogs.reduce((s, tl) => s + (tl.hours || 0), 0)
    const savedHours = job.allotted_time_hours - totalActualHours

    if (savedHours <= 0) return
    if (savedHours < minSaved) return
    if (payrollConfig.bonus_quality_gate && job.has_callback) return

    // Verification gate — respect the configured mode.
    //
    // A blocked job still emits a details row so the Payroll UI can show
    // "would have earned $X, blocked because …" and offer an override.
    // The computed-but-blocked amount is carried in wouldHaveEarned on the
    // details row; it isn't added to totalBonus.
    const passesVictor = !verifiedSet || verifiedSet.has(String(jobId))
    const hasAdminOverride = overrideSet.has(`${jobId}|${employeeId}`)
    let paidPercent = null
    let paidOverrideApplies = false
    if (gateMode === 'paid_override' && !passesVictor && jobPaymentStatus) {
      const s = jobPaymentStatus.get ? jobPaymentStatus.get(Number(jobId)) : jobPaymentStatus[jobId]
      if (s) {
        // Prefer the authoritative totals the caller computed (handles the
        // overlap case where a standard invoice and a utility incentive
        // describe the same project). Fall back to naive sum for older
        // callers.
        const total = (+s.total) || ((+s.standardTotal || 0) + (+s.utilityTotal || 0))
        const paid = (+s.paid !== undefined) ? (+s.paid) : ((+s.standardPaid || 0) + (+s.utilityPaid || 0))
        if (total > 0) {
          paidPercent = (paid / total) * 100
          if (paidPercent >= paidThresholdPct) paidOverrideApplies = true
        }
      }
    }
    const gateOff = gateMode === 'off'
    const passes = gateOff || passesVictor || paidOverrideApplies || hasAdminOverride

    if (!passes) {
      // Compute what they WOULD have earned so the admin can override.
      // Approximate crew share by even split across employees with time_log
      // on this job (skill-weighting happens below in the paid path; we
      // mirror it roughly here but don't apply coverageRatio since the
      // strict gate already blocks).
      const crew = [...new Set(allJobTimeLogs.map(tl => tl.employee_id))]
      const myHours = jobMap[jobId] || 0
      const totalLoggedHours = allJobTimeLogs.reduce((s, tl) => s + (tl.hours||0), 0)
      const myShareBase = totalLoggedHours > 0 ? myHours / totalLoggedHours : (crew.length ? 1/crew.length : 0)
      const rawPool = savedHours * rate
      const companyPortion = rawPool * (companyCut / 100)
      const crewPortion = rawPool - companyPortion
      const myRawShare = crewPortion * myShareBase
      details.push({
        jobId: job.job_id || job.id,
        jobTitle: job.job_title || job.customer_name || 'Job',
        allottedHours: job.allotted_time_hours,
        actualHours: totalActualHours,
        savedHours,
        crewSize: crew.length,
        employeeShare: 0,
        wouldHaveEarned: +myRawShare.toFixed(2),
        blockedReason: !passesVictor ? 'no_completion_verification' : 'blocked',
        paidPercent: paidPercent != null ? +paidPercent.toFixed(1) : null,
        paidThresholdPct,
        gateMode,
      })
      return
    }
    // Bonus released via an override path — tag it so the UI can show why.
    const releaseReason = passesVictor ? 'victor_verified'
      : hasAdminOverride ? 'admin_override'
      : paidOverrideApplies ? 'paid_threshold_met'
      : 'gate_off'

    // Victor daily gate: compute per-employee coverage ratio from time_clock
    // rows. An employee who worked 3 days on the job but only has 2 days with
    // daily verification gets 2/3 of their share.
    let coverageRatio = 1
    if (dailySet && Array.isArray(timeClockRows)) {
      const myRowsOnJob = timeClockRows.filter(r =>
        String(r.job_id) === String(jobId) &&
        r.employee_id === employeeId &&
        r.clock_in
      )
      const daysWorked = new Set(
        myRowsOnJob.map(r => new Date(r.clock_in).toISOString().split('T')[0])
      )
      if (daysWorked.size > 0) {
        const covered = [...daysWorked].filter(d => dailySet.has(`${jobId}|${d}`)).length
        coverageRatio = covered / daysWorked.size
      }
    }

    const totalPool = savedHours * rate
    const companyShare = totalPool * (companyCut / 100)
    const crewPool = totalPool - companyShare

    const crewMemberIds = [...new Set(allJobTimeLogs.map(tl => tl.employee_id))]
    const crewWeights = crewMemberIds.map(id => ({
      id, weight: getSkillWeight(id, employees, skillLevels),
    }))
    const participatingCrew = crewWeights.filter(c => c.weight > 0)
    const totalWeight = participatingCrew.reduce((s, c) => s + c.weight, 0)
    if (totalWeight <= 0) return

    const myWeight = getSkillWeight(employeeId, employees, skillLevels)
    if (myWeight <= 0) {
      details.push({
        jobId: job.job_id || job.id,
        jobTitle: job.job_title || job.customer_name || 'Job',
        allottedHours: job.allotted_time_hours,
        actualHours: totalActualHours,
        savedHours,
        crewSize: crewMemberIds.length,
        employeeShare: 0,
        bonusAmount: 0,
        weightedOut: true,
      })
      return
    }

    const rawBonusAmount = crewPool * (myWeight / totalWeight)
    const bonusAmount = rawBonusAmount * coverageRatio
    totalBonus += bonusAmount
    details.push({
      jobId: job.job_id || job.id,
      jobTitle: job.job_title || job.customer_name || 'Job',
      allottedHours: job.allotted_time_hours,
      actualHours: totalActualHours,
      savedHours,
      crewSize: crewMemberIds.length,
      employeeShare: savedHours * (myWeight / totalWeight) * coverageRatio,
      bonusAmount,
      companyCut: companyShare,
      totalPool,
      crewPool,
      coverageRatio,
      coveragePenalty: coverageRatio < 1 ? rawBonusAmount - bonusAmount : 0,
      releaseReason,
      paidPercent: paidPercent != null ? +paidPercent.toFixed(1) : null,
      gateMode,
    })
  })

  return { bonus: totalBonus, details }
}
