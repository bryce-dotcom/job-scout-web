// Task B: Investigate -N suffix phantom jobs
// Finds INSERT records in audit_log for the -N suffix jobs and looks at
// what jobs were created at the same timestamp to find the code path.
require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function main() {
  // Known -N suffix base IDs from the orphan scan
  const knownBases = ['8281','8365','8371','8692','8706','8710','8408','8359','8404','8405','8466','8467','8426','8417','7459','8280','8465','8737']

  // Pull ALL audit_log inserts for jobs (last 365 days) to look for patterns
  const { data: allInserts, error } = await s
    .from('audit_log')
    .select('record_id, new_values, new_data, created_at, user_email')
    .eq('table_name', 'jobs')
    .eq('action', 'INSERT')
    .gte('created_at', '2025-01-01')
    .order('created_at', { ascending: true })
    .limit(2000)

  if (error) { console.error('fetch failed:', error.message); process.exit(1) }

  const rows = (allInserts || []).map(r => ({
    uuid: r.record_id,
    job_id: (r.new_values || r.new_data || {}).job_id || '?',
    job_title: (r.new_values || r.new_data || {}).job_title || '?',
    status: (r.new_values || r.new_data || {}).status || '?',
    quote_id: (r.new_values || r.new_data || {}).quote_id || null,
    lead_id: (r.new_values || r.new_data || {}).lead_id || null,
    created_at: r.created_at,
    user_email: r.user_email || 'system'
  }))

  console.log(`\nTotal job INSERT records in audit_log: ${rows.length}`)

  // Find the suffix pattern jobs
  const suffixJobs = rows.filter(r => /-\d+$/.test(r.job_id) && /^\d/.test(r.job_id))
  console.log(`\nNumeric-base -N suffix jobs (INSERT): ${suffixJobs.length}`)
  suffixJobs.forEach(j => {
    console.log(`  ${j.job_id} "${j.job_title}" | quote_id=${j.quote_id} | created=${j.created_at?.slice(0,19)} | by=${j.user_email}`)
  })

  // For each suffix job, find what other jobs were created within 5 seconds
  console.log('\n═══════════════════════════════════════════════════')
  console.log('BATCH CREATION ANALYSIS (jobs created within 5s of each other)')
  console.log('═══════════════════════════════════════════════════')

  // Group by time windows
  const batches = {}
  for (const j of suffixJobs) {
    const t = new Date(j.created_at).getTime()
    const baseId = j.job_id.replace(/-\d+$/, '')
    if (!batches[baseId]) batches[baseId] = []
    batches[baseId].push(j)
  }

  for (const [baseId, group] of Object.entries(batches)) {
    if (group.length === 0) continue
    const firstTs = new Date(group[0].created_at).getTime()
    // Find all jobs created within 30 seconds of the first in this group
    const nearby = rows.filter(r => {
      const t = new Date(r.created_at).getTime()
      return Math.abs(t - firstTs) < 30000 && r.job_id.startsWith(baseId)
    })
    console.log(`\nBase ID: ${baseId}`)
    nearby.sort((a,b) => a.created_at.localeCompare(b.created_at))
    nearby.forEach(j => console.log(`  ${j.job_id} "${j.job_title}" | quote_id=${j.quote_id} | ${j.created_at?.slice(0,19)}`))
  }

  // Check if there's a base job (no suffix) for each
  console.log('\n═══════════════════════════════════════════════════')
  console.log('BASE JOB CHECK: Does the un-suffixed job exist?')
  console.log('═══════════════════════════════════════════════════')

  const baseIdsToCheck = [...new Set(suffixJobs.map(j => j.job_id.replace(/-\d+$/, '')))]
  for (const baseId of baseIdsToCheck) {
    // Check in live jobs table
    const { data: liveJob } = await s
      .from('jobs')
      .select('id, job_id, job_title, status, created_at')
      .eq('job_id', baseId)
      .maybeSingle()
    // Check in audit_log (inserts)
    const auditBase = rows.find(r => r.job_id === baseId)
    console.log(`  ${baseId}: live=${liveJob ? `YES (${liveJob.status})` : 'no'} | audit_insert=${auditBase ? 'YES' : 'no'}`)
  }

  // Cross-reference with quote_id to understand which estimate they came from
  const quoteIds = [...new Set(suffixJobs.map(j => j.quote_id).filter(Boolean))]
  if (quoteIds.length > 0) {
    console.log('\n═══════════════════════════════════════════════════')
    console.log('SOURCE ESTIMATES:')
    console.log('═══════════════════════════════════════════════════')
    const { data: quotes } = await s
      .from('quotes')
      .select('id, estimate_name, quote_amount, status, line_count:quote_lines(count)')
      .in('id', quoteIds)
    ;(quotes || []).forEach(q => console.log(`  Quote ${q.id} "${q.estimate_name}" $${q.quote_amount} status=${q.status} lines=${q.line_count?.[0]?.count}`))
  }

  // Look for any pattern in the current jobs table with -N suffix (live, not deleted)
  const { data: liveSuffixJobs } = await s
    .from('jobs')
    .select('id, job_id, job_title, status, created_at')
    .like('job_id', '%-_')
    .order('created_at', { ascending: false })
    .limit(20)

  console.log('\n═══════════════════════════════════════════════════')
  console.log('LIVE JOBS WITH SUFFIX PATTERN (still in DB):')
  console.log('═══════════════════════════════════════════════════')
  ;(liveSuffixJobs || []).forEach(j => console.log(`  ${j.job_id} "${j.job_title}" [${j.status}]`))

  console.log('\nDONE')
}

main().catch(e => { console.error(e); process.exit(1) })
