// One-shot: pull all currently-valid Stripe payment methods for HHH's
// customers and upsert into customer_payment_methods. Catches up any
// cards saved via the portal before the setup_intent.succeeded webhook
// handler was deployed.
require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
;(async () => {
  // HHH's Stripe key from settings
  const cfg = (await s.from('settings').select('value').eq('company_id', 3).eq('key', 'payment_config').maybeSingle()).data
  const stripeKey = (() => { try { return JSON.parse(cfg?.value || '{}').stripe_secret_key } catch { return null } })()
  if (!stripeKey) { console.error('No Stripe secret key in payment_config'); return }

  // Customers that have a stripe_customer_id
  let from = 0, all = []
  for (;;) {
    const r = await s.from('customers').select('id,company_id,name,stripe_customer_id').eq('company_id', 3).not('stripe_customer_id', 'is', null).range(from, from + 999)
    if (r.error) { console.error(r.error); return }
    all.push(...r.data)
    if (r.data.length < 1000) break
    from += 1000
  }
  console.log(`${all.length} HHH customers with a Stripe customer id`)

  let synced = 0, skipped = 0
  for (const c of all) {
    // List Stripe payment methods for this customer
    const url = `https://api.stripe.com/v1/customers/${c.stripe_customer_id}/payment_methods?type=card&limit=50`
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${stripeKey}` } })
    if (!res.ok) { console.warn(`  ${c.name}: stripe ${res.status}`); skipped++; continue }
    const data = await res.json()
    const pms = data.data || []
    for (const pm of pms) {
      const card = pm.card || {}
      // Manual dedup since stripe_payment_method_id doesn't have a unique constraint yet
      const existing = await s.from('customer_payment_methods').select('id,status').eq('stripe_payment_method_id', pm.id).maybeSingle()
      if (existing.data) {
        if (existing.data.status !== 'active') {
          await s.from('customer_payment_methods').update({ status: 'active' }).eq('id', existing.data.id)
          synced++
        }
        continue
      }
      const { error } = await s.from('customer_payment_methods').insert({
        company_id: c.company_id,
        customer_id: c.id,
        stripe_customer_id: c.stripe_customer_id,
        stripe_payment_method_id: pm.id,
        brand: card.brand || null,
        last_four: card.last4 || null,
        exp_month: card.exp_month || null,
        exp_year: card.exp_year || null,
        status: 'active',
        is_default: false,
      })
      if (error) console.warn(`  ${c.name} pm=${pm.id}: ${error.message}`)
      else synced++
    }
    if (pms.length > 0) console.log(`  ✓ ${c.name}: ${pms.length} cards`)
  }
  console.log(`\nTotal cards upserted: ${synced} (skipped ${skipped})`)
})()
