// One-shot: create the master-stripe-webhook endpoint on HHH's Stripe
// account and persist the signing secret as a Supabase Edge Function
// secret. Idempotent — re-uses an existing endpoint if one exists at
// the same URL.

require('dotenv').config({ path: '.env.local' })
require('dotenv').config()
const { execSync } = require('child_process')

const STRIPE_KEY = process.env.JOBSCOUT_MASTER_STRIPE_KEY
if (!STRIPE_KEY) { console.error('Missing JOBSCOUT_MASTER_STRIPE_KEY'); process.exit(1) }

const ENDPOINT_URL = 'https://tzrhfhisdeahrrmeksif.supabase.co/functions/v1/master-stripe-webhook'
const EVENTS = [
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_failed',
  'invoice.payment_succeeded',
]

async function stripe(method, path, body) {
  const opts = {
    method,
    headers: { Authorization: `Bearer ${STRIPE_KEY}` },
  }
  if (body) {
    opts.headers['Content-Type'] = 'application/x-www-form-urlencoded'
    opts.body = new URLSearchParams(body).toString()
  }
  const res = await fetch(`https://api.stripe.com/v1/${path}`, opts)
  const json = await res.json()
  if (!res.ok) throw new Error(`Stripe ${method} ${path}: ${json.error?.message}`)
  return json
}

;(async () => {
  console.log('Looking for existing webhook endpoint at', ENDPOINT_URL, '...')
  const list = await stripe('GET', 'webhook_endpoints?limit=100')
  const existing = (list.data || []).find(e => e.url === ENDPOINT_URL)

  let endpoint
  let signingSecret = null
  if (existing) {
    console.log('  found existing endpoint:', existing.id)
    // Update events list to be sure it covers all 5
    const params = new URLSearchParams()
    EVENTS.forEach(ev => params.append('enabled_events[]', ev))
    const updated = await fetch(`https://api.stripe.com/v1/webhook_endpoints/${existing.id}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    }).then(r => r.json())
    endpoint = updated
    console.log('  updated event list — events now:', endpoint.enabled_events.length)
    console.log('  NOTE: cannot retrieve signing secret of an existing endpoint via API.')
    console.log('       Get it from: https://dashboard.stripe.com/webhooks/' + existing.id)
  } else {
    console.log('  creating new endpoint...')
    const params = new URLSearchParams({
      url: ENDPOINT_URL,
      description: 'JobScout master subscription lifecycle (auto-created)',
    })
    EVENTS.forEach(ev => params.append('enabled_events[]', ev))
    endpoint = await stripe('POST', 'webhook_endpoints', Object.fromEntries(params))
    signingSecret = endpoint.secret
    console.log('  created endpoint:', endpoint.id)
    console.log('  signing secret captured (only shown on creation)')
  }

  if (signingSecret) {
    console.log('\nSetting MASTER_STRIPE_WEBHOOK_SECRET in Supabase Edge Function Secrets...')
    try {
      execSync(`npx supabase secrets set MASTER_STRIPE_WEBHOOK_SECRET=${signingSecret} --project-ref tzrhfhisdeahrrmeksif`, { stdio: 'inherit' })
      console.log('✓ Done.')
    } catch (e) {
      console.log('  (CLI failed; set it manually via Supabase Dashboard or `npx supabase secrets set`.)')
      console.log('  Signing secret:', signingSecret)
    }
  } else {
    console.log('\nReminder: signing secret is only returned on creation. Since this endpoint already existed,')
    console.log('reveal it from the Stripe Dashboard URL above and set MASTER_STRIPE_WEBHOOK_SECRET manually.')
  }
})().catch(err => {
  console.error('FAILED:', err.message)
  process.exit(1)
})
