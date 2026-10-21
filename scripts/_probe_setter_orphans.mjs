import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { strandedSetterFees, strandedTotal, matchSentence } from '../src/lib/setterOrphans.js'
config()
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const page = async (t, sel, f) => { const o=[]; for (let i=0;;i+=1000){ let q=s.from(t).select(sel).range(i,i+999); if(f) q=f(q); const {data,error}=await q; if(error){console.error(t,error.message);break} o.push(...(data||[])); if(!data||data.length<1000) break } return o }
const emps = await page('employees','id,name', q=>q.eq('company_id',3))
const tracy = emps.find(e => /tracy/i.test(e.name||''))
const comms = await page('lead_commissions','id,lead_id,employee_id,amount,commission_type,payment_status', q=>q.eq('company_id',3))
const leads = await page('leads','id,business_name,customer_name,phone,email,customer_id,quote_id,quote_amount', q=>q.eq('company_id',3))
const mine = comms.filter(c => c.employee_id === tracy.id)
const found = strandedSetterFees({ commissions: mine, leads })
console.log(`Tracy = ${tracy.name} (#${tracy.id})`)
console.log(`pending appointment fees: ${mine.filter(c=>c.payment_status==='pending'&&c.commission_type==='appointment_set').length}`)
console.log(`STRANDED: ${found.length} rows, $${strandedTotal(found).toFixed(2)}\n`)
const nm = (l) => (l.business_name || l.customer_name || ('lead '+l.id)).slice(0,26)
for (const r of found) console.log(`  $${String(r.commission.amount).padStart(6)}  lead ${String(r.lead.id).padEnd(6)} ${nm(r.lead).padEnd(27)} -> quoted on lead ${String(r.quotedLead.id).padEnd(6)} ${nm(r.quotedLead).padEnd(27)} (${matchSentence(r.how)})`)
// everyone else too
const others = emps.filter(e => e.id !== tracy.id)
let tot=0, rows=0
for (const e of others){ const f = strandedSetterFees({ commissions: comms.filter(c=>c.employee_id===e.id), leads }); if(f.length){ tot+=strandedTotal(f); rows+=f.length; console.log(`  (${e.name}: ${f.length} rows, $${strandedTotal(f).toFixed(2)})`) } }
console.log(`\nothers: ${rows} rows, $${tot.toFixed(2)}`)
