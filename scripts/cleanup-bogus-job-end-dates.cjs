// Reset end_date for jobs where it's clearly the completion timestamp,
// not the scheduled end. Heuristic: status is terminal AND end_date is
// more than 1 day after start_date. We set end_date back to start_date
// so the calendar shows them as single-day events.
//
// Dry-run by default; pass --apply to actually update.
require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const TERMINAL = ['Completed', 'Verified Complete', 'Archived', 'Cancelled', 'Closed', 'Invoiced', 'Job Complete', 'Won', 'Done']
const APPLY = process.argv.includes('--apply')
const COMPANY_ID = 3

;(async () => {
  // Pull in batches; PostgREST limit is 1000
  const all = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await s.from('jobs')
      .select('id, job_id, job_title, status, start_date, end_date')
      .eq('company_id', COMPANY_ID)
      .in('status', TERMINAL)
      .not('end_date', 'is', null)
      .not('start_date', 'is', null)
      .range(from, from + 999)
    if (error) { console.error(error); process.exit(1) }
    if (!data?.length) break
    all.push(...data)
    if (data.length < 1000) break
  }
  console.log(`Pulled ${all.length} terminal-status jobs with both dates set.`)

  // Only flag spans > 7 days. 1-7 day spans are usually legitimate
  // multi-day installs that just happen to be in terminal status now.
  const SUSPECT_DAY_THRESHOLD = 7
  const bogus = all.filter(j => {
    const days = (new Date(j.end_date) - new Date(j.start_date)) / 86400000
    return days > SUSPECT_DAY_THRESHOLD
  })
  console.log(`-> ${bogus.length} have end_date > start_date + ${SUSPECT_DAY_THRESHOLD} days (suspect — likely completion-timestamp leak)`)

  // Group by span size for visibility
  const buckets = { '2-7d': 0, '8-30d': 0, '31-365d': 0, '>1yr': 0 }
  bogus.forEach(j => {
    const d = (new Date(j.end_date) - new Date(j.start_date)) / 86400000
    if (d <= 7) buckets['2-7d']++
    else if (d <= 30) buckets['8-30d']++
    else if (d <= 365) buckets['31-365d']++
    else buckets['>1yr']++
  })
  console.log('\nSpan distribution:')
  console.table(buckets)

  console.log('\nFirst 15 examples:')
  console.table(bogus.slice(0, 15).map(j => ({
    id: j.id, job_id: j.job_id, title: (j.job_title || '').slice(0, 40),
    status: j.status,
    start: j.start_date?.split('T')[0], end: j.end_date?.split('T')[0],
    span_days: Math.round((new Date(j.end_date) - new Date(j.start_date)) / 86400000),
  })))

  if (!APPLY) {
    console.log('\nDRY RUN. Pass --apply to set end_date := start_date for these jobs.')
    return
  }

  const ids = bogus.map(j => j.id)
  let updated = 0
  for (let i = 0; i < ids.length; i += 100) {
    const batch = bogus.slice(i, i + 100)
    // Update each row to set end_date := start_date (need per-row because each has a different start_date)
    await Promise.all(batch.map(j =>
      s.from('jobs').update({ end_date: j.start_date }).eq('id', j.id)
    ))
    updated += batch.length
    process.stdout.write(`\rUpdated ${updated}/${ids.length}`)
  }
  console.log(`\nDone. Reset end_date on ${updated} jobs.`)
})()
