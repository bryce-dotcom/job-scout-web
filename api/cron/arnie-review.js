// Vercel cron — the weekly Arnie review (Bryce, 2026-10-21: "how do we fix it
// so we dont have to keep taking the team down a rabbit hole").
//
// Every Monday, each company's owners get THEIR OWN week with Arnie — never
// another company's — and the things worth a look:
//   • what the fact-check caught him claiming (arnie_review_events)
//   • answers with figures in them that he never looked up (the receipt says
//     "No lookups this reply") — the kind that sent Cole after 17 leads
//   • every time someone pushed back ("that's wrong", "I don't see it"), with
//     what he had actually looked up for the reply they were answering
//   • blank or gave-up replies, and calls that failed
// Alayda's blank replies on 2026-10-21 were found because Bryce asked; this is
// so the next one is found because the review says so.
//
// GET ?company=3&dry=1 (with the cron secret) returns the review without sending.

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const clip = (s, n = 220) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t }

const RECEIPT_MARK = '⟦receipt⟧'
function splitReceipt(content) {
  const s = String(content ?? '')
  const at = s.lastIndexOf(RECEIPT_MARK)
  return at < 0 ? { text: s, receipt: null } : { text: s.slice(0, at).trimEnd(), receipt: s.slice(at + RECEIPT_MARK.length).trim() || null }
}

/** Someone telling him he is wrong, or that what he said happened did not. */
const PUSHBACK = /\b(that'?s (wrong|not right|not true|incorrect)|that (is|was) (wrong|not right|not true|incorrect)|you('re| are) wrong|not correct|incorrect|you (didn'?t|did not|never)|didn'?t (work|happen|go through|send|come)|i (don'?t|do not|can'?t|cannot) see|not there|doesn'?t exist|does not exist|made (that|it|this) up|where is (it|the card|that)|still (don'?t|do not|can'?t) see|never (got|received|came)|wrong (number|job|customer|price|amount))\b/i
/** Pushback, unless it is a condition: Cole's plan for the day said "if it
 *  didn't happen Friday", which is not telling Arnie he was wrong. */
function isPushback(s) {
  const t = String(s || '')
  const re = new RegExp(PUSHBACK.source, 'gi')
  let m
  while ((m = re.exec(t))) {
    if (!/\b(if|unless|in case|whether)\b[^.!?\n]{0,12}$/i.test(t.slice(Math.max(0, m.index - 14), m.index))) return true
  }
  return false
}
/** A figure a person would act on: money, a phone number, a count of 3+ digits. */
const FIGURE = /\$\s?\d[\d,]*(\.\d+)?|\(?\d{3}\)?[\s.-]?\d{3}[\s.-]\d{4}|\b\d{1,3}(,\d{3})+\b|\b\d{3,}\b/
const GAVE_UP = /got tangled up trying to look that up|ran out of lookups on that one/i
const KIND_WORDS = {
  card: 'said a card or a saved memory existed when none was made',
  memory: 'said he had remembered something he had not',
  email: 'said an email went that never did',
  computer: 'described work on their computer he never did',
  figures: 'gave figures no lookup returned',
  guess: 'said an amount could not be read, then gave one anyway',
}

/**
 * The review for one company, from rows already read. Pure: no fetching here.
 * messages: [{ role, content, created_at, email }] oldest first, one conversation's
 * turns kept together (session_id).
 */
function buildReview({ companyName, tz = 'America/Denver', since, events = [], messages = [], failures = [], usage = {} }) {
  const when = (iso) => { try { return new Date(iso).toLocaleString('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) } catch { return iso } }
  const who = (email) => String(email || 'someone').split('@')[0].replace(/^./, (c) => c.toUpperCase())

  const caught = events.map((e) => ({ when: e.created_at, who: e.employee_email, kind: e.kind, shown: !!e.shown, said: e.said, reply: e.reply }))

  const unverified = [], pushback = [], gaveUp = []
  const bySession = new Map()
  for (const m of messages) bySession.set(m.session_id, [...(bySession.get(m.session_id) || []), m])
  for (const turns of bySession.values()) {
    turns.forEach((m, i) => {
      if (m.role === 'assistant') {
        const { text, receipt } = splitReceipt(m.content)
        if (!text.trim() || GAVE_UP.test(text)) gaveUp.push({ when: m.created_at, who: m.email, said: turns[i - 1]?.role === 'user' ? turns[i - 1].content : '', text })
        else if (receipt === 'No lookups this reply' && FIGURE.test(text)) unverified.push({ when: m.created_at, who: m.email, said: turns[i - 1]?.role === 'user' ? turns[i - 1].content : '', text })
      } else if (m.role === 'user' && isPushback(m.content) && i > 0) {
        const prev = turns.slice(0, i).reverse().find((t) => t.role === 'assistant')
        const { text, receipt } = splitReceipt(prev?.content)
        pushback.push({ when: m.created_at, who: m.email, said: m.content, prevText: text, prevReceipt: receipt })
      }
    })
  }

  const failed = failures.reduce((acc, f) => { const k = f.error_kind || 'other'; acc[k] = (acc[k] || 0) + 1; return acc }, {})
  const failedTotal = Object.values(failed).reduce((a, b) => a + b, 0)
  const toLook = caught.length + unverified.length + pushback.length + gaveUp.length + failedTotal

  const people = new Set(messages.filter((m) => m.role === 'user').map((m) => m.email))
  const replies = messages.filter((m) => m.role === 'assistant').length

  const section = (title, rows, render) => rows.length
    ? `<h3 style="margin:22px 0 6px;font-size:15px">${esc(title)} <span style="color:#7d8a7f;font-weight:normal">(${rows.length})</span></h3><ul style="padding-left:18px;margin:0">${rows.slice(0, 25).map((r) => `<li style="margin:0 0 12px">${render(r)}</li>`).join('')}</ul>${rows.length > 25 ? `<p style="color:#7d8a7f">…and ${rows.length - 25} more.</p>` : ''}`
    : ''
  const quote = (s, n) => `<span style="color:#5a6349">“${esc(clip(s, n))}”</span>`

  const html = `<div style="font:14px/1.6 -apple-system,Segoe UI,Arial,sans-serif;color:#2c3530;max-width:680px">`
    + `<p>Arnie at ${esc(companyName)}, the week since ${esc(when(since))}: <b>${people.size}</b> ${people.size === 1 ? 'person' : 'people'}, <b>${replies}</b> replies${usage.cost != null ? `, about <b>$${Number(usage.cost).toFixed(2)}</b> of AI` : ''}.</p>`
    + (toLook ? `<p><b>${toLook} thing${toLook === 1 ? '' : 's'} worth a look.</b> Each one is a place someone may have been told something that was not true, or got nothing back.</p>` : '<p><b>Nothing to look at this week.</b> No caught claims, no unchecked figures, no pushback, no blank replies.</p>')
    + section('Caught by the fact-check', caught, (r) => `${esc(when(r.when))}, ${esc(who(r.who))} asked ${quote(r.said, 140)} — he ${esc(KIND_WORDS[r.kind] || r.kind)}${r.shown ? ' <b>and they saw it before he took it back</b>' : ' (caught before they saw it)'}: ${quote(r.reply, 200)}`)
    + section('Figures he never looked up', unverified, (r) => `${esc(when(r.when))}, ${esc(who(r.who))} asked ${quote(r.said, 140)} — his answer had figures and the receipt says no lookups: ${quote(r.text, 220)}`)
    + section('Someone said he was wrong', pushback, (r) => `${esc(when(r.when))}, ${esc(who(r.who))}: ${quote(r.said, 160)}<br><span style="color:#7d8a7f">His reply before that: ${quote(r.prevText, 180)} — ${r.prevReceipt ? `receipt: ${esc(r.prevReceipt)}` : 'no receipt (before receipts, or the app was old)'}</span>`)
    + section('Blank or gave-up replies', gaveUp, (r) => `${esc(when(r.when))}, ${esc(who(r.who))} asked ${quote(r.said, 160)} — ${r.text.trim() ? quote(r.text, 120) : '<b>he sent back nothing</b>'}`)
    + (failedTotal ? `<h3 style="margin:22px 0 6px;font-size:15px">Calls that failed <span style="color:#7d8a7f;font-weight:normal">(${failedTotal})</span></h3><p style="margin:0">${Object.entries(failed).map(([k, n]) => `${esc(k)}: ${n}`).join(' · ')}</p>` : '')
    + `<p style="color:#7d8a7f;font-size:12px;margin-top:24px">JobScout sends this every Monday to the owners of ${esc(companyName)}, about ${esc(companyName)} only. The receipt is the line under each Arnie reply: what JobScout saw him look up and draft, not what he said he did.</p></div>`

  return {
    toLook, people: people.size, replies,
    counts: { caught: caught.length, unverified: unverified.length, pushback: pushback.length, gaveUp: gaveUp.length, failed: failedTotal },
    subject: toLook ? `Arnie this week at ${companyName}: ${toLook} to look at` : `Arnie this week at ${companyName}: all clear`,
    html,
  }
}

async function handler(req, res) {
  const isVercelCron = !!req.headers['x-vercel-cron-signature']
  const auth = req.headers['authorization'] || ''
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : ''
  const expected = process.env.CRON_SECRET
  if (!isVercelCron && (!expected || bearer !== expected)) return res.status(401).json({ error: 'unauthorized' })

  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return res.status(500).json({ error: 'supabase env missing' })
  const H = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
  const get = async (path) => { const r = await fetch(`${url}/rest/v1/${path}`, { headers: H }); return r.ok ? r.json() : [] }

  const q = req.query || {}
  const dry = q.dry === '1' || q.dry === 'true'
  const only = q.company ? Number(q.company) : null
  const since = new Date(Date.now() - 7 * 86400000).toISOString()

  try {
    // Companies whose people talked to Arnie this week.
    const sessions = await get(`ai_sessions?select=session_id,company_id,user_email&current_module=eq.arnie&last_activity=gte.${since}${only ? `&company_id=eq.${only}` : ''}&limit=5000`)
    const byCompany = new Map()
    for (const s of sessions) byCompany.set(s.company_id, [...(byCompany.get(s.company_id) || []), s])
    if (only && !byCompany.has(only)) byCompany.set(only, [])

    const out = []
    for (const [companyId, list] of byCompany) {
      if (companyId == null) continue
      const [co] = await get(`companies?select=company_name,owner_email,timezone&id=eq.${companyId}`)
      const email = new Map(list.map((s) => [s.session_id, s.user_email]))
      const messages = []
      for (let i = 0; i < list.length; i += 100) {
        const ids = list.slice(i, i + 100).map((s) => `"${s.session_id}"`).join(',')
        const rows = await get(`ai_messages?select=session_id,role,content,created_at&session_id=in.(${ids})&created_at=gte.${since}&order=created_at.asc&limit=10000`)
        for (const m of rows) messages.push({ ...m, email: email.get(m.session_id) })
      }
      const events = await get(`arnie_review_events?select=created_at,employee_email,kind,shown,said,reply&company_id=eq.${companyId}&created_at=gte.${since}&order=created_at.asc&limit=500`)
      const failures = await get(`ai_usage?select=error_kind&company_id=eq.${companyId}&feature=eq.arnie-chat&success=eq.false&created_at=gte.${since}&limit=5000`)
      const costs = await get(`ai_usage?select=est_cost_usd&company_id=eq.${companyId}&feature=eq.arnie-chat&created_at=gte.${since}&limit=50000`)
      const cost = costs.reduce((s, r) => s + (Number(r.est_cost_usd) || 0), 0)

      const review = buildReview({ companyName: co?.company_name || 'your company', tz: co?.timezone || 'America/Denver', since, events, messages, failures, usage: { cost } })
      if (!review.replies && !review.toLook) { out.push({ companyId, skipped: 'no Arnie this week' }); continue }

      const owners = await get(`employees?select=email&company_id=eq.${companyId}&active=eq.true&or=(user_role.in.(Owner,%22Super%20Admin%22),role.eq.Owner)`)
      const owned = [...new Set([...(owners || []).map((o) => o.email), co?.owner_email].filter(Boolean).map((e) => e.toLowerCase()))]
      // ?only_to= narrows a manual run to ONE of the owners (a test send).
      // It can only narrow: an address that is not an owner gets nothing.
      const to = q.only_to ? owned.filter((e) => e === String(q.only_to).toLowerCase()) : owned
      if (dry) { out.push({ companyId, to, ...review }); continue }
      if (!to.length) { out.push({ companyId, skipped: 'no owner email' }); continue }
      const s = await fetch(`${url}/functions/v1/send-email`, { method: 'POST', headers: H, body: JSON.stringify({ to, subject: review.subject, html: review.html, from: 'JobScout <alerts@appsannex.com>' }) })
      out.push({ companyId, to: to.length, counts: review.counts, ok: s.ok, status: s.status })
    }
    console.log('arnie-review:', JSON.stringify(out.map(({ html, ...rest }) => rest)))
    return res.status(200).json({ since, companies: out })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}

module.exports = handler
module.exports.buildReview = buildReview
module.exports.PUSHBACK = PUSHBACK
module.exports.isPushback = isPushback
