// List existing beta invite codes + show schema
require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const { data, error } = await s.from('beta_invite_codes')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) { console.error(error); return }
  console.log(`${data.length} beta invite codes total\n`)
  console.table(data.map(c => ({
    code: c.code,
    used: `${c.times_used}/${c.max_uses}`,
    expires: c.expires_at?.split('T')[0] || 'never',
    notes: c.notes,
    company: c.assigned_to || c.created_for || '—',
    created: c.created_at?.split('T')[0],
  })))
})()
