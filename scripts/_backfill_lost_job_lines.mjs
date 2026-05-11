// Backfill: any job in HHH that has a quote_id where the quote has
// quote_lines but the job has zero job_lines — copy them over.
// Surfaces what it does so we have an audit trail.
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const HHH = 3
const APPLY = process.argv.includes('--apply')

console.log(APPLY ? 'APPLY MODE — writing job_lines' : 'DRY RUN — pass --apply to actually write')

const { data: jobs } = await supabase
  .from('jobs')
  .select('id, job_id, job_title, job_total, quote_id, status, created_at, customer_id')
  .eq('company_id', HHH)
  .not('quote_id', 'is', null)
  .order('created_at', { ascending: false })
  .limit(2000)

let recovered = 0, examined = 0, totalLines = 0
for (const j of jobs || []) {
  examined++
  const { data: existing } = await supabase
    .from('job_lines')
    .select('id')
    .eq('job_id', j.id)
  if ((existing?.length || 0) > 0) continue

  // Truly empty — does the estimate have lines?
  const { data: ql } = await supabase
    .from('quote_lines')
    .select('id, item_id, quantity, price, line_total, notes, photos')
    .eq('quote_id', j.quote_id)
  if (!ql?.length) continue

  console.log(`  ${j.created_at?.slice(0,10)} job ${j.id} [${j.job_id}] ${j.job_title?.slice(0,40)}`)
  console.log(`    quote ${j.quote_id} has ${ql.length} lines — would insert`)
  if (APPLY) {
    const rows = ql.map(l => ({
      company_id: HHH,
      job_id: j.id,
      item_id: l.item_id || null,
      quantity: l.quantity || 1,
      price: l.price || 0,
      total: l.line_total || 0,
      notes: l.notes || null,
      photos: l.photos || [],
    }))
    const { data, error } = await supabase.from('job_lines').insert(rows).select('id')
    if (error) console.error(`    INSERT FAILED:`, error.message)
    else {
      recovered++
      totalLines += data.length
      console.log(`    inserted ${data.length} job_lines`)
    }
  }
}

console.log(`\nExamined ${examined} jobs · would recover ${recovered} jobs / ${totalLines} lines`)
