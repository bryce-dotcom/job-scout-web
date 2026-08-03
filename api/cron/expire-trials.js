// Vercel cron — transitions lapsed trials out of 'trialing'.
//
// Why this exists: a trial that runs out WITHOUT a card added never
// creates a Stripe subscription, so no Stripe webhook ever fires about
// it. Nothing else moves it off 'trialing', so those tenants kept full
// access indefinitely. This sweep flips them to 'trial_expired', which
// the RLS write-gate (company_can_write) turns into read-only access.
//
// A tenant who added a card is already 'active'/'past_due' via the
// webhook, so filtering on billing_status='trialing' only catches the
// genuinely-lapsed ones. Runs daily; idempotent (re-running is a no-op
// once everyone eligible is already 'trial_expired').

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
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    )
    const nowIso = new Date().toISOString()

    // PostgREST treats a null trial_ends_at as failing `.lt`, so trials
    // with no end date are left alone — only ones past their end flip.
    const { data, error } = await supabase
      .from('companies')
      .update({ billing_status: 'trial_expired', updated_at: nowIso })
      .eq('billing_status', 'trialing')
      .lt('trial_ends_at', nowIso)
      .select('id, company_name, trial_ends_at')

    if (error) throw error
    return res.status(200).json({ expired: data?.length || 0, companies: data || [] })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
