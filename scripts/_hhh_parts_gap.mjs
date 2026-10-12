import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
import { deliveredJobsInRange } from '../src/lib/jobMetrics.js'
import { getWeekRange } from '../src/lib/eosWeek.js'
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const C = 3
async function page(t, s='*', sc=true){let o=[];for(let f=0;;f+=1000){let q=sb.from(t).select(s).order('id').range(f,f+999);if(sc)q=q.eq('company_id',C);const{data,error}=await q;if(error){console.log('ERR',t,error.message);return o}o=o.concat(data||[]);if(!data||data.length<1000)break}return o}
const [jobs, lines, products, comps, st] = await Promise.all([
  page('jobs'), page('job_lines','id, job_id, item_id, item_name, quantity, kind'),
  page('products_services','id, name, cost, material_or_labor'),
  sb.from('product_components').select('*').then(r=>r.data||[]),
  sb.from('settings').select('value').eq('company_id',C).eq('key','job_statuses').then(r=>r.data)])
const live = jobs.filter(j=>j.status!=='Archived')
const js = JSON.parse(st?.[0]?.value||'[]')
const w = getWeekRange(1)
const prod = new Map(products.map(p=>[p.id,p]))
const byJob = new Map(); for(const l of lines){const k=String(l.job_id);byJob.set(k,[...(byJob.get(k)||[]),l])}
for (const ent of ['HHH Building Services','Energy Scout']) {
  const done = deliveredJobsInRange(live.filter(j=>j.business_unit?.toLowerCase()===ent.toLowerCase()), js, w.start, w.end)
  let noLines=0, lineCount=0, noItem=0, uncosted=0, costedLines=0
  const samples=[]
  for (const j of done) {
    const ls = byJob.get(String(j.id))||[]
    if(!ls.length){noLines++;continue}
    for(const l of ls){
      lineCount++
      if(l.item_id==null){noItem++;if(samples.length<5)samples.push(`typed line "${String(l.item_name||'').slice(0,34)}" on ${j.job_id}`);continue}
      const p=prod.get(l.item_id); const kids=comps.filter(c=>c.parent_product_id===l.item_id)
      const own=Number(p?.cost)||0
      const kid=kids.reduce((s,c)=>s+(Number(prod.get(c.component_product_id)?.cost)||0)*(Number(c.quantity)||1),0)
      if(own>0||kid>0)costedLines++; else {uncosted++; if(samples.length<5)samples.push(`"${String(p?.name||'?').slice(0,34)}" has no cost (on ${j.job_id})`)}
    }
  }
  console.log(`\n=== ${ent}: ${done.length} jobs completed ===`)
  console.log(`  jobs with NO lines:        ${noLines}`)
  console.log(`  lines total:               ${lineCount}`)
  console.log(`  lines typed by hand (no product): ${noItem}`)
  console.log(`  lines whose product has no cost:  ${uncosted}`)
  console.log(`  lines that do carry a cost:       ${costedLines}`)
  samples.forEach(s=>console.log('    e.g.', s))
}
