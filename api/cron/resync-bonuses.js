// Vercel cron — nightly re-sync of the job_bonuses ledger for every tenant.
//
// Why: the in-app bonus sync (Payroll) is PERIOD-SCOPED — it only refreshes the
// current pay period's jobs. A past-period job whose crew grows later (a second
// tech clocks in after the period rolled) leaves that bonus frozen at a stale
// crew-share (e.g. one worker credited the whole job's saved hours). This runs
// nightly, recomputes EVERY non-paid bonus from complete current data (all
// invoices/verifications, so accrued-vs-pending is right), and upserts —
// preserving `paid` rows (frozen) and admin verification-overrides. Uses the
// SAME computeJobBonusRows as Payroll/FieldScout, so the math can't diverge.
//
// Schedule: nightly (see vercel.json). maxDuration 300s.

const { createClient } = require('@supabase/supabase-js')

module.exports = async function handler(req, res) {
  const isVercelCron = !!req.headers['x-vercel-cron-signature']
  const auth = req.headers['authorization'] || ''
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const expected = process.env.CRON_SECRET
  if (!isVercelCron && (!expected || bearer !== expected)) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  try {
    // bonusCalc is pure ESM (0 imports) under src/ — dynamic-import it so the
    // nightly math is identical to what Payroll runs. No duplication, no drift.
    const { computeJobBonusRows, timeClockToJobHours } = await import('../../src/lib/bonusCalc.js')
    void timeClockToJobHours
    const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

    const pageAll = async (table, select, filter) => {
      const out = []
      for (let from = 0; ; from += 1000) {
        let q = s.from(table).select(select).range(from, from + 999)
        if (filter) q = filter(q)
        const { data, error } = await q
        if (error) throw new Error(`${table}: ${error.message}`)
        out.push(...(data || []))
        if (!data || data.length < 1000) break
      }
      return out
    }

    // Which tenants use efficiency bonuses.
    const settingsRows = await pageAll('settings', 'company_id,key,value', q => q.in('key', ['payroll_config', 'skill_levels']))
    const cfgByCo = new Map(), skillByCo = new Map()
    for (const r of settingsRows) {
      try {
        if (r.key === 'payroll_config') cfgByCo.set(r.company_id, JSON.parse(r.value))
        else if (r.key === 'skill_levels') skillByCo.set(r.company_id, JSON.parse(r.value))
      } catch { /* skip malformed */ }
    }
    const companies = [...cfgByCo.entries()].filter(([, c]) => c && c.efficiency_bonus_enabled).map(([id]) => id)

    const summary = []
    for (const CO of companies) {
      const payrollConfig = cfgByCo.get(CO) || {}
      const skillLevels = skillByCo.get(CO) || []
      const co = q => q.eq('company_id', CO)

      const [employees, jobs, timeRows, verRows, invoices, utils, pays] = await Promise.all([
        pageAll('employees', 'id,name,skill_level', co),
        pageAll('jobs', 'id,job_id,job_title,customer_name,allotted_time_hours', q => co(q).not('allotted_time_hours', 'is', null)),
        pageAll('time_clock', 'employee_id,job_id,total_hours,clock_in,clock_out,lunch_start,lunch_end', q => co(q).not('job_id', 'is', null)),
        pageAll('verification_reports', 'job_id,verification_type,score,status,created_at,voided', co),
        pageAll('invoices', 'id,job_id,amount,payment_status,updated_at,created_at', co),
        pageAll('utility_invoices', 'id,job_id,incentive_amount,amount,project_cost,payment_status', co),
        pageAll('payments', 'invoice_id,amount', co),
      ])
      const jobIdSet = new Set(jobs.map(j => j.id))
      const allPaymentsByInvoiceId = new Map()
      for (const p of pays) allPaymentsByInvoiceId.set(p.invoice_id, (allPaymentsByInvoiceId.get(p.invoice_id) || 0) + (parseFloat(p.amount) || 0))

      const verifiedJobIds = new Set(verRows.filter(r => r.verification_type === 'completion' && !r.voided && (Number(r.score) >= 60 || r.status === 'complete_ai_skipped')).map(r => r.job_id).filter(Boolean))
      const dailyVerifiedJobDays = new Set(verRows.filter(r => r.verification_type === 'daily' && r.created_at && r.job_id && !r.voided && (Number(r.score) >= 60 || r.status === 'complete_ai_skipped')).map(r => `${r.job_id}|${new Date(r.created_at).toISOString().split('T')[0]}`))

      const utilByJob = new Map()
      for (const u of utils) { if (!u.job_id) continue; if (!utilByJob.has(u.job_id)) utilByJob.set(u.job_id, []); utilByJob.get(u.job_id).push(u) }
      const jobPaymentStatus = new Map()
      const billedJobs = new Set([...invoices.filter(i => i.job_id).map(i => i.job_id), ...utilByJob.keys()])
      for (const jobId of billedJobs) {
        const stdInvs = invoices.filter(i => i.job_id === jobId)
        const us = utilByJob.get(jobId) || []
        const stdPaid = stdInvs.reduce((acc, inv) => acc + (inv.payment_status === 'Paid' ? (parseFloat(inv.amount) || 0) : (allPaymentsByInvoiceId.get(inv.id) || 0)), 0)
        const utilPaid = us.filter(u => u.payment_status === 'Paid').reduce((acc, u) => acc + (parseFloat(u.incentive_amount) || parseFloat(u.amount) || 0), 0)
        const total = (us.length && us.some(u => parseFloat(u.project_cost) > 0)) ? us.reduce((a, u) => a + (parseFloat(u.project_cost) || 0), 0) : stdInvs.reduce((a, inv) => a + (parseFloat(inv.amount) || 0), 0)
        jobPaymentStatus.set(jobId, { paid: stdPaid + utilPaid, total })
      }

      const existing = await pageAll('job_bonuses', 'id,job_id,employee_id,status,accrued_at,needs_verification,verification_overridden_by', co)
      const existingByKey = new Map(existing.map(r => [`${r.job_id}|${r.employee_id}`, r]))
      const jobsWithTime = new Set(timeRows.map(t => t.job_id).filter(j => jobIdSet.has(j)))

      const upserts = []
      let accrued = 0, pending = 0, frozen = 0
      for (const job of jobs) {
        if (!jobsWithTime.has(job.id)) continue
        const jobTime = timeRows.filter(t => t.job_id === job.id)
        const rows = computeJobBonusRows({ job, timeClockRows: jobTime, employees, skillLevels, payrollConfig, verifiedJobIds, dailyVerifiedJobDays, jobPaymentStatus })
        const moneyIn = (jobPaymentStatus.get(job.id)?.paid || 0) > 0.005
        for (const r of rows) {
          const ex = existingByKey.get(`${job.id}|${r.employee_id}`)
          if (ex && ex.status === 'paid') { frozen++; continue } // frozen — never recompute a paid bonus
          const status = moneyIn ? 'accrued' : 'pending'
          if (status === 'accrued') accrued++; else pending++
          // Preserve an admin verification release so the nightly run never re-flags it.
          const overridden = ex && ex.needs_verification === false && ex.verification_overridden_by
          upserts.push({
            company_id: CO, job_id: job.id, employee_id: r.employee_id,
            amount: r.amount, saved_hours: r.saved_hours, allotted_hours: r.allotted_hours,
            actual_hours: r.actual_hours, crew_size: r.crew_size,
            release_reason: overridden ? 'admin_override' : r.release_reason,
            needs_verification: overridden ? false : !!r.needs_verification,
            verification_overridden_by: overridden ? ex.verification_overridden_by : null,
            status,
            accrued_at: status === 'accrued' ? (ex && ex.accrued_at ? ex.accrued_at : new Date().toISOString()) : null,
            updated_at: new Date().toISOString(),
          })
        }
      }
      for (let i = 0; i < upserts.length; i += 200) {
        const { error } = await s.from('job_bonuses').upsert(upserts.slice(i, i + 200), { onConflict: 'job_id,employee_id' })
        if (error) throw new Error(`upsert co ${CO}: ${error.message}`)
      }
      summary.push({ company: CO, upserted: upserts.length, accrued, pending, frozenPaid: frozen })
    }

    return res.status(200).json({ ok: true, ranAt: new Date().toISOString(), companies: summary })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
