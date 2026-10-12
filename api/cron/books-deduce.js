// Vercel cron — Frankie the bookkeeper judges every new bank row.
//
// plaid-sync imports (:30 past 0/6/12/18), categorize-transactions guesses a
// category (:50), and this runs 35 minutes later so the rows it judges are
// the ones just imported. It calls books-deduce `run` per tenant that has
// unconfirmed rows; the function stores a verdict per row in books_verdicts
// and never writes the ledger — people (or, later, the books_autobook
// setting) apply verdicts from the Books page.

const { createClient } = require('@supabase/supabase-js')

const PER_RUN = 300

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
    const since = `${new Date().getFullYear()}-01-01`
    // Tenants with unconfirmed rows that have no verdict yet (or a stale one
    // from before the last import) — one query, grouped in JS.
    const { data: rows, error } = await sb
      .from('plaid_transactions')
      .select('id, company_id')
      .eq('confirmed', false).eq('pending', false).gte('date', since)
      .limit(5000)
    if (error) return res.status(500).json({ error: error.message })
    const { data: judged } = await sb.from('books_verdicts').select('plaid_transaction_id').in('plaid_transaction_id', (rows || []).map(r => r.id).slice(0, 5000))
    const hasVerdict = new Set((judged || []).map(j => j.plaid_transaction_id))
    const byCompany = new Map()
    for (const r of rows || []) {
      if (hasVerdict.has(r.id)) continue
      byCompany.set(r.company_id, [...(byCompany.get(r.company_id) || []), r.id])
    }

    const results = []
    for (const [companyId, ids] of byCompany) {
      try {
        const chunk = ids.slice(0, PER_RUN)
        const r = await fetch(`${url}/functions/v1/books-deduce`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, apikey: key },
          body: JSON.stringify({ action: 'run', company_id: companyId, only_ids: chunk, limit: PER_RUN }),
        })
        const json = await r.json().catch(() => ({}))
        results.push({ company_id: companyId, waiting: ids.length, judged: json.judged ?? 0, sure: json.summary?.confidence?.sure ?? 0, model: json.model || null, error: json.error || null })
      } catch (err) {
        results.push({ company_id: companyId, error: err.message })
      }
    }
    const failed = results.filter(r => r.error)
    return res.status(200).json({ companies: byCompany.size, judged: results.reduce((s, r) => s + (r.judged || 0), 0), failed: failed.length, results })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
