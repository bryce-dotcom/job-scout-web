// Persistent efficiency-bonus ledger helpers.
//
// The `job_bonuses` table is the source of truth for what a tech has EARNED
// and is OWED, so a bonus no longer vanishes when a job's hours are corrected
// or the pay period rolls over (Bryce's Western States ticket). See the
// 20260623120000 / 20260623130000 migrations and bonusCalc.computeJobBonusRows.
//
// Lifecycle:  pending (earned, job's money not in) -> accrued (money in, OWED,
//             shows in My Pay) -> paid (payroll paid it, frozen) / void.
// Verification is a FLAG (needs_verification), never a wipe — payroll overrides.
//
// Two entry points:
//   fetchUserBonuses  — My Pay / Job page read what's owed (reader).
//   syncJobBonuses    — Payroll recomputes + upserts non-paid rows (writer).
//                       Only Payroll has the full employees + skill_levels set
//                       needed to split crew bonuses correctly, so it owns writes.

import { computeJobBonusRows } from './bonusCalc'

// ── Reader ─────────────────────────────────────────────────────────────
// All of one employee's bonus rows, newest first, with the job title joined.
export async function fetchUserBonuses(supabase, companyId, employeeId) {
  if (!companyId || !employeeId) return []
  const { data, error } = await supabase
    .from('job_bonuses')
    .select('*, jobs(job_title, customer_name, job_id)')
    .eq('company_id', companyId)
    .eq('employee_id', employeeId)
    .order('updated_at', { ascending: false })
  if (error) { console.error('fetchUserBonuses', error.message); return [] }
  return data || []
}

// All bonus rows for a single job (every crew member) — for the Job page.
export async function fetchJobBonuses(supabase, companyId, jobId) {
  if (!companyId || !jobId) return []
  const { data, error } = await supabase
    .from('job_bonuses')
    .select('*, employees(name)')
    .eq('company_id', companyId)
    .eq('job_id', jobId)
    .order('amount', { ascending: false })
  if (error) { console.error('fetchJobBonuses', error.message); return [] }
  return data || []
}

// ── Writer ─────────────────────────────────────────────────────────────
// Recompute every non-paid bonus from live data and upsert. `paid` rows are
// frozen — never touched. A row flips pending -> accrued the moment the job's
// money comes in. Returns { upserted, accruedTotal, pendingTotal }.
//
// Inputs mirror what Payroll already builds for the live bonus calc.
export async function syncJobBonuses({
  supabase,
  companyId,
  jobs = [],                 // jobs with allotted_time_hours
  timeClockRows = [],        // all company time_clock rows (job_id set)
  employees = [],
  skillLevels = [],
  payrollConfig = {},
  verifiedJobIds = null,
  dailyVerifiedJobDays = null,
  jobPaymentStatus = null,   // Map<job_id, { paid, total }>
  bonusOverrides = [],
}) {
  if (!companyId) return { upserted: 0, accruedTotal: 0, pendingTotal: 0 }

  // Existing ledger so we can freeze `paid` rows and preserve accrued_at.
  const { data: existing } = await supabase
    .from('job_bonuses')
    .select('job_id, employee_id, status, accrued_at, needs_verification, verification_overridden_by, verification_overridden_at')
    .eq('company_id', companyId)
  const existingByKey = new Map((existing || []).map(r => [`${r.job_id}|${r.employee_id}`, r]))

  const timeByJob = new Map()
  for (const t of timeClockRows) {
    if (!t.job_id) continue
    if (!timeByJob.has(t.job_id)) timeByJob.set(t.job_id, [])
    timeByJob.get(t.job_id).push(t)
  }

  const nowIso = new Date().toISOString()
  const upserts = []
  let accruedTotal = 0, pendingTotal = 0
  for (const job of jobs) {
    if (!job?.allotted_time_hours) continue
    const jobTime = timeByJob.get(job.id) || []
    if (jobTime.length === 0) continue
    const rows = computeJobBonusRows({
      job, timeClockRows: jobTime, employees, skillLevels, payrollConfig,
      verifiedJobIds, dailyVerifiedJobDays, jobPaymentStatus, bonusOverrides,
    })
    const moneyIn = (jobPaymentStatus?.get?.(job.id)?.paid || 0) > 0.005
    for (const r of rows) {
      const key = `${job.id}|${r.employee_id}`
      const ex = existingByKey.get(key)
      if (ex?.status === 'paid') continue // frozen — never recompute a paid bonus
      const status = moneyIn ? 'accrued' : 'pending'
      if (status === 'accrued') accruedTotal += r.amount; else pendingTotal += r.amount
      // Preserve a payroll verification override: once a human released it,
      // don't re-flag it as needing verification on the next recompute.
      const overridden = ex && ex.needs_verification === false && ex.verification_overridden_by
      upserts.push({
        company_id: companyId,
        job_id: job.id,
        employee_id: r.employee_id,
        amount: r.amount,
        saved_hours: r.saved_hours,
        allotted_hours: r.allotted_hours,
        actual_hours: r.actual_hours,
        crew_size: r.crew_size,
        release_reason: overridden ? 'admin_override' : r.release_reason,
        needs_verification: overridden ? false : !!r.needs_verification,
        verification_overridden_by: overridden ? ex.verification_overridden_by : null,
        verification_overridden_at: overridden ? ex.verification_overridden_at : null,
        status,
        accrued_at: status === 'accrued' ? (ex?.accrued_at || nowIso) : null,
        updated_at: nowIso,
      })
    }
  }

  // Chunked upsert on the (job_id, employee_id) unique key.
  for (let i = 0; i < upserts.length; i += 200) {
    const { error } = await supabase
      .from('job_bonuses')
      .upsert(upserts.slice(i, i + 200), { onConflict: 'job_id,employee_id' })
    if (error) { console.error('syncJobBonuses upsert', error.message); break }
  }
  return { upserted: upserts.length, accruedTotal, pendingTotal }
}

// ── Display helpers ────────────────────────────────────────────────────
export function bonusStatusLabel(row) {
  if (row.status === 'paid') return { label: 'Paid', color: '#22c55e' }
  if (row.status === 'void') return { label: 'Void', color: '#7d8a7f' }
  if (row.status === 'accrued') return { label: 'Owed', color: '#8b5cf6' }
  return { label: 'Upcoming', color: '#f59e0b' } // pending
}
