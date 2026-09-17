// Vercel cron — every morning, tell the driver what their machine needs.
//
// The schedule already knew a service was overdue; the Fleet page already
// counted it in a pill. Neither reached the person who actually drives the
// truck, who is the one person able to bring it in. This closes that gap
// through the app: one row in employee_notifications per schedule per state,
// read in Field Scout the next time they open it.
//
// Who is told: the assigned operator, if there is one. A machine with nobody
// assigned already shows on the manager's Fleet page; nagging the whole roster
// about it would make every notification easier to ignore.
//
// How often: once per schedule per state per week. The dedupe key carries the
// ISO week, so a truck that stays overdue is mentioned on Monday, not every
// morning. When "due soon" turns into "overdue" the state changes and it is
// said again, once — that transition is exactly the moment worth interrupting.
//
// Runs 13:00 UTC — 7am Mountain, before the day's first clock-in.

const { createClient } = require('@supabase/supabase-js')

function isoWeek(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  const day = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - day)
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return `${t.getUTCFullYear()}-W${String(Math.ceil(((t - y0) / 86400000 + 1) / 7)).padStart(2, '0')}`
}

const fmt = n => Math.abs(Math.round(Number(n))).toLocaleString('en-US')

module.exports = async function handler(req, res) {
  const isVercelCron = !!req.headers['x-vercel-cron-signature']
  const auth = req.headers['authorization'] || ''
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const expected = process.env.CRON_SECRET
  if (!isVercelCron && (!expected || bearer !== expected)) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return res.status(500).json({ error: 'supabase env missing' })

  try {
    const sb = createClient(url, key, { auth: { persistSession: false } })

    const { data: due, error: dueErr } = await sb
      .from('fleet_pm_status')
      .select('schedule_id, company_id, fleet_id, asset_name, name, status, days_remaining, meter_remaining')
      .in('status', ['overdue', 'due_soon'])
    if (dueErr) return res.status(500).json({ error: `fleet_pm_status: ${dueErr.message}` })
    if (!due?.length) return res.status(200).json({ ok: true, due: 0, notified: 0 })

    const fleetIds = [...new Set(due.map(d => d.fleet_id))]
    const { data: assets, error: aErr } = await sb
      .from('fleet')
      .select('id, assigned_to, meter_basis')
      .in('id', fleetIds)
    if (aErr) return res.status(500).json({ error: `fleet: ${aErr.message}` })
    const assetBy = new Map((assets || []).map(a => [a.id, a]))

    const week = isoWeek()
    const rows = []
    for (const d of due) {
      const a = assetBy.get(d.fleet_id)
      if (!a?.assigned_to) continue

      const unit = a.meter_basis === 'hours' ? 'hrs' : 'mi'
      const clocks = []
      if (d.days_remaining != null) {
        clocks.push(d.days_remaining < 0 ? `${fmt(d.days_remaining)} days overdue` : `due in ${fmt(d.days_remaining)} days`)
      }
      if (d.meter_remaining != null) {
        clocks.push(d.meter_remaining < 0 ? `${fmt(d.meter_remaining)} ${unit} overdue` : `${fmt(d.meter_remaining)} ${unit} to go`)
      }

      rows.push({
        company_id: d.company_id,
        employee_id: a.assigned_to,
        type: d.status === 'overdue' ? 'fleet_pm_overdue' : 'fleet_pm_due_soon',
        title: `${d.asset_name}: ${d.name} ${d.status === 'overdue' ? 'is overdue' : 'is due soon'}`,
        message: clocks.join(' · ') || null,
        route: `/fleet/${d.fleet_id}`,
        metadata: { schedule_id: d.schedule_id, fleet_id: d.fleet_id, status: d.status },
        dedupe_key: `pm:${d.schedule_id}:${d.status}:${week}`,
      })
    }

    if (!rows.length) return res.status(200).json({ ok: true, due: due.length, assigned: 0, notified: 0 })

    // Upsert on the dedupe index so the same week's row is a no-op. The
    // unique index is partial (dedupe_key IS NOT NULL), and every row here
    // carries a key, so the conflict target resolves.
    const { data: written, error: wErr } = await sb
      .from('employee_notifications')
      .upsert(rows, { onConflict: 'employee_id,dedupe_key', ignoreDuplicates: true })
      .select('id')
    if (wErr) return res.status(500).json({ error: `employee_notifications: ${wErr.message}` })

    return res.status(200).json({ ok: true, due: due.length, assigned: rows.length, notified: (written || []).length, week })
  } catch (err) {
    console.error('[fleet-pm-due]', err)
    return res.status(500).json({ error: err.message })
  }
}
