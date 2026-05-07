// Vercel cron — syncs Stripe balance + payouts into Books for every
// tenant that has Stripe configured. Calls the stripe-sync-books edge
// function with { all: true } so the function loops through tenants
// internally with the service role.
//
// Schedule: every 6 hours (matches Stripe's typical balance update
// cadence; payouts arrive on a 2-day rolling schedule).

const { createClient } = require('@supabase/supabase-js')

module.exports = async function handler(req, res) {
  const isVercelCron = !!req.headers['x-vercel-cron-signature']
  const auth = req.headers['authorization'] || ''
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const expected = process.env.CRON_SECRET
  if (!isVercelCron && (!expected || bearer !== expected)) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  try {
    const url = `${process.env.VITE_SUPABASE_URL}/functions/v1/stripe-sync-books`
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
      },
      body: JSON.stringify({ all: true }),
    })
    const json = await r.json().catch(() => ({}))
    return res.status(r.ok ? 200 : 500).json(json)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
