// Narrower scope: focus on jobs created from estimates AFTER the RLS rollout
// (May 1+ 2026) and check whether job_lines exist.
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const HHH = 3

// Pull recent jobs with quote_id (estimate→job conversions)
const { data: jobs } = await supabase
  .from('jobs')
  .select('id, job_id, job_title, job_total, quote_id, status, details, notes, created_at')
  .eq('company_id', HHH)
  .not('quote_id', 'is', null)
  .gte('created_at', '2026-04-01')
  .order('created_at', { ascending: false })
  .limit(200)

console.log(`Estimate→Job conversions since 2026-04-01: ${jobs?.length || 0}`)
let withLines = 0, withoutLines = 0, hasNotes = 0, missingNotes = 0
const broken = []
for (const j of jobs || []) {
  const { data: jl } = await supabase.from('job_lines').select('id').eq('job_id', j.id)
  const { data: ql } = await supabase.from('quote_lines').select('id').eq('quote_id', j.quote_id)
  const noLines = !jl?.length
  const quoteHasLines = ql?.length > 0
  if (noLines && quoteHasLines) {
    withoutLines++
    broken.push({ ...j, qlCount: ql.length })
  } else if (jl?.length > 0) {
    withLines++
  }
  if (j.details || j.notes) hasNotes++
  else missingNotes++
}
console.log(`  with lines: ${withLines}`)
console.log(`  WITHOUT lines but estimate had lines: ${withoutLines}`)
console.log(`  with details/notes: ${hasNotes}`)
console.log(`  WITHOUT details/notes: ${missingNotes}`)

console.log('\nBroken (no job_lines, but estimate had quote_lines):')
for (const j of broken.slice(0, 25)) {
  console.log(`  ${j.created_at?.slice(0,16)} job ${j.id} quote=${j.quote_id} qlines=${j.qlCount} $${j.job_total} ${j.job_title?.slice(0,40)}`)
}

// Check if convertToJob actually inserts work — try insert with service role on a broken one
if (broken[0]) {
  const j = broken[0]
  console.log(`\nAttempting service-role recovery on job ${j.id}...`)
  const { data: ql } = await supabase
    .from('quote_lines')
    .select('id, item_id, quantity, price, line_total, notes, photos')
    .eq('quote_id', j.quote_id)
  const rows = (ql||[]).map(l => ({
    company_id: HHH,
    job_id: j.id,
    item_id: l.item_id || null,
    quantity: l.quantity || 1,
    price: l.price || 0,
    total: l.line_total || 0,
    notes: l.notes || null,
    photos: l.photos || []
  }))
  const { data: ins, error: insErr } = await supabase.from('job_lines').insert(rows).select('id')
  if (insErr) {
    console.log(`  INSERT ERROR: ${insErr.message}`)
    console.log(`  Details: ${JSON.stringify(insErr)}`)
  } else {
    console.log(`  Recovery inserted ${ins.length} job_lines on job ${j.id} — UNDOING for safety`)
    // Roll back the test insert so we don't double-write later when we do the real fix
    for (const r of ins) await supabase.from('job_lines').delete().eq('id', r.id)
  }
}
