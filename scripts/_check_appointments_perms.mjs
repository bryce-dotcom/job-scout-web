// Check that authenticated has DELETE on appointments. If not, that
// would explain Tracy's "delete won't actually delete" complaint.
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// All recent appointments + show full row to find what links to Cole
const { data: appts } = await supabase
  .from('appointments')
  .select('*')
  .eq('company_id', 3)
  .order('created_at', { ascending: false })
  .limit(15)
console.log('Recent HHH appointments:')
for (const a of appts || []) {
  const cols = Object.entries(a).filter(([k,v]) => v !== null && k !== 'created_at' && k !== 'updated_at').map(([k,v]) => `${k}=${typeof v === 'string' ? v.slice(0,30) : JSON.stringify(v)}`).join(' ')
  console.log(`  [${a.id}] ${cols}`)
}
