// Shared efficiency-bonus calculation + pay-period helpers.
// Used by both Payroll.jsx (admin view) and FieldScout.jsx (tech view)
// so every surface computes bonuses identically.

// ── Pay period window from payroll config ──────────────────────────────
// Mirrors the logic originally living inside Payroll.jsx (getCurrentPeriod)
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
  } else if (frequency === 'bi-weekly' || frequency === 'semi-monthly') {
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

// ── Efficiency bonus for a single employee ─────────────────────────────
// Uses job-level time_log entries to figure out total actual hours per job
// and who the crew was, then splits the (savedHours * rate) pool by skill
// weight. Returns { bonus, details[] }.
export function calculateEfficiencyBonus({
  employeeId,
  timeLogEntries = [],
  jobs = [],
  employees = [],
  skillLevels = [],
  payrollConfig = {},
}) {
  if (!payrollConfig.efficiency_bonus_enabled) return { bonus: 0, details: [] }

  const rate = payrollConfig.efficiency_bonus_rate || 25
  const companyCut = payrollConfig.company_bonus_cut_percent || 0
  const minSaved = payrollConfig.bonus_min_hours_saved || 0

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

    const bonusAmount = crewPool * (myWeight / totalWeight)
    totalBonus += bonusAmount
    details.push({
      jobId: job.job_id || job.id,
      jobTitle: job.job_title || job.customer_name || 'Job',
      allottedHours: job.allotted_time_hours,
      actualHours: totalActualHours,
      savedHours,
      crewSize: crewMemberIds.length,
      employeeShare: savedHours * (myWeight / totalWeight),
      bonusAmount,
      companyCut: companyShare,
      totalPool,
      crewPool,
    })
  })

  return { bonus: totalBonus, details }
}
