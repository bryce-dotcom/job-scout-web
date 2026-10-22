// Does the nightly cron's freeze actually see these rows as paid?
// Replicates ONLY its read + skip decision. Writes nothing.
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
config()
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const CO = 3
const pageAll = async (t, sel, f) => { const o=[]; for(let i=0;;i+=1000){ let q=s.from(t).select(sel).range(i,i+999); if(f) q=f(q); const {data,error}=await q; if(error) throw new Error(t+': '+error.message); o.push(...(data||[])); if(!data||data.length<1000) break } return o }

// exactly the cron's query
const existing = await pageAll('job_bonuses','id,job_id,employee_id,status,accrued_at,needs_verification,verification_overridden_by', q=>q.eq('company_id',CO))
const existingByKey = new Map(existing.map(r => [`${r.job_id}|${r.employee_id}`, r]))

console.log('rows read by the cron:', existing.length)
console.log('distinct (job|employee) keys:', existingByKey.size)
const dupes = existing.length - existingByKey.size
console.log('rows LOST to duplicate keys:', dupes)

if (dupes > 0) {
  const seen = new Map()
  for (const r of existing) {
    const k = `${r.job_id}|${r.employee_id}`
    if (!seen.has(k)) seen.set(k, [])
    seen.get(k).push(r)
  }
  const collided = [...seen.entries()].filter(([,v]) => v.length > 1)
  console.log('\ncolliding keys:', collided.length)
  for (const [k, v] of collided.slice(0, 10)) {
    console.log(`  ${k}: ` + v.map(r => `#${r.id} ${r.status}`).join('  |  ') + `   -> map keeps #${v[v.length-1].id} (${v[v.length-1].status})`)
  }
  const maskedPaid = collided.filter(([,v]) => v.some(r=>r.status==='paid') && v[v.length-1].status !== 'paid')
  console.log(`\nkeys where a PAID row is masked by a later non-paid one: ${maskedPaid.length}`)
}
