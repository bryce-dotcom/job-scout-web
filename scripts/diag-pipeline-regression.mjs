// What did the pipelineLeadIds String() fix do to the board?
// BEFORE: has(j.lead_id) compared string-vs-number and was ALWAYS false, so
//         every fetched job was rendered as its own standalone card.
// AFTER:  jobs whose lead is on the board are no longer rendered separately.
// Read-only.
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url),'utf8')
  .split('\n').filter(l=>l.includes('=')&&!l.trim().startsWith('#'))
  .map(l=>{const i=l.indexOf('=');return [l.slice(0,i).trim(),l.slice(i+1).trim()]}))
const sb = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)
const CO = 3
const cutoff = new Date(2026,0,1).toISOString()
const TERMINAL = ['Completed','Verified Complete','Invoiced','Paid','Closed']

const { data: terminalJobs } = await sb.from('jobs')
  .select('id,job_id,job_title,status,job_total,lead_id,start_date,created_at')
  .eq('company_id',CO).in('status',TERMINAL)
  .or(`created_at.gte.${cutoff},start_date.gte.${cutoff},last_status_change_at.gte.${cutoff}`).limit(5000)

// Active jobs are fetched unconditionally by the page
const { data: statuses } = await sb.from('settings').select('value').eq('company_id',CO).eq('key','job_statuses').maybeSingle()
const { data: activeJobs } = await sb.from('jobs')
  .select('id,job_id,job_title,status,job_total,lead_id,start_date,created_at')
  .eq('company_id',CO).not('status','in',`(${TERMINAL.map(s=>`"${s}"`).join(',')})`).neq('status','Archived').limit(5000)

const standalone = [...(terminalJobs||[]), ...(activeJobs||[])]

// The leads the pipeline holds (normalized). Approximate: all non-archived leads.
const leads = []
for (let f=0;;f+=1000){
  const { data } = await sb.from('leads').select('id,status').eq('company_id',CO).order('id').range(f,f+999)
  leads.push(...(data||[])); if(!data||data.length<1000) break
}
const leadIds = new Set(leads.map(l=>String(l.id)))

const money = n => '$'+(Number(n)||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
const before = standalone.filter(j => !j.lead_id || true)          // has() always false -> ALL were orphans
const after  = standalone  // after the restore: every job renders

console.log(`jobs fetched for the board: ${standalone.length}`)
console.log(`  rendered as standalone cards BEFORE the fix: ${before.length}   ${money(before.reduce((s,j)=>s+(+j.job_total||0),0))}`)
console.log(`  rendered as standalone cards AFTER  the fix: ${after.length}   ${money(after.reduce((s,j)=>s+(+j.job_total||0),0))}`)
console.log(`  DISAPPEARED from the board: ${before.length-after.length}   ${money(before.reduce((s,j)=>s+(+j.job_total||0),0)-after.reduce((s,j)=>s+(+j.job_total||0),0))}`)

const gone = standalone.filter(j => j.lead_id && leadIds.has(String(j.lead_id)))
const byStage = new Map()
for (const j of gone){ const k=j.status||'(none)'; if(!byStage.has(k))byStage.set(k,{n:0,a:0}); const b=byStage.get(k); b.n++; b.a+=(+j.job_total||0) }
console.log('\nCards that vanished, by the stage they used to sit in:')
for (const [k,v] of [...byStage.entries()].sort((a,b)=>b[1].n-a[1].n))
  console.log(`  ${k.padEnd(24)} ${String(v.n).padStart(4)}  ${money(v.a).padStart(15)}`)

// Do those leads sit in a stage that would show the deal at all?
const leadStatus = new Map(leads.map(l=>[String(l.id), l.status]))
const ls = new Map()
for (const j of gone){ const k=leadStatus.get(String(j.lead_id))||'(unknown)'; ls.set(k,(ls.get(k)||0)+1) }
console.log('\n...and the stage their LEAD card now shows in instead:')
for (const [k,v] of [...ls.entries()].sort((a,b)=>b[1]-a[1]).slice(0,12)) console.log(`  ${String(k).padEnd(24)} ${v}`)
