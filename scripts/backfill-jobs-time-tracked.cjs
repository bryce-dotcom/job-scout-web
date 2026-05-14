// Recompute jobs.time_tracked from the actual time_clock totals for HHH.
// Some UI cards still display jobs.time_tracked directly; keeping it in
// sync with time_clock means those cards stop showing 0.
require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const APPLY = process.argv.includes('--apply')
;(async () => {
  const COMPANY_ID = 3
  // Get all jobs + sum time_clock total_hours per job
  const all = []
  for (let from = 0; ; from += 1000) {
    const r = await s.from('time_clock')
      .select('job_id,total_hours,clock_in,clock_out')
      .eq('company_id', COMPANY_ID)
      .not('clock_out', 'is', null)
      .not('job_id', 'is', null)
      .range(from, from + 999)
    if (r.error) { console.error(r.error); return }
    all.push(...r.data)
    if (r.data.length < 1000) break
  }
  console.log(`Fetched ${all.length} closed time_clock rows`)

  const hoursByJob = {}
  for (const row of all) {
    let h = parseFloat(row.total_hours)
    if (!(h > 0) && row.clock_in && row.clock_out) h = (new Date(row.clock_out) - new Date(row.clock_in)) / 36e5
    if (!(h > 0)) continue
    hoursByJob[row.job_id] = (hoursByJob[row.job_id] || 0) + h
  }
  const targets = Object.entries(hoursByJob).map(([job_id, h]) => ({ job_id: parseInt(job_id), hours: Math.round(h * 100) / 100 }))
  console.log(`Computed totals for ${targets.length} jobs`)

  // Compare to current jobs.time_tracked
  const ids = targets.map(t => t.job_id)
  const existing = []
  for (let from = 0; from < ids.length; from += 500) {
    const r = await s.from('jobs').select('id,job_id,job_title,time_tracked').in('id', ids.slice(from, from + 500))
    existing.push(...(r.data || []))
  }
  const existingMap = Object.fromEntries(existing.map(j => [j.id, j]))

  let mismatched = 0
  for (const t of targets) {
    const j = existingMap[t.job_id]
    if (!j) continue
    const current = Number(j.time_tracked || 0)
    if (Math.abs(current - t.hours) > 0.05) {
      mismatched++
      if (mismatched <= 10) console.log(`  #${j.id} ${(j.job_title||'').slice(0,40)}: ${current} -> ${t.hours}`)
    }
  }
  console.log(`\nMismatched: ${mismatched} of ${targets.length}`)

  if (!APPLY) { console.log('[DRY RUN] Pass --apply to write.'); return }
  // Apply in batches
  for (const t of targets) {
    const j = existingMap[t.job_id]
    if (!j) continue
    if (Math.abs(Number(j.time_tracked || 0) - t.hours) <= 0.05) continue
    await s.from('jobs').update({ time_tracked: t.hours }).eq('id', t.job_id)
  }
  console.log(`✓ Updated ${mismatched} jobs.`)
})()
