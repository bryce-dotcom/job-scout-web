const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const HCP_KEY = '44aecf944c03403fb58ee457ec657d0c'
const HCP_BASE = 'https://api.housecallpro.com'
const CID = 5

async function hcpGet(path) {
  for (let attempt = 0; attempt <= 5; attempt++) {
    const res = await fetch(HCP_BASE + path, {
      headers: { 'Authorization': 'Token ' + HCP_KEY, 'Accept': 'application/json' }
    })
    if (res.status === 429) {
      const wait = Math.min(3000 * Math.pow(2, attempt), 30000)
      process.stdout.write(' [429, ' + (wait / 1000) + 's]')
      await new Promise(r => setTimeout(r, wait))
      continue
    }
    if (!res.ok) return null
    return res.json()
  }
  return null
}

async function getAllRows(table, companyId, cols = '*') {
  const all = []
  let from = 0
  while (true) {
    const { data } = await sb.from(table).select(cols).eq('company_id', companyId).range(from, from + 999).order('id')
    if (!data || data.length === 0) break
    all.push(...data)
    from += data.length
    if (data.length < 1000) break
  }
  return all
}

// Map HCP work_status → JobScout status
function mapStatus(hcpStatus) {
  switch ((hcpStatus || '').toLowerCase()) {
    case 'needs scheduling': return 'Chillin'
    case 'scheduled': return 'Scheduled'
    case 'in progress': return 'In Progress'
    case 'complete': return 'Completed'
    case 'complete unrated': return 'Completed'
    case 'complete rated': return 'Completed'
    case 'pro canceled': return 'Cancelled'
    case 'canceled': return 'Cancelled'
    case 'unscheduled': return 'Chillin'
    default:
      console.log('  Unknown HCP status: "' + hcpStatus + '"')
      return 'Chillin'
  }
}

async function run() {
  console.log('=== Fixing Job Statuses from HCP ===\n')

  // 1. Fetch ALL HCP jobs
  console.log('1. Fetching HCP jobs...')
  const hcpJobs = []
  for (let p = 1; p <= 200; p++) {
    const data = await hcpGet('/jobs?page=' + p + '&page_size=200')
    if (!data || !data.jobs || data.jobs.length === 0) break
    hcpJobs.push(...data.jobs)
    if (p % 10 === 0) process.stdout.write('  ' + hcpJobs.length + ' jobs fetched...\r')
    // Small delay every 20 pages to avoid rate limit
    if (p % 20 === 0) await new Promise(r => setTimeout(r, 500))
  }
  console.log('  Total HCP jobs: ' + hcpJobs.length)

  // Show HCP status distribution
  const hcpCounts = {}
  for (const j of hcpJobs) {
    const s = j.work_status || 'unknown'
    hcpCounts[s] = (hcpCounts[s] || 0) + 1
  }
  console.log('\n  HCP status distribution:')
  Object.entries(hcpCounts).sort((a, b) => b[1] - a[1]).forEach(([s, c]) => console.log('    ' + s + ': ' + c))

  // 2. Get DB jobs in same insertion order
  console.log('\n2. Loading DB jobs...')
  const dbJobs = await getAllRows('jobs', CID, 'id, status')
  console.log('  DB jobs: ' + dbJobs.length)

  // 3. Map and update
  console.log('\n3. Updating statuses...')
  let updated = 0
  let skipped = 0
  const changeCounts = {}

  for (let i = 0; i < Math.min(hcpJobs.length, dbJobs.length); i++) {
    const hcp = hcpJobs[i]
    const db = dbJobs[i]
    const newStatus = mapStatus(hcp.work_status)

    if (db.status !== newStatus) {
      const key = db.status + ' → ' + newStatus
      changeCounts[key] = (changeCounts[key] || 0) + 1

      await sb.from('jobs').update({ status: newStatus }).eq('id', db.id)
      updated++
    } else {
      skipped++
    }

    if (i % 500 === 0 && i > 0) process.stdout.write('  ' + i + '/' + dbJobs.length + ' processed...\r')
  }

  console.log('\n  Updated: ' + updated)
  console.log('  Already correct: ' + skipped)
  console.log('\n  Changes:')
  Object.entries(changeCounts).sort((a, b) => b[1] - a[1]).forEach(([s, c]) => console.log('    ' + s + ': ' + c))

  // 4. Also update scheduled_start from HCP schedule data
  console.log('\n4. Fixing scheduled dates...')
  let datesFixed = 0
  for (let i = 0; i < Math.min(hcpJobs.length, dbJobs.length); i++) {
    const hcp = hcpJobs[i]
    const db = dbJobs[i]
    const schedStart = hcp.schedule?.scheduled_start || hcp.schedule?.start
    if (schedStart) {
      await sb.from('jobs').update({ scheduled_start: schedStart }).eq('id', db.id)
      datesFixed++
    }
    if (i % 500 === 0 && i > 0) process.stdout.write('  ' + i + '/' + dbJobs.length + ' dates...\r')
  }
  console.log('  Scheduled dates set: ' + datesFixed)

  // 5. Final status distribution
  console.log('\n5. Final DB status distribution:')
  const finalJobs = await getAllRows('jobs', CID, 'id, status')
  const finalCounts = {}
  for (const j of finalJobs) finalCounts[j.status] = (finalCounts[j.status] || 0) + 1
  Object.entries(finalCounts).sort((a, b) => b[1] - a[1]).forEach(([s, c]) => console.log('    ' + s + ': ' + c))

  console.log('\n══════════════════════════════════════')
  console.log('  JOB STATUS FIX COMPLETE')
  console.log('══════════════════════════════════════')
}

run().catch(err => { console.error('FAILED:', err); process.exit(1) })
