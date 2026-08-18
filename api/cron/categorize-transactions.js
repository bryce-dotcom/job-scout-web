// Vercel cron — puts a category on bank transactions after they arrive.
//
// The import got a schedule; categorising never did. It ran only when someone
// opened Books and pressed a button, so transactions piled up uncategorised
// between visits: 53 imported between 10 and 18 August, none of them
// categorised, 95 sitting untouched in total. The daily health check caught it
// — "AI categorising new transactions, last 197.9h" — which is the check
// working exactly as intended, on a gap nothing else would have shown.
//
// Nothing was broken. Running the function by hand categorised 54 in one pass
// with none remaining. The failure was that no clock ever called it.
//
// Runs 40 minutes after plaid-sync so the transactions it categorises are the
// ones just imported, rather than racing the import and finding nothing.

const { createClient } = require('@supabase/supabase-js')

// One batch is bounded; loop until the function reports nothing left. Capped so
// a bad day cannot spend the AI budget in a single run.
const MAX_ROUNDS = 12

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

    // Only tenants with transactions that still need a category — no point
    // waking the AI for a company with nothing waiting.
    const { data: pending, error } = await sb
      .from('plaid_transactions')
      .select('company_id')
      .is('ai_category', null)
      .is('user_category', null)
      .limit(5000)
    if (error) return res.status(500).json({ error: error.message })

    const companyIds = [...new Set((pending || []).map(t => t.company_id))].filter(Boolean)
    const results = []

    for (const companyId of companyIds) {
      let categorized = 0
      let rounds = 0
      let lastError = null
      while (rounds < MAX_ROUNDS) {
        rounds += 1
        const r = await fetch(`${url}/functions/v1/categorize-transactions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, apikey: key },
          body: JSON.stringify({ action: 'categorize_batch', company_id: companyId, limit: 50 }),
        }).then(x => x.json()).catch(e => ({ error: e.message }))

        // The function reports ai_error rather than throwing, so a quiet
        // failure would otherwise look like a successful zero.
        if (r?.error || r?.ai_error) { lastError = r.error || r.ai_error; break }
        categorized += Number(r?.categorized) || 0
        if (!r?.remaining) break
      }
      results.push({ company_id: companyId, categorized, rounds, error: lastError })
    }

    const failed = results.filter(r => r.error)
    return res.status(failed.length ? 500 : 200).json({
      companies: companyIds.length,
      categorized: results.reduce((s, r) => s + r.categorized, 0),
      failed: failed.length,
      results,
    })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}
