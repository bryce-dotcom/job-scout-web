require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const expiresAt = new Date(Date.now() + 90 * 86400000).toISOString()
  const { data, error } = await s.from('beta_invite_codes').insert({
    code: 'ZACK-ANTONINO',
    max_uses: 1,
    times_used: 0,
    expires_at: expiresAt,
  }).select().single()

  if (error) {
    if (error.code === '23505') console.log('Code already exists')
    else console.error(error)
    return
  }
  console.log('Created invite code:')
  console.log('  code:', data.code)
  console.log('  max_uses:', data.max_uses)
  console.log('  expires:', data.expires_at?.split('T')[0])
})()
