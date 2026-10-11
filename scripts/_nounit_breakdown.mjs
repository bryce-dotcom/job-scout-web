import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
import { getWeekRange } from '../src/lib/eosWeek.js'
import { calendarDay } from '../src/lib/localDate.js'
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const C = 3
async function page(t, s='*'){let o=[];for(let f=0;;f+=1000){const{data,error}=await sb.from(t).select(s).eq('company_id',C).order('id').range(f,f+999);if(error){console.log('ERR',error.message);return o}o=o.concat(data||[]);if(!data||data.length<1000)break}return o}
const [tc, jobsAll, emps] = await Promise.all([page('time_clock'), page('jobs','id, job_id, job_title, status, business_unit'), page('employees','id,name,role')])
const live = jobsAll.filter(j => j.status !== 'Archived')   // what the page sees
const liveById = new Map(live.map(j => [String(j.id), j]))
const allById = new Map(jobsAll.map(j => [String(j.id), j]))
const hoursOf = r => { const h=Number(r.total_hours); if(Number.isFinite(h)&&h>0)return h; if(r.clock_in&&r.clock_out)return Math.max(0,(new Date(r.clock_out)-new Date(r.clock_in))/36e5); return 0 }
const w = getWeekRange(1)
const wk = tc.filter(t => { const d = calendarDay(t.clock_in); return d >= w.startDate && d <= w.endDate })
const buckets = { noJob: [], jobArchived: [], jobNoUnit: [], ok: [] }
for (const t of wk) {
  if (!t.job_id) { buckets.noJob.push(t); continue }
  const j = liveById.get(String(t.job_id))
  if (!j) { buckets.jobArchived.push(t); continue }
  if (!j.business_unit || !String(j.business_unit).trim()) { buckets.jobNoUnit.push(t); continue }
  buckets.ok.push(t)
}
const sum = a => Math.round(a.reduce((s,t)=>s+hoursOf(t),0)*10)/10
console.log(`WEEK ${w.startDate}..${w.endDate} — ${Math.round(sum(wk))} hours clocked in total\n`)
console.log(`  on a job with a business unit      ${sum(buckets.ok)}h   (counted in the unit rows)`)
console.log(`  clocked in with NO job at all      ${sum(buckets.noJob)}h`)
console.log(`  on a job the page cannot see       ${sum(buckets.jobArchived)}h  (archived)`)
console.log(`  on a job that HAS no business unit ${sum(buckets.jobNoUnit)}h`)
const who = a => { const m={}; for(const t of a){const e=emps.find(x=>String(x.id)===String(t.employee_id)); const k=`${e?.name} (${e?.role})`; m[k]=(m[k]||0)+hoursOf(t)} return Object.entries(m).sort((a,b)=>b[1]-a[1]) }
console.log('\n  who clocked in with no job:'); who(buckets.noJob).forEach(([k,v])=>console.log(`    ${k}: ${Math.round(v*10)/10}h`))
console.log('\n  jobs with no business unit that took time this week:')
const byJob = {}
for (const t of buckets.jobNoUnit) { const j = liveById.get(String(t.job_id)); const k = `${j.job_id} — ${String(j.job_title||'').slice(0,40)}`; byJob[k]=(byJob[k]||0)+hoursOf(t) }
Object.entries(byJob).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log(`    ${k}: ${Math.round(v*10)/10}h`))
console.log('\n  archived jobs that took time this week:')
const byArch = {}
for (const t of buckets.jobArchived) { const j = allById.get(String(t.job_id)); const k = j?`${j.job_id} — ${String(j.job_title||'').slice(0,36)} [${j.status}]`:`job ${t.job_id} (not in table)`; byArch[k]=(byArch[k]||0)+hoursOf(t) }
Object.entries(byArch).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>console.log(`    ${k}: ${Math.round(v*10)/10}h`))
