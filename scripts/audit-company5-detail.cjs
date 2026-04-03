const { createClient } = require('@supabase/supabase-js')
require('dotenv').config()
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const CID = 5

async function run() {
  // Sample jobs
  console.log('=== SAMPLE JOBS ===')
  const { data: jobs } = await sb.from('jobs').select('*').eq('company_id', CID).limit(5)
  for (const j of jobs) {
    console.log('\nJob', j.id, '|', j.job_id)
    console.log('  status:', j.status, '| customer_id:', j.customer_id, '| customer_name:', j.customer_name)
    console.log('  job_total:', j.job_total, '| job_title:', (j.job_title || '').slice(0, 60))
    console.log('  start_date:', j.start_date, '| end_date:', j.end_date)
    console.log('  address:', j.job_address || j.address)
    console.log('  details:', (j.details || '').slice(0, 80))
    console.log('  salesperson_id:', j.salesperson_id, '| quote_id:', j.quote_id)
  }

  // Sample quotes
  console.log('\n\n=== SAMPLE QUOTES ===')
  const { data: quotes } = await sb.from('quotes').select('*').eq('company_id', CID).limit(5)
  for (const q of quotes) {
    console.log('\nQuote', q.id, '|', q.quote_id)
    console.log('  status:', q.status, '| customer_id:', q.customer_id, '| lead_id:', q.lead_id)
    console.log('  quote_amount:', q.quote_amount, '| utility_incentive:', q.utility_incentive, '| discount:', q.discount)
    console.log('  service_type:', q.service_type, '| job_title:', q.job_title)
  }

  // Sample quote lines
  console.log('\n\n=== SAMPLE QUOTE LINES ===')
  const { data: qlines } = await sb.from('quote_lines').select('*').eq('company_id', CID).limit(10)
  for (const l of qlines) {
    console.log('  QL', l.id, '| quote_id:', l.quote_id, '| item_name:', l.item_name, '| qty:', l.quantity, '| price:', l.price, '| total:', l.total)
  }

  // Sample invoices
  console.log('\n\n=== SAMPLE INVOICES ===')
  const { data: invoices } = await sb.from('invoices').select('*').eq('company_id', CID).limit(5)
  for (const inv of invoices) {
    console.log('\nInvoice', inv.id, '|', inv.invoice_id)
    console.log('  amount:', inv.amount, '| payment_status:', inv.payment_status)
    console.log('  customer_id:', inv.customer_id, '| job_id:', inv.job_id)
    console.log('  job_description:', (inv.job_description || '').slice(0, 80))
  }

  // Sample payments
  console.log('\n\n=== SAMPLE PAYMENTS ===')
  const { data: payments } = await sb.from('payments').select('*').eq('company_id', CID).limit(5)
  for (const p of payments) {
    console.log('  PMT', p.id, '| invoice_id:', p.invoice_id, '| amount:', p.amount, '| method:', p.method, '| status:', p.status, '| date:', p.date)
  }

  // Sample job lines
  console.log('\n\n=== SAMPLE JOB LINES ===')
  const { data: jlines } = await sb.from('job_lines').select('*').eq('company_id', CID).limit(10)
  for (const l of jlines) {
    console.log('  JL', l.id, '| job_id:', l.job_id, '| desc:', (l.description || '').slice(0, 50), '| qty:', l.quantity, '| price:', l.price, '| total:', l.total)
  }

  // Check for zero amounts
  console.log('\n\n=== ZERO-AMOUNT CHECKS ===')
  const { count: zeroJobs } = await sb.from('jobs').select('id', { count: 'exact', head: true }).eq('company_id', CID).eq('job_total', 0)
  const { count: totalJobs } = await sb.from('jobs').select('id', { count: 'exact', head: true }).eq('company_id', CID)
  console.log('Jobs with job_total=0:', zeroJobs, '/', totalJobs)

  const { count: nullJobs } = await sb.from('jobs').select('id', { count: 'exact', head: true }).eq('company_id', CID).is('job_total', null)
  console.log('Jobs with job_total=null:', nullJobs)

  const { count: zeroQuotes } = await sb.from('quotes').select('id', { count: 'exact', head: true }).eq('company_id', CID).eq('quote_amount', 0)
  const { count: totalQuotes } = await sb.from('quotes').select('id', { count: 'exact', head: true }).eq('company_id', CID)
  console.log('Quotes with quote_amount=0:', zeroQuotes, '/', totalQuotes)

  const { count: zeroInv } = await sb.from('invoices').select('id', { count: 'exact', head: true }).eq('company_id', CID).eq('amount', 0)
  const { count: totalInv } = await sb.from('invoices').select('id', { count: 'exact', head: true }).eq('company_id', CID)
  console.log('Invoices with amount=0:', zeroInv, '/', totalInv)

  const { count: zeroPmt } = await sb.from('payments').select('id', { count: 'exact', head: true }).eq('company_id', CID).eq('amount', 0)
  const { count: totalPmt } = await sb.from('payments').select('id', { count: 'exact', head: true }).eq('company_id', CID)
  console.log('Payments with amount=0:', zeroPmt, '/', totalPmt)

  // Check HCP raw data to compare
  console.log('\n\n=== HCP RAW SAMPLE (for comparison) ===')
  const HCP_KEY = '44aecf944c03403fb58ee457ec657d0c'
  const res = await fetch('https://api.housecallpro.com/jobs?page=1&page_size=3', {
    headers: { 'Authorization': 'Token ' + HCP_KEY, 'Accept': 'application/json' }
  })
  const data = await res.json()
  for (const j of data.jobs) {
    console.log('\nHCP Job', j.id, '|', j.invoice_number)
    console.log('  total_amount:', j.total_amount, '(cents) = $' + ((j.total_amount || 0) / 100).toFixed(2))
    console.log('  outstanding_balance:', j.outstanding_balance)
    console.log('  work_status:', j.work_status)
    console.log('  description:', (j.description || '').slice(0, 60))
    console.log('  customer:', j.customer ? (j.customer.first_name + ' ' + j.customer.last_name) : 'none')
    console.log('  address:', JSON.stringify(j.address).slice(0, 100))
    console.log('  schedule:', j.schedule ? j.schedule.scheduled_start : 'none')
  }

  const res2 = await fetch('https://api.housecallpro.com/invoices?page=1&page_size=3', {
    headers: { 'Authorization': 'Token ' + HCP_KEY, 'Accept': 'application/json' }
  })
  const data2 = await res2.json()
  for (const inv of data2.invoices) {
    console.log('\nHCP Invoice', inv.id, '| status:', inv.status)
    console.log('  total_amount:', inv.total_amount, '(cents) = $' + ((inv.total_amount || 0) / 100).toFixed(2))
    console.log('  items:', (inv.items || []).length)
    if (inv.items && inv.items[0]) console.log('  first item:', inv.items[0].name, '| price:', inv.items[0].unit_price, '(cents)')
    console.log('  payments:', (inv.payments || []).length)
  }

  const res3 = await fetch('https://api.housecallpro.com/estimates?page=1&page_size=3', {
    headers: { 'Authorization': 'Token ' + HCP_KEY, 'Accept': 'application/json' }
  })
  const data3 = await res3.json()
  for (const est of data3.estimates) {
    console.log('\nHCP Estimate', est.id, '| work_status:', est.work_status)
    console.log('  options:', (est.options || []).length)
    for (const opt of (est.options || [])) {
      console.log('    option:', opt.name, '| total:', opt.total, '(cents) = $' + ((opt.total || 0) / 100).toFixed(2), '| status:', opt.status, '| approval:', opt.approval_status)
    }
  }
}

run().catch(console.error)
