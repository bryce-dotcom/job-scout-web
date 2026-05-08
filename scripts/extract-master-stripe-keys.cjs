// Pull HHH's existing Stripe keys (since 'use existing account' = HHH's
// Stripe acts as the JobScout master). Print them so we can wire them
// into Supabase secrets + Vercel env vars.
require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  const { data } = await s.from('settings')
    .select('value')
    .eq('company_id', 3)
    .eq('key', 'payment_config')
    .single()
  if (!data?.value) { console.log('No payment_config for HHH'); return }
  const cfg = typeof data.value === 'string' ? JSON.parse(data.value) : data.value
  console.log('Mode:           ', cfg.stripe_mode || '(unset)')
  console.log('Publishable:    ', cfg.stripe_publishable_key ? cfg.stripe_publishable_key.slice(0, 14) + '…' + cfg.stripe_publishable_key.slice(-4) : '(unset)')
  console.log('Secret:         ', cfg.stripe_secret_key ? cfg.stripe_secret_key.slice(0, 14) + '…' + cfg.stripe_secret_key.slice(-4) : '(unset)')
  console.log('Webhook secret: ', cfg.stripe_webhook_secret ? cfg.stripe_webhook_secret.slice(0, 14) + '…' + cfg.stripe_webhook_secret.slice(-4) : '(unset)')
  console.log('Enabled:        ', cfg.stripe_enabled === true ? 'YES' : 'no')

  // If keys present, write them to .env.local so the products script can run
  if (cfg.stripe_secret_key && cfg.stripe_publishable_key) {
    const fs = require('fs')
    const envPath = '.env.local'
    let env = ''
    try { env = fs.readFileSync(envPath, 'utf8') } catch { /* missing */ }
    const upsert = (k, v) => {
      if (!v) return
      const re = new RegExp('^' + k + '=.*$', 'm')
      if (re.test(env)) env = env.replace(re, `${k}=${v}`)
      else env += (env.endsWith('\n') || !env ? '' : '\n') + `${k}=${v}\n`
    }
    upsert('JOBSCOUT_MASTER_STRIPE_KEY', cfg.stripe_secret_key)
    upsert('JOBSCOUT_MASTER_STRIPE_PUBLISHABLE_KEY', cfg.stripe_publishable_key)
    fs.writeFileSync(envPath, env)
    console.log('\n✓ Written to .env.local (JOBSCOUT_MASTER_STRIPE_KEY + JOBSCOUT_MASTER_STRIPE_PUBLISHABLE_KEY)')
  }
})()
