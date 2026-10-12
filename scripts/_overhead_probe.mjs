import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const C = 3
async function page(t,s='*'){let o=[];for(let f=0;;f+=1000){const{data,error}=await sb.from(t).select(s).eq('company_id',C).order('id').range(f,f+999);if(error){console.log('ERR',t,error.message);return o}o=o.concat(data||[]);if(!data||data.length<1000)break}return o}
const since = new Date(Date.now()-90*864e5).toISOString().slice(0,10)
const [plaid, exp, tc] = await Promise.all([page('plaid_transactions'), page('expenses'), page('time_clock','id,job_id,clock_in,total_hours')])
const money=n=>'$'+Math.round(n).toLocaleString()
const inWin = d => String(d||'').slice(0,10) >= since
const debits = plaid.filter(t=>Number(t.amount)>0 && !t.is_transfer && inWin(t.date))
const untagged = debits.filter(t=>!(t.job_id||t.ai_job_id))
const tagged = debits.filter(t=>(t.job_id||t.ai_job_id))
console.log(`last 90 days (since ${since})`)
console.log(`bank debits: ${debits.length} = ${money(debits.reduce((s,t)=>s+Number(t.amount),0))}`)
console.log(`  tagged to a job:   ${tagged.length} = ${money(tagged.reduce((s,t)=>s+Number(t.amount),0))}`)
console.log(`  NOT tagged:        ${untagged.length} = ${money(untagged.reduce((s,t)=>s+Number(t.amount),0))}`)
const cats={}; for(const t of untagged){const k=t.category||t.ai_category||'(uncategorised)';cats[k]=(cats[k]||0)+Number(t.amount)}
console.log('\nuntagged spend by category (top 18):')
Object.entries(cats).sort((a,b)=>b[1]-a[1]).slice(0,18).forEach(([k,v])=>console.log(`  ${k.padEnd(34)} ${money(v).padStart(11)}`))
const hrs = tc.filter(t=>t.job_id && inWin(t.clock_in)).reduce((s,t)=>s+(Number(t.total_hours)||0),0)
console.log(`\njob hours clocked in the same 90 days: ${Math.round(hrs)}`)
console.log(`untagged spend / job hour = ${money(untagged.reduce((s,t)=>s+Number(t.amount),0)/(hrs||1))} per hour  <-- raw, before excluding anything`)
