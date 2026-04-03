/**
 * fix-invoice-dates.cjs — Fix invoice and payment dates using HCP invoice_number matching
 */
require('dotenv').config()
const sb = require('@supabase/supabase-js').createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const HCP_KEY = '44aecf944c03403fb58ee457ec657d0c'
const CID = 3

async function hcpGetAll(path, key) {
  const all = []
  for (let p = 1; p <= 200; p++) {
    const res = await fetch('https://api.housecallpro.com' + path + (path.includes('?') ? '&' : '?') + 'page=' + p + '&page_size=200', {
      headers: { 'Authorization': 'Token ' + HCP_KEY, 'Accept': 'application/json' }
    })
    if (res.status === 429) { await new Promise(r => setTimeout(r, 3000)); p--; continue }
    const data = await res.json()
    if (!data[key] || data[key].length === 0) break
    all.push(...data[key])
    if (p % 10 === 0) process.stdout.write('  ' + all.length + ' ' + key + '...\r')
  }
  console.log('  Fetched ' + all.length + ' ' + key)
  return all
}

async function run() {
  console.log('═══ Fix Invoice & Payment Dates ═══\n')

  // Pull ALL HCP invoices
  console.log('1. Pulling HCP invoices...')
  const hcpInvoices = await hcpGetAll('/invoices', 'invoices')

  // Build HCP invoice_number → original dates + payments
  const hcpByNumber = new Map()
  for (const h of hcpInvoices) {
    if (h.invoice_number) {
      hcpByNumber.set(h.invoice_number, {
        invoice_date: h.invoice_date || h.service_date || h.created_at,
        service_date: h.service_date,
        paid_at: h.paid_at,
        payments: h.payments || [],
        amount_cents: h.amount,
      })
    }
  }
  console.log('  HCP invoices with number: ' + hcpByNumber.size)

  // Load JS invoices
  let jsInvoices = [], from = 0
  while (true) {
    const { data } = await sb.from('invoices').select('id,invoice_id,amount,created_at').eq('company_id', CID).range(from, from + 999)
    if (!data || !data.length) break
    jsInvoices.push(...data); from += data.length
    if (data.length < 1000) break
  }
  console.log('  JS invoices: ' + jsInvoices.length)

  // Match by invoice_id → invoice_number
  let invFixed = 0
  for (const jsInv of jsInvoices) {
    if (!jsInv.invoice_id) continue
    const hcp = hcpByNumber.get(jsInv.invoice_id)
    if (!hcp || !hcp.invoice_date) continue

    // Only update if created_at is an import date
    if (jsInv.created_at && (jsInv.created_at.startsWith('2026-01') || jsInv.created_at.startsWith('2026-02') || jsInv.created_at.startsWith('2026-03') || jsInv.created_at.startsWith('2026-04'))) {
      await sb.from('invoices').update({
        created_at: hcp.invoice_date,
        updated_at: hcp.paid_at || hcp.invoice_date
      }).eq('id', jsInv.id)
      invFixed++
    }
  }
  console.log('  Invoice dates fixed: ' + invFixed)

  // Now fix payment dates based on corrected invoice dates
  console.log('\n2. Fixing payment dates from corrected invoices...')
  let jsPayments = []; from = 0
  while (true) {
    const { data } = await sb.from('payments').select('id,date,invoice_id,job_id').eq('company_id', CID).range(from, from + 999)
    if (!data || !data.length) break
    jsPayments.push(...data); from += data.length
    if (data.length < 1000) break
  }

  // Only fix payments whose date is in 2026 (import artifact) or null
  const needsFix = jsPayments.filter(p => !p.date || (p.date && p.date.startsWith('2026')))
  console.log('  Payments needing date fix: ' + needsFix.length)

  // Cache invoice dates to avoid repeated lookups
  const invDateCache = new Map()
  let payFixed = 0

  for (let i = 0; i < needsFix.length; i++) {
    const pay = needsFix[i]
    if (i % 500 === 0 && i > 0) process.stdout.write('  ' + i + '/' + needsFix.length + '...\r')

    let newDate = null

    // Try invoice
    if (pay.invoice_id) {
      if (invDateCache.has(pay.invoice_id)) {
        newDate = invDateCache.get(pay.invoice_id)
      } else {
        const { data: inv } = await sb.from('invoices').select('created_at').eq('id', pay.invoice_id).single()
        if (inv) {
          newDate = inv.created_at?.split('T')[0] || null
          invDateCache.set(pay.invoice_id, newDate)
        }
      }
    }

    // Try job start_date
    if (!newDate && pay.job_id) {
      const { data: job } = await sb.from('jobs').select('start_date').eq('id', pay.job_id).single()
      if (job && job.start_date) newDate = job.start_date.split('T')[0]
    }

    if (newDate && !newDate.startsWith('2026-01') && !newDate.startsWith('2026-02') && !newDate.startsWith('2026-03')) {
      await sb.from('payments').update({ date: newDate }).eq('id', pay.id)
      payFixed++
    }
  }
  console.log('\n  Payment dates fixed: ' + payFixed)

  // Also fix job updated_at for completed jobs
  console.log('\n3. Fixing completed job updated_at...')
  let allJobs = []; from = 0
  while (true) {
    const { data } = await sb.from('jobs').select('id,status,start_date,end_date,updated_at').eq('company_id', CID).eq('status', 'Completed').range(from, from + 999)
    if (!data || !data.length) break
    allJobs.push(...data); from += data.length
    if (data.length < 1000) break
  }

  let jobFixed = 0
  for (const j of allJobs) {
    if (!j.updated_at) continue
    // Only fix if updated_at is 2026 import date
    if (j.updated_at.startsWith('2026-01') || j.updated_at.startsWith('2026-02') || j.updated_at.startsWith('2026-03') || j.updated_at.startsWith('2026-04')) {
      const betterDate = j.end_date || j.start_date
      if (betterDate) {
        await sb.from('jobs').update({ updated_at: betterDate }).eq('id', j.id)
        jobFixed++
      }
    }
  }
  console.log('  Job updated_at fixed: ' + jobFixed)

  // Verification
  console.log('\n═══ VERIFICATION ═══')
  const { data: pSample } = await sb.from('payments').select('date').eq('company_id', CID).not('date', 'is', null).limit(2000)
  const pYears = {}
  ;(pSample || []).forEach(p => { const y = (p.date || '').slice(0, 4); pYears[y] = (pYears[y] || 0) + 1 })
  console.log('Payment years (sample 2000):', JSON.stringify(pYears))

  const { data: iSample } = await sb.from('invoices').select('created_at').eq('company_id', CID).limit(2000)
  const iYears = {}
  ;(iSample || []).forEach(i => { const y = (i.created_at || '').slice(0, 4); iYears[y] = (iYears[y] || 0) + 1 })
  console.log('Invoice years (sample 2000):', JSON.stringify(iYears))

  const { data: jSample } = await sb.from('jobs').select('updated_at').eq('company_id', CID).eq('status', 'Completed').limit(2000)
  const jYears = {}
  ;(jSample || []).forEach(j => { const y = (j.updated_at || '').slice(0, 4); jYears[y] = (jYears[y] || 0) + 1 })
  console.log('Completed job updated_at years (sample 2000):', JSON.stringify(jYears))

  console.log('\n═══ DONE ═══')
}
run().catch(e => { console.error('FATAL:', e); process.exit(1) })
