// Diagnose the Juan Diego fidelity gap.
// 1) Find his job(s) in JobScout (company 5 = HHH).
// 2) Show what we have in jobs.details / job_lines / quote_lines.
// 3) Hit HCP and pull the SAME estimate + job line items so we can
//    diff field-by-field. The expected smoking gun is `description`
//    on each line item — HCP stores window counts there, our importer
//    only kept `name`.
require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const HCP_KEY = '44aecf944c03403fb58ee457ec657d0c'
const HCP_BASE = 'https://api.housecallpro.com'
const CID = 5

async function hcp(path) {
  const r = await fetch(HCP_BASE + path, { headers: { Authorization: 'Token ' + HCP_KEY, Accept: 'application/json' } })
  if (!r.ok) { console.log('  HCP', r.status, path); return null }
  return r.json()
}

(async () => {
  // 1) Find Juan Diego customer + jobs in JobScout
  const { data: custs } = await sb.from('customers').select('id, name, email, phone').eq('company_id', CID).ilike('name', '%juan%diego%')
  console.log('JS customers matching "juan diego":', custs?.length || 0)
  for (const c of custs || []) console.log('  -', c.id, c.name, c.email)

  if (!custs?.length) return

  for (const c of custs) {
    const { data: jobs } = await sb.from('jobs').select('*').eq('company_id', CID).eq('customer_id', c.id)
    console.log('\nJobs for', c.name, '->', jobs?.length || 0)
    for (const j of jobs || []) {
      console.log('  JOB', j.id, j.job_id, '|', j.status, '|', j.job_title)
      console.log('    details:', JSON.stringify(j.details || '').slice(0, 200))
      const { data: lines } = await sb.from('job_lines').select('*').eq('job_id', j.id)
      console.log('    job_lines:', lines?.length || 0)
      for (const l of lines || []) console.log('     ·', l.description, '| qty', l.quantity, '| $', l.price)
      if (j.quote_id) {
        const { data: ql } = await sb.from('quote_lines').select('*').eq('quote_id', j.quote_id)
        console.log('    quote_lines:', ql?.length || 0)
        for (const l of ql || []) console.log('     ·', l.item_name, '| qty', l.quantity, '| $', l.price)
      }
    }
  }

  // 2) Search HCP customers for Juan Diego
  console.log('\n--- HCP side ---')
  const search = await hcp('/customers?q=' + encodeURIComponent('Juan Diego') + '&page_size=20')
  const hcpCusts = (search?.customers || []).filter(c => `${c.first_name||''} ${c.last_name||''} ${c.company||''}`.toLowerCase().includes('juan'))
  console.log('HCP customers matching:', hcpCusts.length)
  for (const c of hcpCusts) {
    console.log('  -', c.id, c.first_name, c.last_name, '|', c.company, '|', c.email)
    // estimates
    const ests = await hcp('/estimates?customer_id=' + c.id + '&page_size=50')
    for (const e of (ests?.estimates || [])) {
      console.log('    EST', e.id, '|', e.estimate_number, '|', e.work_status)
      for (const opt of (e.options || [])) {
        console.log('      OPT', opt.id, '|', opt.name, '|', opt.status, '| total $' + ((opt.total_amount||0)/100).toFixed(2))
        const li = opt.line_items || (await hcp(`/estimates/${e.id}/options/${opt.id}/line_items`))?.line_items || []
        for (const l of li) {
          console.log('        LINE keys:', Object.keys(l).join(','))
          console.log('         name=', JSON.stringify(l.name))
          console.log('         description=', JSON.stringify(l.description))
          console.log('         quantity=', l.quantity, ' unit_price=', l.unit_price, ' unit_cost=', l.unit_cost, ' kind=', l.kind, ' taxable=', l.taxable)
        }
      }
    }
    // jobs
    const jobs = await hcp('/jobs?customer_id=' + c.id + '&page_size=50')
    for (const j of (jobs?.jobs || [])) {
      console.log('    JOB', j.id, '|', j.invoice_number, '|', j.work_status, '|', j.description)
      console.log('      notes:', JSON.stringify(j.notes || '').slice(0, 200))
      const li = (await hcp(`/jobs/${j.id}/line_items`))?.line_items || []
      for (const l of li) {
        console.log('      LINE name=', JSON.stringify(l.name), 'desc=', JSON.stringify(l.description), 'qty=', l.quantity)
      }
      const att = await hcp(`/jobs/${j.id}/attachments`)
      console.log('      attachments resp keys:', att ? Object.keys(att) : 'null')
      if (att?.attachments) {
        for (const a of att.attachments) console.log('       FILE', a.id, '|', a.file_name || a.name, '|', a.url || a.download_url)
      }
    }
  }
})().catch(e => { console.error(e); process.exit(1) })
