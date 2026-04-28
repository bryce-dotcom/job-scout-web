// Pull Doug's recent feedback to work through.
require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

;(async () => {
  // Find Doug
  const { data: doug } = await s.from('employees')
    .select('id, name, email')
    .ilike('name', '%doug%')
    .eq('company_id', 3)
    .maybeSingle()
  console.log('Doug:', doug)

  // Pull all feedback from last 24h, sorted newest first
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const { data: fb, error } = await s.from('feedback')
    .select('*')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
  if (error) { console.error(error); return }
  console.log(`\n${fb.length} feedback rows in last 24h\n`)

  fb.forEach((f, i) => {
    console.log(`---[ ${i + 1} | ${f.id} | ${f.created_at} ]---`)
    console.log(`Status: ${f.status || '(none)'}    Type: ${f.type || '(none)'}    Page: ${f.page_url || f.page || '(none)'}`)
    console.log(`User: ${f.user_email || f.user_name || `emp_id=${f.employee_id}`}`)
    if (f.title) console.log(`Title: ${f.title}`)
    console.log(`Body: ${f.message || f.body || f.description || '(empty)'}`)
    if (f.screenshot_url) console.log(`Screenshot: ${f.screenshot_url}`)
    if (f.console_logs) console.log(`Console: ${typeof f.console_logs === 'string' ? f.console_logs.slice(0, 300) : JSON.stringify(f.console_logs).slice(0, 300)}`)
    console.log('')
  })
})()
