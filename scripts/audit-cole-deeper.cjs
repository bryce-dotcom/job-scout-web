// Deeper view: what kind of lead_ids does Cole have?
require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const COLE = 16

;(async () => {
  const { data: leads } = await s.from('leads')
    .select('id, lead_id, customer_name, business_name, status, created_at')
    .eq('company_id', 3).eq('salesperson_id', COLE)

  const buckets = { hcp: 0, internalCode: 0, nullCode: 0, other: 0 }
  leads.forEach(l => {
    if (!l.lead_id) buckets.nullCode++
    else if (l.lead_id.startsWith('LEAD-HCP-')) buckets.hcp++
    else if (l.lead_id.startsWith('LEAD-')) buckets.internalCode++
    else buckets.other++
  })
  console.log('Cole leads by lead_id pattern:')
  console.table(buckets)

  // Count quote/job attached for each bucket
  const ids = leads.map(l => l.id)
  const quotedIds = new Set()
  const jobbedIds = new Set()
  for (let i = 0; i < ids.length; i += 200) {
    const batch = ids.slice(i, i + 200)
    const [q, j] = await Promise.all([
      s.from('quotes').select('lead_id').in('lead_id', batch),
      s.from('jobs').select('lead_id').in('lead_id', batch),
    ])
    ;(q.data || []).forEach(r => quotedIds.add(r.lead_id))
    ;(j.data || []).forEach(r => jobbedIds.add(r.lead_id))
  }

  // Group by status × has-activity
  const matrix = {}
  leads.forEach(l => {
    const key = l.status
    if (!matrix[key]) matrix[key] = { total: 0, hasQuote: 0, hasJob: 0, clean: 0 }
    matrix[key].total++
    if (quotedIds.has(l.id)) matrix[key].hasQuote++
    if (jobbedIds.has(l.id)) matrix[key].hasJob++
    if (!quotedIds.has(l.id) && !jobbedIds.has(l.id)) matrix[key].clean++
  })
  console.log('\nCole leads by status × activity (clean = no quote, no job):')
  console.table(matrix)

  // Sample 20 "clean" Quote-Sent (these are weirdly tagged Quote Sent without an actual quote)
  const cleanQuoteSent = leads.filter(l => l.status === 'Quote Sent' && !quotedIds.has(l.id) && !jobbedIds.has(l.id)).slice(0, 20)
  console.log('\nSample "clean" Quote Sent (no quote attached) — likely junk:')
  console.table(cleanQuoteSent.map(l => ({
    id: l.id, lead_id: l.lead_id, customer: l.customer_name || l.business_name, created: l.created_at?.split('T')[0],
  })))

  // Sample 10 HCP-imported Appointment Set
  const hcpAppt = leads.filter(l => l.lead_id?.startsWith('LEAD-HCP-') && l.status === 'Appointment Set').slice(0, 15)
  console.log('\nSample HCP-imported Appointment Set:')
  console.table(hcpAppt.map(l => ({
    id: l.id, lead_id: l.lead_id, customer: l.customer_name || l.business_name,
    has_quote: quotedIds.has(l.id), has_job: jobbedIds.has(l.id),
  })))
})()
