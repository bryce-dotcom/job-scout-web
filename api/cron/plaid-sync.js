// Vercel cron — imports bank transactions for every tenant with a live Plaid
// connection.
//
// Until this existed, nothing ran the bank sync at all. It fired only when a
// person pressed Sync in Books or Settings, and the health check meanwhile
// asserted "expected at least every 96h" — a promise nothing in the system
// kept. The actual record: ten imports between March and August, including a
// 53-day gap. Tracy was asked to categorise transactions that had never
// arrived.
//
// Schedule: every 6 hours, offset 30 minutes from stripe-sync-books so the two
// don't contend. Plaid refreshes an item a few times a day; more often than this
// buys nothing.

const { createClient } = require('@supabase/supabase-js')

module.exports = async function handler(req, res) {
  const isVercelCron = !!req.headers['x-vercel-cron-signature']
  const auth = req.headers['authorization'] || ''
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const expected = process.env.CRON_SECRET
  if (!isVercelCron && (!expected || bearer !== expected)) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return res.status(500).json({ error: 'supabase env missing' })

  try {
    const sb = createClient(url, key, { auth: { persistSession: false } })

    // Only tenants that actually have a live connection.
    const { data: accounts, error } = await sb
      .from('connected_accounts')
      .select('company_id')
      .eq('status', 'active')
    if (error) return res.status(500).json({ error: error.message })

    const companyIds = [...new Set((accounts || []).map(a => a.company_id))].filter(Boolean)
    const results = []

    const call = (companyId, action) =>
      fetch(`${url}/functions/v1/plaid-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
          apikey: key,
        },
        body: JSON.stringify({ action, company_id: companyId }),
      }).then(r => r.json().catch(() => ({})))

    for (const companyId of companyIds) {
      try {
        const json = await call(companyId, 'sync_all')

        // Balances are a SEPARATE action. sync_all stamps last_synced but never
        // touches current_balance — and the health check reads last_synced to
        // decide whether BALANCES are fresh. Running the transaction sync alone
        // on a schedule would therefore report healthy balances forever while
        // they sat frozen at whatever they were the day the account was
        // connected. That is the exact failure Books had to be fixed for
        // ("the bank amounts are not matching the actual bank"); putting it on
        // a cron would have made it permanent and silent.
        const balances = await call(companyId, 'get_accounts')

        results.push({
          company_id: companyId,
          ok: !json.error,
          added: json.total_added ?? 0,
          modified: json.total_modified ?? 0,
          balances_refreshed: !balances?.error,
          // Surfaced rather than swallowed: an account at the bank that isn't
          // connected here means transactions we are choosing not to import,
          // and that has to be visible in the cron log.
          warnings: json.warnings || [],
          error: json.error || balances?.error || null,
        })
      } catch (err) {
        results.push({ company_id: companyId, ok: false, error: err.message })
      }
    }

    const failed = results.filter(r => !r.ok)
    // A partial failure still reports 200 with the detail — one tenant's expired
    // login must not look like the cron itself being broken.
    return res.status(200).json({
      companies: companyIds.length,
      synced: results.length - failed.length,
      failed: failed.length,
      results,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
