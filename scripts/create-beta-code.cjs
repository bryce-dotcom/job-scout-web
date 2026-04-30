// Generate a beta invite code.
//
// Usage:
//   node scripts/create-beta-code.cjs <CODE> [maxUses] [expiresInDays] [notes]
//
// Examples:
//   node scripts/create-beta-code.cjs ACME-CO              # 1 use, 90 days, no notes
//   node scripts/create-beta-code.cjs ACME-CO 5            # 5 uses, 90 days
//   node scripts/create-beta-code.cjs ACME-CO 1 30 "Acme Industrial - Bryce intro"

require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const [, , code, maxUses = '1', expiresInDays = '90', notes = ''] = process.argv

if (!code) {
  console.error('Usage: node scripts/create-beta-code.cjs <CODE> [maxUses] [expiresInDays] [notes]')
  process.exit(1)
}

;(async () => {
  const expiresAt = expiresInDays === 'never'
    ? null
    : new Date(Date.now() + parseInt(expiresInDays) * 86400000).toISOString()

  const { data, error } = await s.from('beta_invite_codes').insert({
    code: code.toUpperCase().trim(),
    max_uses: parseInt(maxUses),
    times_used: 0,
    expires_at: expiresAt,
    notes: notes || null,
  }).select().single()

  if (error) {
    console.error('Failed:', error.message)
    process.exit(1)
  }

  console.log('Created invite code:')
  console.log(`  code:        ${data.code}`)
  console.log(`  max_uses:    ${data.max_uses}`)
  console.log(`  expires:     ${data.expires_at ? new Date(data.expires_at).toLocaleDateString() : 'never'}`)
  console.log(`  notes:       ${data.notes || '(none)'}`)
  console.log('')
  console.log('Send this to the tester:')
  console.log('')
  console.log(`  Sign up at https://jobscout.appsannex.com/login`)
  console.log(`  Click "Start Your Beta Trial"`)
  console.log(`  Use invite code: ${data.code}`)
})()
