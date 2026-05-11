// Diagnose: are RLS / data loss reports real?
// 1. Check HHH employees: active flag, email match
// 2. Check Doug's recurring jobs — do job_lines exist for them?
// 3. Check Deseret Book (Alayda's example) — line items present?
// 4. Spot-check estimate→job conversions: how many jobs with quote_id have ZERO job_lines?
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const hhh = { id: 3, company_name: 'HHH Services, LLC' }
console.log('HHH company id:', hhh.id)

const { data: emps } = await supabase
  .from('employees')
  .select('id, name, email, active, role, company_id')
  .eq('company_id', hhh.id)
  .order('id')
console.log('\n=== HHH employees ===')
for (const e of emps || []) {
  console.log(`  ${e.id} ${e.active ? 'A' : '·'} ${(e.email||'').padEnd(35)} ${e.name}`)
}
const inactive = (emps||[]).filter(e => !e.active)
console.log(`Total: ${emps?.length || 0}, inactive: ${inactive.length}`)

// 2. Job lines coverage
const { data: jobs, error: jErr } = await supabase
  .from('jobs')
  .select('id, job_id, job_title, job_total, quote_id, status, created_at')
  .eq('company_id', hhh.id)
  .order('created_at', { ascending: false })
  .limit(1000)
if (jErr) console.error('jobs query err', jErr)
console.log('jobs returned', jobs?.length)

const jobIds = (jobs||[]).map(j => j.id)
const { data: jLines } = await supabase
  .from('job_lines')
  .select('id, job_id, total')
  .in('job_id', jobIds)

const linesByJob = new Map()
for (const l of jLines || []) {
  linesByJob.set(l.job_id, (linesByJob.get(l.job_id) || 0) + 1)
}

const noLines = (jobs||[]).filter(j => !linesByJob.has(j.id) && (parseFloat(j.job_total)||0) > 0)
console.log(`\n=== Jobs (last 500) ===`)
console.log(`  total: ${jobs?.length || 0}, with lines: ${linesByJob.size}, with $ but NO lines: ${noLines.length}`)
console.log(`\n=== Jobs with $ but no line items (last 20) ===`)
for (const j of noLines.slice(0, 20)) {
  console.log(`  job ${j.id} [${j.job_id}] ${(j.job_title||'').slice(0,40).padEnd(40)} $${j.job_total} status=${j.status} quote=${j.quote_id||'-'} created ${j.created_at?.slice(0,10)}`)
}

// 3. Conversion check: jobs WITH a quote_id, no job_lines, but quote HAS quote_lines
const noLinesWithQuote = noLines.filter(j => j.quote_id)
console.log(`\n=== Jobs from estimates with NO job_lines (but estimate may have lines) ===`)
let convertedButLost = 0
for (const j of noLinesWithQuote.slice(0, 10)) {
  const { data: ql } = await supabase
    .from('quote_lines')
    .select('id, line_total')
    .eq('quote_id', j.quote_id)
  if ((ql?.length||0) > 0) {
    convertedButLost++
    console.log(`  job ${j.id} [${j.job_id}] quote ${j.quote_id} has ${ql.length} quote_lines but ZERO job_lines`)
  }
}
console.log(`  convertedButLost = ${convertedButLost} of ${noLinesWithQuote.length} sampled`)

// 4. Recurring jobs check (try several columns; only ones that exist will return data)
const { data: recurring, error: recErr } = await supabase
  .from('jobs')
  .select('id, job_id, job_title, status')
  .eq('company_id', hhh.id)
  .ilike('job_title', '%recurring%')
  .limit(20)
if (recErr) console.error('recurring err', recErr)
console.log(`\n=== Jobs with "recurring" in title (first 20) ===`)
console.log(`  found: ${recurring?.length || 0}`)

// 5. Deseret Book specific
const { data: db } = await supabase
  .from('jobs')
  .select('id, job_id, job_title, job_total, quote_id, status, created_at')
  .eq('company_id', hhh.id)
  .ilike('job_title', '%deseret%')
  .limit(20)
console.log(`\n=== Deseret jobs ===`)
for (const j of db || []) {
  const lc = linesByJob.get(j.id) ?? '(not in 500-window)'
  console.log(`  ${j.id} [${j.job_id}] ${j.job_title} $${j.job_total} status=${j.status} lines=${lc} quote=${j.quote_id||'-'}`)
}
