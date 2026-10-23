// The day before every payday: rehearse the period and tell the office.
//
// docs/PAYROLL_PLAN.md step 6. For every company with a payroll schedule,
// if the next payday is tomorrow (or today, with no run yet), the period is
// run through the real engine, loader and guards on live data (lib/
// payrollRehearsal, bundled at build time), nothing is written but a notice
// to every HR user: would it run, what is worth a look, the totals against
// the last run, and the per-person lines. Alayda holds the total against
// her own number before pressing Run Payroll.
//
// Daily at 13:00 UTC (vercel.json). { company_id } in the body runs one
// company regardless of the calendar, for checking.

const { createClient } = require('@supabase/supabase-js')

module.exports = async function handler(req, res) {
  const isVercelCron = !!req.headers['x-vercel-cron-signature']
  const auth = req.headers['authorization'] || ''
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const expected = process.env.CRON_SECRET
  if (!isVercelCron && (!expected || bearer !== expected)) {
    return res.status(401).json({ error: 'unauthorized' })
  }
  let lib
  try { lib = require('../_lib/payrollRehearsal.bundle.cjs') } catch (e) {
    return res.status(500).json({ error: 'rehearsal bundle missing — scripts/build-rehearsal.mjs runs in npm run build', detail: e.message })
  }
  const { rehearsePayroll, rehearsalNotices, payrollConfigFor, nextPayday } = lib
  const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  const only = Number((req.body && req.body.company_id) || (req.query && req.query.company_id)) || null
  const today = new Date()
  const day = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
  const todayStr = day(today), tomorrowStr = day(tomorrow)

  const out = { ran: [], skipped: [], errors: [] }
  try {
    const { data: cfgRows, error } = await s.from('settings').select('company_id').eq('key', 'payroll_config')
    if (error) throw new Error(error.message)
    const companyIds = [...new Set((cfgRows || []).map(r => r.company_id))].filter(id => !only || id === only)
    for (const companyId of companyIds) {
      try {
        const cfg = await payrollConfigFor(s, companyId)
        if (!cfg || cfg.company.active === false) { out.skipped.push({ companyId, why: 'inactive' }); continue }
        const { payDate } = nextPayday(cfg.payrollConfig, today)
        if (!only && payDate !== tomorrowStr && payDate !== todayStr) { out.skipped.push({ companyId, why: `next payday ${payDate}` }); continue }
        if (payDate === todayStr) {
          // Already run today: nothing to rehearse.
          const { data: runs } = await s.from('payroll_runs').select('id').eq('company_id', companyId).eq('pay_date', payDate).limit(1)
          if (!only && runs && runs.length) { out.skipped.push({ companyId, why: 'already run' }); continue }
        }
        const r = await rehearsePayroll(s, { companyId, today })
        const rows = rehearsalNotices(r, { companyId, today })
        if (rows.length) {
          // The dedupe key carries the day, so a second pass the same day is
          // a duplicate, not a second notice.
          const { error: insErr } = await s.from('employee_notifications').insert(rows)
          if (insErr && insErr.code !== '23505') throw new Error(insErr.message)
        }
        out.ran.push({ companyId, payDate: r.payDate, gross: r.gross, stops: r.stops.length, warnings: r.warns.length, notified: rows.length })
      } catch (e) {
        out.errors.push({ companyId, error: e.message })
      }
    }
    return res.status(200).json(out)
  } catch (e) {
    return res.status(500).json({ error: e.message, ...out })
  }
}
