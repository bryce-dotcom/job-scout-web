require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const KEY = '44aecf944c03403fb58ee457ec657d0c'
const BASE = 'https://api.housecallpro.com'
const CID = 5
const HCP_CUST = 'cus_43f1c66fbbbc4c3788639b9e37261592' // Skaggs Catholic / Juan Diego
async function hcp(p) {
  const r = await fetch(BASE+p, { headers: { Authorization: 'Token '+KEY, Accept: 'application/json' } })
  if (!r.ok) { console.log('HCP', r.status, p); return null }
  return r.json()
}
;(async () => {
  // 1) JS side: any customer with that email or "skaggs"?
  const { data: js } = await sb.from('customers').select('id,name,email,address').eq('company_id', CID).or('email.eq.blakeyork@jdchs.org,name.ilike.%skaggs%,name.ilike.%catholic%')
  console.log('JS customers:', js?.length || 0)
  for (const c of (js||[])) {
    console.log(' -', c.id, c.name, '|', c.email, '|', c.address)
    const { data: jobs } = await sb.from('jobs').select('id,job_id,job_title,status,details').eq('company_id', CID).eq('customer_id', c.id)
    console.log('   jobs:', jobs?.length || 0)
    for (const j of (jobs||[])) {
      console.log('    JOB', j.id, j.job_id, j.status, '|', j.job_title)
      console.log('      details:', JSON.stringify(j.details||'').slice(0,150))
      const { data: ql } = await sb.from('job_lines').select('description,quantity,price').eq('job_id', j.id)
      console.log('      lines:', ql?.length||0)
      for (const l of (ql||[])) console.log('       ·', l.description, '| qty', l.quantity, '$', l.price)
    }
  }

  console.log('\n=== HCP estimates for Skaggs/JD ===')
  const ests = await hcp('/estimates?customer_id=' + HCP_CUST + '&page_size=20')
  for (const e of (ests?.estimates || [])) {
    console.log('\nEST', e.id, '|', e.estimate_number, '|', e.work_status, '| total $', ((e.total_amount||0)/100).toFixed(2))
    console.log('  description:', JSON.stringify(e.description||'').slice(0,200))
    console.log('  message:', JSON.stringify(e.message||'').slice(0,200))
    for (const opt of (e.options || [])) {
      console.log('  OPT', opt.id, '|', opt.name, '|', opt.status, '| approval:', opt.approval_status, '| $', ((opt.total_amount||0)/100).toFixed(2))
      console.log('    message:', JSON.stringify(opt.message||'').slice(0,200))
      let li = opt.line_items
      if (!li || !li.length) {
        const r = await hcp(`/estimates/${e.id}/options/${opt.id}/line_items`)
        li = r?.line_items || []
      }
      console.log('    LINE ITEMS:', li.length)
      for (const l of li) {
        console.log('     · keys:', Object.keys(l).join(','))
        console.log('       name:', JSON.stringify(l.name))
        console.log('       description:', JSON.stringify(l.description))
        console.log('       qty=', l.quantity, ' unit_price=', l.unit_price, ' unit_cost=', l.unit_cost, ' kind=', l.kind, ' taxable=', l.taxable)
      }
    }
  }

  console.log('\n=== HCP jobs for Skaggs/JD ===')
  const jobs = await hcp('/jobs?customer_id=' + HCP_CUST + '&page_size=20')
  for (const j of (jobs?.jobs || [])) {
    console.log('\nJOB', j.id, '|', j.invoice_number, '|', j.work_status)
    console.log('  description:', JSON.stringify(j.description||'').slice(0,200))
    console.log('  notes:', JSON.stringify(j.notes||'').slice(0,300))
    const li = (await hcp(`/jobs/${j.id}/line_items`))?.line_items || []
    console.log('  LINE ITEMS:', li.length)
    for (const l of li) {
      console.log('   · name=', JSON.stringify(l.name), '\n     description=', JSON.stringify(l.description), '\n     qty=', l.quantity, ' unit_price=', l.unit_price)
    }
    const att = await hcp(`/jobs/${j.id}/attachments`)
    console.log('  ATTACHMENTS resp keys:', att ? Object.keys(att).join(',') : 'null')
    if (att?.attachments?.length) {
      for (const a of att.attachments) console.log('    FILE keys:', Object.keys(a).join(','), '|', a.id, '|', a.file_name || a.name, '|', a.url || a.download_url)
    }
  }
})()
