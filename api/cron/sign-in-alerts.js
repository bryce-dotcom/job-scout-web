// Vercel cron — tell a company's owners the day someone signs in a NEW way.
//
// Bryce, 2026-10-20: "how do we keep other bots like grok seeing all of our
// numbers". A bot signed in as a rep shows up as a kind of sign-in that
// person has never used — a program instead of a browser, or Chrome on a
// Linux server. public.new_sign_ins() (migration 20261020110000) returns each
// new (person, kind) once; this emails the owners of that person's company.
//
// JobScout's own desktop agent signs in as a program when someone presses
// Connect; those are recognised (desktop_agent) and not alerted.

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Why this kind is worth a look, in plain words. */
function concernFor(kind) {
  const k = String(kind || '')
  if (k.startsWith('program:')) return 'This was a program, not a web browser. Bots and scripts sign in this way.'
  if (/Linux/.test(k)) return 'Chrome on Linux is unusual for a person. AI browser agents usually run this way, on a server.'
  if (/Headless/.test(k)) return 'A browser with no screen. Automated tools sign in this way.'
  return 'A device or browser this person has not signed in with before.'
}

function alertEmail(companyName, rows, tz = 'America/Denver') {
  const when = (iso) => { try { return new Date(iso).toLocaleString('en-US', { timeZone: tz, dateStyle: 'medium', timeStyle: 'short' }) } catch { return iso } }
  const items = rows.map((r) => `<li style="margin:0 0 12px"><b>${esc(r.employee_name || r.email)}</b> signed in with <b>${esc(String(r.kind).replace(/^\w+: /, ''))}</b> for the first time, ${esc(when(r.signed_in_at))}${r.ip ? ` from ${esc(r.ip)}` : ''}.<br><span style="color:#5a6349">${esc(concernFor(r.kind))}</span></li>`).join('')
  return {
    subject: rows.length === 1
      ? `New sign-in: ${rows[0].employee_name || rows[0].email} (${String(rows[0].kind).replace(/^\w+: /, '')})`
      : `${rows.length} new kinds of sign-in at ${companyName}`,
    html: `<div style="font:14px/1.6 -apple-system,Segoe UI,Arial,sans-serif;color:#2c3530;max-width:640px">`
      + `<p>Someone at ${esc(companyName)} signed in to JobScout in a way they never have before:</p><ul style="padding-left:18px">${items}</ul>`
      + `<p>If you recognise it (a new phone or laptop), there is nothing to do. If you do not, ask them. You can sign a person out everywhere from Employees, or turn their access off.</p>`
      + `<p style="color:#7d8a7f;font-size:12px">JobScout sends this once for each new kind of sign-in, per person.</p></div>`,
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

  try {
    const r = await fetch(`${url}/rest/v1/rpc/new_sign_ins`, { method: 'POST', headers: H, body: '{}' })
    if (!r.ok) return res.status(502).json({ error: `new_sign_ins ${r.status}`, body: await r.text() })
    const rows = (await r.json()).filter((x) => !x.desktop_agent && x.company_id != null)
    const byCompany = new Map()
    for (const x of rows) byCompany.set(x.company_id, [...(byCompany.get(x.company_id) || []), x])

    const sent = []
    for (const [companyId, list] of byCompany) {
      const [co] = await (await fetch(`${url}/rest/v1/companies?select=company_name,owner_email,timezone&id=eq.${companyId}`, { headers: H })).json()
      const owners = await (await fetch(`${url}/rest/v1/employees?select=email&company_id=eq.${companyId}&active=eq.true&or=(user_role.in.(Owner,%22Super%20Admin%22),role.eq.Owner)`, { headers: H })).json()
      const to = [...new Set([...(owners || []).map((o) => o.email), co?.owner_email].filter(Boolean).map((e) => e.toLowerCase()))]
      if (!to.length) continue
      const mail = alertEmail(co?.company_name || 'your company', list, co?.timezone || 'America/Denver')
      const s = await fetch(`${url}/functions/v1/send-email`, { method: 'POST', headers: H, body: JSON.stringify({ to, subject: mail.subject, html: mail.html, from: 'JobScout <alerts@appsannex.com>' }) })
      sent.push({ companyId, to: to.length, alerts: list.length, ok: s.ok })
    }
    console.log('sign-in-alerts:', JSON.stringify({ new: rows.length, sent }))
    return res.status(200).json({ new: rows.length, sent })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}

module.exports = handler
module.exports.concernFor = concernFor
module.exports.alertEmail = alertEmail
