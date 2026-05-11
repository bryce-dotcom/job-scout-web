// Look at HHH jobs with the same job_title to find recurring sets, see how
// many are missing lines, and if a sibling has lines that we could clone.
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const HHH = 3

// Schema check
const { data: cols } = await supabase.rpc('exec', {}).select('*').limit(1).then(()=>({})).catch(()=>({}))
// Try select * from one job to see columns
const { data: oneJob } = await supabase.from('jobs').select('*').eq('company_id', HHH).limit(1).single()
console.log('Job columns:', Object.keys(oneJob || {}).filter(k => k.includes('recur') || k.includes('parent') || k.includes('templat')).join(', '))

const { data: jobs } = await supabase
  .from('jobs')
  .select('id, job_id, job_title, customer_id, recurrence, job_total, start_date')
  .eq('company_id', HHH)
  .not('recurrence', 'is', null)
  .neq('recurrence', 'None')
  .limit(500)
console.log(`Jobs with recurrence set: ${jobs?.length || 0}`)

// Group by (customer_id, job_title) to find sets
const groups = new Map()
for (const j of jobs || []) {
  const key = `${j.customer_id}::${(j.job_title||'').trim().toLowerCase()}`
  if (!groups.has(key)) groups.set(key, [])
  groups.get(key).push(j)
}
console.log(`Distinct recurring sets: ${groups.size}`)

let canRecover = 0, sets = 0
for (const [key, set] of groups) {
  if (set.length < 2) continue
  sets++
  // Check which have lines
  const ids = set.map(s => s.id)
  const { data: lines } = await supabase.from('job_lines').select('job_id').in('job_id', ids)
  const linesByJob = new Map()
  for (const l of lines || []) linesByJob.set(l.job_id, (linesByJob.get(l.job_id)||0)+1)
  const withLines = set.filter(s => linesByJob.has(s.id))
  const without = set.filter(s => !linesByJob.has(s.id))
  if (withLines.length > 0 && without.length > 0) {
    canRecover += without.length
    if (sets <= 8) {
      const first = set[0]
      console.log(`  set "${first.job_title?.slice(0,40)}" cust=${first.customer_id}: ${withLines.length} with lines, ${without.length} without`)
    }
  }
}
console.log(`\nRecurring sets with mixed line presence: ${sets}`)
console.log(`Recoverable empty siblings: ${canRecover}`)
