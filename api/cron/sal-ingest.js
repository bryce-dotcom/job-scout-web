// Vercel cron — Sal's sweep, every 10 minutes.
//
// Two jobs, both feeding the one parser (the sal-ingest Edge Function):
//   1. bid_inbox rows still 'received' — an alert the webhook filed but the
//      immediate parse did not reach (function cold, AI paused, a retry).
//      Nothing waits in the inbox for more than ten minutes.
//   2. RSS sources (bid_sources.kind = 'rss') that have not been polled for
//      two hours: the Utah Public Notice Website's per-body feeds, Google
//      Alerts, an agency's own feed. New items become bid_inbox rows with
//      email_id 'rss:<guid>' (the unique index makes a re-read a no-op) and
//      go through the same parser as an email — one path, one set of rules.
//
// Auth: Vercel's cron header, or a CRON_SECRET bearer for a manual run.

const { createClient } = require('@supabase/supabase-js')

const RSS_EVERY_MS = 2 * 60 * 60 * 1000
const INBOX_BATCH = 20
const RSS_ITEMS_MAX = 40

// A small, tolerant reader for RSS 2.0 and Atom. Feeds from public bodies
// are simple and often slightly broken; a real XML parser would refuse them.
function parseFeed(xml) {
  const items = []
  const blocks = [...String(xml || '').matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map((m) => m[0])
  const tag = (b, t) => {
    const m = b.match(new RegExp(`<${t}\\b[^>]*>([\\s\\S]*?)<\\/${t}>`, 'i'))
    return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim() : ''
  }
  for (const b of blocks.slice(0, RSS_ITEMS_MAX)) {
    const title = tag(b, 'title')
    let link = tag(b, 'link')
    if (!link) { const m = b.match(/<link\b[^>]*href=["']([^"']+)["']/i); link = m ? m[1] : '' }
    const guid = tag(b, 'guid') || tag(b, 'id') || link || title
    const desc = tag(b, 'description') || tag(b, 'summary') || tag(b, 'content')
    const date = tag(b, 'pubDate') || tag(b, 'published') || tag(b, 'updated') || tag(b, 'dc:date')
    if (title || link) items.push({ title, link, guid, desc: desc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), date })
  }
  return items
}

module.exports = async function handler(req, res) {
  const isVercelCron = !!req.headers['x-vercel-cron-signature']
  const auth = req.headers['authorization'] || ''
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const expected = process.env.CRON_SECRET
  if (!isVercelCron && (!expected || bearer !== expected)) return res.status(401).json({ error: 'unauthorized' })

  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return res.status(500).json({ error: 'supabase env missing' })
  const sb = createClient(url, key, { auth: { persistSession: false } })
  const out = { rss: { polled: 0, items: 0, errors: 0 }, inbox: { parsed: 0, failed: 0, remaining: 0 } }

  try {
    // ── 1. RSS sources due for a poll.
    const cutoff = new Date(Date.now() - RSS_EVERY_MS).toISOString()
    const { data: feeds } = await sb.from('bid_sources').select('id, company_id, label, config, last_polled_at')
      .eq('kind', 'rss').eq('enabled', true).or(`last_polled_at.is.null,last_polled_at.lt.${cutoff}`).limit(25)
    for (const f of feeds || []) {
      const feedUrl = f.config?.url
      if (!feedUrl) { await sb.from('bid_sources').update({ health: 'error', error_text: 'No feed URL', last_polled_at: new Date().toISOString() }).eq('id', f.id); continue }
      out.rss.polled++
      try {
        const r = await fetch(feedUrl, { headers: { 'User-Agent': 'JobScout Sal (bid notice reader)' } })
        if (!r.ok) throw new Error(`http ${r.status}`)
        const items = parseFeed(await r.text())
        let newest = null
        for (const it of items) {
          const rows = {
            company_id: f.company_id, email_id: `rss:${String(it.guid).slice(0, 400)}`,
            from_email: f.label || feedUrl, subject: it.title || '(untitled notice)',
            text_body: `${it.desc || ''}\n\n${it.link || ''}`.trim(), html_body: it.link ? `<a href="${it.link}">${it.title || it.link}</a>` : null,
            received_at: it.date && !Number.isNaN(Date.parse(it.date)) ? new Date(it.date).toISOString() : new Date().toISOString(),
            attachments: [], status: 'received', raw: { source_id: f.id, feed: feedUrl, guid: it.guid },
          }
          const { data: ins } = await sb.from('bid_inbox').upsert(rows, { onConflict: 'company_id,email_id', ignoreDuplicates: true }).select('id')
          if (ins?.length) { out.rss.items++; newest = newest && newest > rows.received_at ? newest : rows.received_at }
        }
        await sb.from('bid_sources').update({ health: 'ok', error_text: null, last_polled_at: new Date().toISOString(), ...(newest ? { last_item_at: newest } : {}) }).eq('id', f.id)
      } catch (e) {
        out.rss.errors++
        await sb.from('bid_sources').update({ health: 'error', error_text: String(e.message || e).slice(0, 300), last_polled_at: new Date().toISOString() }).eq('id', f.id)
      }
    }

    // ── 2. Inbox rows nobody has read yet.
    const { data: pending } = await sb.from('bid_inbox').select('id, company_id').eq('status', 'received').order('received_at', { ascending: true }).limit(INBOX_BATCH)
    for (const row of pending || []) {
      try {
        const r = await fetch(`${url}/functions/v1/sal-ingest`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, apikey: key },
          body: JSON.stringify({ company_id: row.company_id, inbox_id: row.id }),
        })
        const j = await r.json().catch(() => ({}))
        if (r.ok && j.ok) out.inbox.parsed++
        else { out.inbox.failed++; console.warn('[sal-ingest cron] parse failed', row.id, r.status, j.error) }
        if (j.ai_unavailable) break // no point burning the batch
      } catch (e) { out.inbox.failed++; console.warn('[sal-ingest cron]', row.id, e.message) }
    }
    const { count } = await sb.from('bid_inbox').select('id', { count: 'exact', head: true }).eq('status', 'received')
    out.inbox.remaining = count || 0
    return res.status(200).json({ ok: true, ...out })
  } catch (e) {
    console.error('[sal-ingest cron]', e)
    return res.status(500).json({ error: e.message })
  }
}

module.exports.parseFeed = parseFeed
