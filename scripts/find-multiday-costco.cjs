// Find Costco-related jobs whose start_date and end_date span multiple days
require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const { data: custs } = await s.from('customers').select('id, name').ilike('name', '%costco%').eq('company_id', 3)
  const ids = custs.map(c => c.id)
  const { data: jobs } = await s.from('jobs').select('id, job_id, job_title, status, start_date, end_date, recurrence').in('customer_id', ids).eq('company_id', 3).not('start_date', 'is', null)
  const multi = (jobs || []).filter(j => {
    if (!j.end_date) return false
    const sDay = new Date(j.start_date); sDay.setHours(0,0,0,0)
    const eDay = new Date(j.end_date); eDay.setHours(0,0,0,0)
    return eDay.getTime() > sDay.getTime()
  })
  console.log(`Multi-day Costco jobs (end_date > start_date by 1+ day): ${multi.length}`)
  console.table(multi.map(j => ({
    id: j.id, job_id: j.job_id, title: j.job_title, status: j.status,
    start: j.start_date, end: j.end_date,
    span_days: Math.round((new Date(j.end_date) - new Date(j.start_date)) / 86400000),
  })))
})()
