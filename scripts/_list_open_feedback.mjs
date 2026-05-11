import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
const { data, error } = await supabase
  .from('feedback')
  .select('id, user_email, subject, message, page_url, status, created_at')
  .neq('status', 'resolved')
  .order('created_at', { ascending: false })
  .limit(50)
if (error) { console.error(error); process.exit(1) }
for (const f of data) {
  console.log(`\n[${f.id.slice(0,8)}] ${f.user_email} · ${f.subject || '-'} · ${f.status}`)
  console.log(`  url: ${f.page_url || '-'}`)
  console.log(`  msg: ${(f.message||'').slice(0,250)}`)
}
console.log(`\n${data.length} open tickets`)
