// One-shot: create the JobScout subscription Products + Prices in
// Stripe (master account). Idempotent — safe to re-run.
//
// Reads the plan config from src/lib/billingPlans.js and creates:
//   - One Stripe Product per plan
//   - Two Prices per plan (monthly + annual)
//
// Stores the resulting Product/Price IDs in the `system_settings`
// table under key='billing_plan_stripe_ids' so the runtime can look
// them up without re-hitting Stripe.
//
// Usage:
//   1. Add JOBSCOUT_MASTER_STRIPE_KEY to .env.local
//   2. node scripts/setup-stripe-products.cjs
//
// Output prints:
//   Field Crew     prod_XXX  price_99/mo=price_AAA  price_990/yr=price_BBB
//   Field Pro      prod_YYY  ...
//   Field Boss     prod_ZZZ  ...

// Read both .env and .env.local so the master Stripe key (added by
// extract-master-stripe-keys.cjs) is picked up.
require('dotenv').config({ path: '.env.local' })
require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')

const STRIPE_KEY = process.env.JOBSCOUT_MASTER_STRIPE_KEY
if (!STRIPE_KEY) {
  console.error('ERROR: Set JOBSCOUT_MASTER_STRIPE_KEY in .env.local first.')
  process.exit(1)
}

// Mirrors src/lib/billingPlans.js — keep in sync.
const PLANS = [
  { id: 'field_crew', name: 'Field Crew', monthly_price: 99,  annual_price: 990 },
  { id: 'field_pro',  name: 'Field Pro',  monthly_price: 249, annual_price: 2490 },
  { id: 'field_boss', name: 'Field Boss', monthly_price: 599, annual_price: 5990 },
]

async function stripe(path, body) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body).toString(),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(`Stripe ${path}: ${json.error?.message}`)
  return json
}

async function stripeGet(path, query = {}) {
  const url = new URL(`https://api.stripe.com/v1/${path}`)
  Object.entries(query).forEach(([k, v]) => url.searchParams.set(k, v))
  const res = await fetch(url, { headers: { Authorization: `Bearer ${STRIPE_KEY}` } })
  const json = await res.json()
  if (!res.ok) throw new Error(`Stripe GET ${path}: ${json.error?.message}`)
  return json
}

async function findOrCreateProduct(plan) {
  // Look for an existing product with metadata.jobscout_plan_id = plan.id
  const list = await stripeGet('products', { 'limit': 100, 'active': 'true' })
  const existing = (list.data || []).find(p => p.metadata?.jobscout_plan_id === plan.id)
  if (existing) {
    console.log(`  found existing product ${existing.id}`)
    return existing
  }
  console.log(`  creating product...`)
  return stripe('products', {
    name: plan.name,
    description: `${plan.name} — JobScout subscription`,
    'metadata[jobscout_plan_id]': plan.id,
  })
}

async function findOrCreatePrice(productId, planId, dollarAmount, interval) {
  const list = await stripeGet('prices', { product: productId, limit: 100, active: 'true' })
  const intervalKey = interval === 'year' ? 'yearly' : 'monthly'
  const existing = (list.data || []).find(p =>
    p.recurring?.interval === interval &&
    p.unit_amount === dollarAmount * 100 &&
    p.currency === 'usd'
  )
  if (existing) {
    console.log(`  found existing ${intervalKey} price ${existing.id} ($${dollarAmount})`)
    return existing
  }
  console.log(`  creating ${intervalKey} price ($${dollarAmount})...`)
  return stripe('prices', {
    product: productId,
    unit_amount: String(dollarAmount * 100),
    currency: 'usd',
    'recurring[interval]': interval,
    'metadata[jobscout_plan_id]': planId,
    'metadata[interval]': intervalKey,
  })
}

;(async () => {
  console.log('Setting up JobScout Stripe Products + Prices on master account...\n')

  const planIds = {}

  for (const plan of PLANS) {
    console.log(`\n=== ${plan.name} (${plan.id}) ===`)
    const product = await findOrCreateProduct(plan)
    const monthly = await findOrCreatePrice(product.id, plan.id, plan.monthly_price, 'month')
    const yearly  = await findOrCreatePrice(product.id, plan.id, plan.annual_price,  'year')
    planIds[plan.id] = {
      product_id: product.id,
      price_monthly: monthly.id,
      price_yearly: yearly.id,
    }
  }

  // Persist in Supabase so the runtime can look up price IDs.
  const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  await sb.from('system_settings').upsert({
    key: 'billing_plan_stripe_ids',
    value: planIds,
  }, { onConflict: 'key' })

  console.log('\n=== Saved to system_settings.billing_plan_stripe_ids ===')
  console.log(JSON.stringify(planIds, null, 2))
  console.log('\nDone. The Settings → Billing UI will now use these price IDs.')
})().catch(err => {
  console.error('FAILED:', err.message)
  process.exit(1)
})
