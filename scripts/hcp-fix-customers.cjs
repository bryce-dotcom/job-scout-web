const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const CID = 5

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

async function run() {
  console.log('=== Fixing Invoice Customer IDs ===\n')

  // Get all invoices
  const invoices = await getAllRows('invoices', CID, 'id, customer_id, job_id')
  console.log('Total invoices: ' + invoices.length)
  console.log('With customer_id: ' + invoices.filter(i => i.customer_id).length)
  console.log('With job_id: ' + invoices.filter(i => i.job_id).length)

  // Get all jobs with customer_id
  const jobs = await getAllRows('jobs', CID, 'id, customer_id')
  const jobCustMap = new Map()
  for (const j of jobs) {
    if (j.customer_id) jobCustMap.set(j.id, j.customer_id)
  }
  console.log('Jobs with customer_id: ' + jobCustMap.size)

  // Fix invoices: get customer_id from linked job
  let fixed = 0
  for (const inv of invoices) {
    if (inv.customer_id) continue // already has one
    if (!inv.job_id) continue // no job to match from

    const custId = jobCustMap.get(inv.job_id)
    if (custId) {
      await sb.from('invoices').update({ customer_id: custId }).eq('id', inv.id)
      fixed++
    }
  }
  console.log('Fixed via job link: ' + fixed)

  // Check remaining
  const { count: stillNull } = await sb.from('invoices').select('id', { count: 'exact', head: true }).eq('company_id', CID).is('customer_id', null)
  console.log('Still null: ' + stillNull + '/' + invoices.length)
}

run().catch(console.error)
