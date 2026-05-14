require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const JOB_ID = 23272
  const QUOTE_ID = 2723
  // Already have lines? skip
  const existing = await s.from('job_lines').select('id', { count: 'exact', head: true }).eq('job_id', JOB_ID)
  if (existing.count > 0) { console.log(`Job ${JOB_ID} already has ${existing.count} lines, skipping.`); return }

  const { data: qLines } = await s.from('quote_lines').select('*').eq('quote_id', QUOTE_ID).order('sort_order', { ascending: true })
  if (!qLines?.length) { console.log('No quote_lines to copy.'); return }

  const rows = qLines.map((ql, i) => ({
    company_id: ql.company_id,
    job_id: JOB_ID,
    item_id: ql.item_id,
    item_name: ql.item_name,
    description: ql.description,
    quantity: ql.quantity,
    price: ql.price,
    total: ql.line_total ?? ql.total,
    totals: ql.line_total ?? ql.total,
    discount: ql.discount || 0,
    labor_cost: ql.labor_cost || 0,
    photos: ql.photos,
    notes: ql.notes,
    kind: ql.kind,
    taxable: ql.taxable,
    unit_of_measure: ql.unit_of_measure,
    job_line_id: `JL-${JOB_ID}-${i + 1}`,
  }))
  const ins = await s.from('job_lines').insert(rows).select('id')
  if (ins.error) { console.error(ins.error); return }
  console.log(`✓ Inserted ${ins.data.length} job_lines on job ${JOB_ID}`)

  // Also set the job's customer_id from the quote's customer if missing
  const q = (await s.from('quotes').select('customer_id, summary, notes, estimate_message').eq('id', QUOTE_ID).single()).data
  const job = (await s.from('jobs').select('customer_id, details, notes').eq('id', JOB_ID).single()).data
  const patch = {}
  if (!job.customer_id && q.customer_id) patch.customer_id = q.customer_id
  const combinedDetails = [q.summary, q.notes, q.estimate_message].filter(Boolean).join('\n\n')
  if (!job.details && combinedDetails) patch.details = combinedDetails
  if (!job.notes && q.notes) patch.notes = q.notes
  if (Object.keys(patch).length) {
    await s.from('jobs').update(patch).eq('id', JOB_ID)
    console.log('✓ Backfilled job:', Object.keys(patch).join(', '))
  }
})()
