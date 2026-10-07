// One-off: email the customers whose estimate follow-up was broken.
//
// Two faults, both now fixed in estimate-followup, but the emails already went:
//
//   19 estimates  got a "Review Your Estimate" button pointing at
//                 https://app.jobscout.appsannex.com — a host that has never
//                 resolved. The customer saw "this page can't load".
//   56 estimates  got no button at all, because their portal token had expired
//                 and the function filtered it out instead of refreshing it.
//
// Neither group can be rescued by fixing data alone: the first group's link
// points at a hostname that does not exist, and the second group has no link
// in their inbox to revive. They need a new email.
//
// What this sends OWNS the mistake rather than recycling a sales chase. Most of
// these estimates are already at "this is our final follow-up", and saying that
// a second time would be worse than saying nothing.
//
// Safety:
//   - Approved and Rejected estimates are excluded. 23 of the 75 are already
//     won; "last chance to lock in your pricing" to someone who signed months
//     ago is the worst possible email.
//   - EVERY link is fetched and must return HTTP 200 before its email is sent.
//     A remediation email with a second broken link is unforgivable.
//   - Dry run by default. --test sends only to one address. --apply sends.
//   - Resend is via the send-email function, so the Resend key stays server
//     side and is never read here.
//
// Usage:
//   node scripts/resend-broken-followups.mjs                 # dry run
//   node scripts/resend-broken-followups.mjs --test me@x.com # one real email
//   node scripts/resend-broken-followups.mjs --apply         # send for real

import { readFileSync } from 'fs'
import { estimatePhrase } from '../supabase/functions/_shared/estimateDescriptor.ts'

const APPLY = process.argv.includes('--apply')
const TEST_TO = (process.argv.find((a) => a.startsWith('--test=')) || '').split('=')[1]
  || (process.argv.includes('--test') ? process.argv[process.argv.indexOf('--test') + 1] : null)

const env = Object.fromEntries(
  readFileSync('.env', 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
const SB = env.VITE_SUPABASE_URL
const KEY = env.SUPABASE_SERVICE_ROLE_KEY
// Below this, an estimate is not worth an apology email. Bryce named the
// $11.17 one; the rule also catches a $0.00 estimate with 7 lines and no
// amount. Both read as scratch records rather than work anybody is waiting on.
const MIN_AMOUNT = 100
const APP_URL = 'https://jobscout.appsannex.com'
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }

const rest = async (path, init) => {
  const r = await fetch(`${SB}/rest/v1/${path}`, { headers: H, ...init })
  const t = await r.text()
  if (!r.ok) throw new Error(`${path} -> ${r.status} ${t.slice(0, 200)}`)
  return t ? JSON.parse(t) : null
}

const money = (n) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US')

// One email per PERSON, not per estimate. Four addresses have two open
// estimates each, and two near-identical apologies in one inbox reads worse
// than the original mistake.
function emailHtml({ companyName, items, contactLine }) {
  const many = items.length > 1
  const intro = many
    ? `Our last emails about your estimates had links that didn't work &mdash; our fault, and sorry for the run-around.`
    : `Our last email about ${items[0].phrase} had a link that didn't work &mdash; our fault, and sorry for the run-around.`
  const second = many
    ? `Here they are again, working this time:`
    : `Here it is again, working this time. You can view everything and approve it online:`
  const block = many
    ? items.map((i) => `
        <div style="border:1px solid #e8e4db;border-radius:8px;padding:14px 16px;margin:0 0 10px 0;">
          <p style="color:#2c3530;font-size:14px;line-height:1.5;margin:0 0 10px 0;">${i.phrase.replace(/^your (.)/, (_m, ch) => ch.toUpperCase())}</p>
          <a href="${i.url}" style="display:inline-block;padding:10px 22px;background-color:#5a6349;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;border-radius:6px;">View estimate</a>
        </div>`).join('')
    : `
        <div style="text-align:center;margin:24px 0;">
          <a href="${items[0].url}" style="display:inline-block;padding:14px 36px;background-color:#5a6349;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;border-radius:8px;">View Your Estimate</a>
        </div>`
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background-color:#f7f5ef;">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px;">
    <div style="height:4px;background-color:#5a6349;border-radius:4px 4px 0 0;"></div>
    <div style="background-color:#ffffff;border-radius:0 0 12px 12px;padding:40px 32px;border:1px solid #d6cdb8;border-top:none;">
      <div style="text-align:center;margin-bottom:28px;">
        <h1 style="color:#3e4532;font-size:26px;margin:0 0 6px 0;font-weight:700;">${companyName}</h1>
      </div>
      <div style="border-top:1px solid #e8e4db;padding-top:24px;">
        <p style="color:#2c3530;font-size:15px;line-height:1.7;margin:0 0 16px 0;">${intro}</p>
        <p style="color:#2c3530;font-size:15px;line-height:1.7;margin:0 0 16px 0;">${second}</p>
        ${block}
        <p style="color:#4d5a52;font-size:14px;line-height:1.6;margin:0;">
          No rush and no pressure &mdash; if ${many ? 'they are' : 'it is'} no longer something you need, just reply and
          let us know and we will stop following up.
        </p>
      </div>
      <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e8e4db;text-align:center;">
        <p style="color:#5a6349;font-size:13px;font-weight:600;margin:0 0 4px 0;">${companyName}</p>
        ${contactLine ? `<p style="color:#7d8a7f;font-size:11px;margin:0 0 8px 0;">${contactLine}</p>` : ''}
        <p style="color:#b4b9af;font-size:10px;margin:0;">Sent via Job Scout</p>
      </div>
    </div>
  </div>
</body></html>`
}

const main = async () => {
  // Only estimates still in play. Approved/Rejected/Expired/Draft are excluded.
  const quotes = await rest(
    'quotes?followup_count=gt.0&status=in.(Sent,Negotiation)&sent_to_email=not.is.null'
    + '&select=id,company_id,quote_id,status,service_type,quote_amount,sent_to_email,portal_token,last_sent_at'
    + '&order=last_sent_at.desc',
  )
  const live = quotes
    .filter((q) => String(q.sent_to_email || '').includes('@'))
    .filter((q) => Number(q.quote_amount) >= MIN_AMOUNT)

  const companies = await rest('companies?select=id,company_name,phone,owner_email')
  const byCompany = new Map(companies.map((c) => [c.id, c]))

  console.log(`${live.length} open estimates with a broken follow-up\n`)

  const ready = []
  const problems = []

  for (const q of live) {
    const co = byCompany.get(q.company_id) || {}
    // Refresh the SAME token rather than minting a new one, so the link already
    // in their inbox starts working too (the rule EstimateDetail follows).
    const expiry = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString()
    let token = q.portal_token
    if (token) {
      const upd = await rest(
        `customer_portal_tokens?document_type=eq.estimate&document_id=eq.${q.id}&token=eq.${encodeURIComponent(token)}&select=token`,
        { method: 'PATCH', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify({ expires_at: expiry, is_revoked: false }) },
      )
      if (!upd?.length) token = null
    }
    if (!token) {
      const rows = await rest(`customer_portal_tokens?document_type=eq.estimate&document_id=eq.${q.id}&select=token&order=created_at.desc&limit=1`)
      if (rows?.length) {
        token = rows[0].token
        await rest(`customer_portal_tokens?token=eq.${encodeURIComponent(token)}`, {
          method: 'PATCH', body: JSON.stringify({ expires_at: expiry, is_revoked: false }),
        })
      }
    }
    if (!token) { problems.push({ id: q.id, why: 'no portal token at all' }); continue }

    const url = `${APP_URL}/portal/${token}`
    // The whole point. A remediation email with a second dead link is worse
    // than sending nothing, so the link is FETCHED, not assumed.
    let status = 0
    try { status = (await fetch(url, { redirect: 'follow' })).status } catch { status = 0 }
    if (status !== 200) { problems.push({ id: q.id, why: `link returned HTTP ${status}` }); continue }

    const lines = (await rest(`quote_lines?quote_id=eq.${q.id}&select=id`)) || []
    const phrase = estimatePhrase({
      quoteNumber: q.quote_id, serviceType: q.service_type,
      amount: q.quote_amount, lineCount: lines.length,
    })
    ready.push({ quote: q, to: q.sent_to_email, co, phrase, url })
  }

  console.log(`LINK CHECK: ${ready.length} verified HTTP 200, ${problems.length} skipped`)
  for (const p of problems) console.log(`  skip estimate ${p.id}: ${p.why}`)
  console.log()

  // One letter per PERSON, not per estimate. Several addresses carry two open
  // estimates, and two near-identical apologies in one inbox reads worse than
  // the original mistake.
  const byPerson = new Map()
  for (const r of ready) {
    const key = String(r.to).trim().toLowerCase()
    if (!byPerson.has(key)) byPerson.set(key, { to: r.to, co: r.co, items: [] })
    byPerson.get(key).items.push(r)
  }
  const letters = [...byPerson.values()].map((g) => {
    const co = g.co || {}
    const contactLine = [co.phone, co.owner_email].filter(Boolean).join(' &nbsp;|&nbsp; ')
    const total = g.items.reduce((a, i) => a + (Number(i.quote.quote_amount) || 0), 0)
    return {
      to: g.to,
      items: g.items,
      subject: g.items.length > 1
        ? `Your estimate links — fixed (${g.items.length} estimates)`
        : `Your estimate link — fixed${total ? ` (${money(total)})` : ''}`,
      html: emailHtml({ companyName: co.company_name || 'Our Company', items: g.items, contactLine }),
      from: `${co.company_name || 'Our Company'} <estimates@appsannex.com>`,
      replyTo: co.owner_email || null,
    }
  })

  if (TEST_TO) {
    // Prefer a MULTI-estimate letter for the test, so the merged layout is what
    // gets eyeballed — the single version was already checked.
    const one = letters.find((l) => l.items.length > 1) || letters[0]
    if (!one) { console.log('nothing to test with'); return }
    console.log(`TEST SEND to ${TEST_TO}`)
    console.log(`  subject : ${one.subject}`)
    for (const i of one.items) console.log(`  estimate: ${i.phrase}`)
    for (const i of one.items) console.log(`  link    : ${i.url}`)
    const r = await fetch(`${SB}/functions/v1/send-email`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ to: TEST_TO, subject: `[TEST] ${one.subject}`, html: one.html, from: one.from, ...(one.replyTo ? { reply_to: one.replyTo } : {}) }),
    })
    console.log(`  -> send-email HTTP ${r.status} ${(await r.text()).slice(0, 160)}`)
    return
  }

  if (!APPLY) {
    console.log('DRY RUN — nothing sent. Would send:')
    for (const l of letters) {
      const what = l.items.map((i) => i.phrase.replace(/^your /, '')).join('   +   ')
      console.log(`  ${String(l.to).padEnd(36)} ${l.items.length > 1 ? `${l.items.length} ests` : '1 est '}  ${what}`)
    }
    console.log(`\n  total: ${letters.length} emails covering ${ready.length} estimates`)
    console.log('  run with --test <email> to see one, then --apply to send')
    return
  }

  let sent = 0, failed = 0
  for (const r of letters) {
    const res = await fetch(`${SB}/functions/v1/send-email`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ to: r.to, subject: r.subject, html: r.html, from: r.from, ...(r.replyTo ? { reply_to: r.replyTo } : {}) }),
    })
    if (res.ok) {
      sent++
      // On the communications log, so the office can see it went.
      await rest('communications_log', {
        method: 'POST',
        body: JSON.stringify({
          company_id: r.items[0].quote.company_id, direction: 'out', type: 'email',
          trigger: 'followup_link_repair', customer_id: null,
          recipient: r.to, sent_date: new Date().toISOString().slice(0, 10),
          status: 'sent', response: r.subject,
        }),
      }).catch(() => {})
      console.log(`  sent  ${r.items.map((i) => i.quote.quote_id || i.quote.id).join(',')} -> ${r.to}`)
    } else {
      failed++
      console.log(`  FAIL  ${r.items.map((i) => i.quote.quote_id || i.quote.id).join(',')} -> ${r.to}: HTTP ${res.status} ${(await res.text()).slice(0, 140)}`)
    }
  }
  console.log(`\nsent ${sent}, failed ${failed}`)
}

main().catch((e) => { console.error('FAILED:', e.message); process.exit(1) })
