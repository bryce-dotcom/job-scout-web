// One-shot: create the Prospecting Pro Product + 2 Prices in Stripe
// (master account). Idempotent — safe to re-run.
//
// Creates:
//   - Product: "AI Prospecting Pro"
//   - Price: $49/month
//   - Price: $470/year (20% off — 49 * 12 * 0.8 = 470.40 rounded to 470)
//
// Stores both Price IDs in system_settings.key='prospecting_stripe_ids'
// so the runtime can look them up without re-hitting Stripe.
//
// Usage:
//   1. Make sure JOBSCOUT_MASTER_STRIPE_KEY is in .env.local
//   2. node scripts/setup-prospecting-products.cjs
//
// Output prints the resulting Product + Price IDs.

require('dotenv').config({ path: '.env.local' })
require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')

const STRIPE_KEY = process.env.JOBSCOUT_MASTER_STRIPE_KEY
if (!STRIPE_KEY) {
  console.error('ERROR: Set JOBSCOUT_MASTER_STRIPE_KEY in .env.local first.')
  process.exit(1)
}

const PRODUCT_METADATA_KEY = 'prospecting_pro'
const MONTHLY_AMOUNT = 4900  // $49.00 in cents
const ANNUAL_AMOUNT  = 47000 // $470.00 (20% off vs monthly $588)

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

async function findOrCreateProduct() {
  // Look for an existing product with metadata.jobscout_product_id = 'prospecting_pro'
  const list = await stripeGet('products', { limit: 100, active: 'true' })
  const existing = (list.data || []).find(p => p.metadata?.jobscout_product_id === PRODUCT_METADATA_KEY)
  if (existing) {
    console.log(`  found existing product ${existing.id}`)
    return existing
  }
  console.log('  creating product...')
  return stripe('products', {
    name: 'AI Prospecting Pro',
    description: 'JobScout add-on: 50 AI searches + 200 decision-maker enrichments per month. Per-company pricing, all seats included.',
    'metadata[jobscout_product_id]': PRODUCT_METADATA_KEY,
  })
}

async function findOrCreatePrice(productId, dollarAmount, interval) {
  // Look for an existing recurring price on this product with the same
  // unit_amount + interval. If found, reuse.
  const list = await stripeGet('prices', { product: productId, limit: 100, active: 'true' })
  const existing = (list.data || []).find(p =>
    p.unit_amount === dollarAmount &&
    p.recurring?.interval === interval &&
    p.currency === 'usd'
  )
  if (existing) {
    console.log(`    found existing price ${existing.id} ($${dollarAmount / 100}/${interval})`)
    return existing
  }
  console.log(`    creating price $${dollarAmount / 100}/${interval}...`)
  return stripe('prices', {
    product: productId,
    currency: 'usd',
    unit_amount: String(dollarAmount),
    'recurring[interval]': interval,
    'metadata[jobscout_product_id]': PRODUCT_METADATA_KEY,
    'metadata[interval]': interval,
  })
}

async function main() {
  console.log('Setting up Prospecting Pro in Stripe...\n')

  console.log('Product:')
  const product = await findOrCreateProduct()

  console.log('Prices:')
  const monthly = await findOrCreatePrice(product.id, MONTHLY_AMOUNT, 'month')
  const annual  = await findOrCreatePrice(product.id, ANNUAL_AMOUNT,  'year')

  // Save to system_settings so the runtime edge function can look up
  // the price IDs without hitting Stripe.
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (SUPABASE_URL && SERVICE_ROLE_KEY) {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const payload = {
      product_id: product.id,
      monthly_price_id: monthly.id,
      annual_price_id:  annual.id,
      monthly_amount:   MONTHLY_AMOUNT,
      annual_amount:    ANNUAL_AMOUNT,
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase
      .from('system_settings')
      .upsert(
        { key: 'prospecting_stripe_ids', value: payload, updated_at: new Date().toISOString() },
        { onConflict: 'key' },
      )
    if (error) {
      console.error('Failed to write system_settings:', error.message)
    } else {
      console.log('\nWrote system_settings.prospecting_stripe_ids:')
      console.log(JSON.stringify(payload, null, 2))
    }
  } else {
    console.log('\nSet VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to also write IDs to system_settings.')
  }

  console.log('\nDone. IDs:')
  console.log(`  Product:        ${product.id}`)
  console.log(`  Monthly price:  ${monthly.id}  ($49/mo)`)
  console.log(`  Annual price:   ${annual.id}  ($470/yr — 20% off)`)
}

main().catch(err => {
  console.error('FAILED:', err.message)
  process.exit(1)
})
