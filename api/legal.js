// A company's privacy policy and SMS terms, as REAL HTML.
//
//   /legal/:slug/privacy     → this file, ?slug=…&doc=privacy
//   /legal/:slug/sms-terms   → this file, ?slug=…&doc=sms-terms
//
// WHY THIS EXISTS. HHH's text-message campaign was rejected by the carriers
// (2026-10-16, Twilio 30882 + 30908: terms, and "a compliant privacy policy
// can not be verified"). The pages it pointed at — /privacy, /sms-terms/:slug —
// are React routes: a reviewer's crawler fetches them and gets the empty app
// shell, no text at all. HHH's own website links "Privacy Policy" to "#". So
// nothing a carrier could read existed anywhere.
//
// These are rendered on the server, need no JavaScript and no session, and
// carry the wording carrier reviewers look for: mobile numbers and opt-in
// consent are never shared or sold, STOP/HELP, frequency, rates, carriers not
// liable. Per company, because each tenant registers its own brand and the
// reviewer matches the page to that brand.

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

async function companyFor(slug) {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key || !slug) return null
  try {
    const r = await fetch(`${url}/functions/v1/public-company-card?slug=${encodeURIComponent(slug)}`, { headers: { apikey: key } })
    const d = r.ok ? await r.json() : null
    return d && !d.error && d.company_name ? d : null
  } catch { return null }
}

function page(title, body) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>
  body { margin: 0; background: #f7f5ef; color: #2c3530; font: 15px/1.7 system-ui, -apple-system, "Segoe UI", Arial, sans-serif; }
  main { max-width: 760px; margin: 0 auto; padding: 32px 22px 56px; }
  h1 { font-size: 28px; line-height: 1.2; margin: 0 0 4px; }
  h2 { font-size: 18px; margin: 28px 0 8px; }
  p, li { color: #4d5a52; } .muted { color: #7d8a7f; font-size: 13px; }
  .box { background: #fff; border: 1px solid #d6cdb8; border-radius: 10px; padding: 14px 16px; }
  a { color: #5a6349; }
</style></head><body><main>${body}</main></body></html>`
}

function privacy(c, slug) {
  const name = esc(c.company_name), legal = c.legal_name && c.legal_name !== c.company_name ? ` (${esc(c.legal_name)})` : ''
  const contact = [c.phone ? `phone ${esc(c.phone)}` : '', c.website ? `<a href="${esc(c.website)}">${esc(c.website)}</a>` : ''].filter(Boolean).join(' · ')
  return page(`${c.company_name} — Privacy Policy`, `
<h1>Privacy Policy</h1>
<p class="muted">${name}${legal} · Effective October 16, 2026</p>

<h2>Who we are</h2>
<p>This policy explains what ${name}${legal} collects from its customers and staff, how we use it, and the choices you have. Contact us: ${contact || 'through the office you work with'}.</p>

<h2>What we collect</h2>
<ul>
  <li>Contact details you give us — name, business name, email address, mobile phone number and service address.</li>
  <li>Details of the work — estimates, appointments, job notes, photos, and any rebate or financing paperwork.</li>
  <li>Billing records — invoices and payment status. Card and bank details are handled by our payment processor, not stored by us.</li>
</ul>

<h2>How we use it</h2>
<p>To prepare estimates, schedule and perform work, send invoices and receipts, handle rebates, provide customer service, and send the text messages and emails you have agreed to receive. We run our business on the JobScout job-management software, which stores this information for us.</p>

<h2>Text messages (SMS)</h2>
<div class="box">
  <p><strong>No mobile information will be shared with third parties or affiliates for marketing or promotional purposes.</strong> Information sharing with subcontractors that support our services, such as customer service, is permitted. All other categories exclude text-messaging originator opt-in data and consent: this information will not be shared with any third parties.</p>
</div>
<p>We text only about work you asked for — estimates, appointments, jobs and invoices — and, for our staff, their own schedules and work. Message frequency varies. Message and data rates may apply. Reply STOP to opt out at any time, or HELP for help. Full terms: <a href="/legal/${esc(slug)}/sms-terms">Text message terms</a>.</p>

<h2>Who we share it with</h2>
<p>Only service providers that help us run the work — our job-management software (JobScout), our messaging provider (Twilio), our email provider, and our payment processor — and only to provide those services, under their own confidentiality obligations. We do not sell personal information. We may disclose information if the law requires it.</p>

<h2>How long we keep it</h2>
<p>For as long as we are doing business together and afterwards as long as tax, warranty and rebate records require.</p>

<h2>Your choices</h2>
<p>You can ask to see, correct or delete your information by contacting us. Reply STOP to any text to stop texts; unsubscribe links stop email. Stopping messages does not affect work already agreed.</p>

<h2>Changes</h2>
<p>We will post any change to this policy on this page with a new effective date.</p>
`)
}

function smsTerms(c, slug) {
  const name = esc(c.company_name)
  const help = [c.phone ? `call ${esc(c.phone)}` : '', c.website ? `visit <a href="${esc(c.website)}">${esc(c.website)}</a>` : ''].filter(Boolean).join(' or ')
  return page(`${c.company_name} — Text Message Terms`, `
<h1>Text message terms</h1>
<p class="muted">${name} Notifications · Effective October 16, 2026</p>

<div class="box"><p><strong>What you agree to:</strong> ${name} may text me about my estimates, appointments, jobs and invoices. Message frequency varies, and message and data rates may apply. Reply STOP to stop, HELP for help.</p></div>

<h2>Program</h2>
<p><strong>${name} Notifications</strong> sends text messages about work you have asked for or are doing with us: estimates and follow-ups on them, appointment confirmations and reminders, crew-on-the-way notices, invoices and payment receipts. Our own staff also receive messages about their schedules, assigned jobs and daily work. We do not send marketing or promotional texts.</p>

<h2>How you opt in</h2>
<p>Customers and staff opt in on our sign-up page, <a href="/legal/${esc(slug)}/text-signup">Get text updates from ${name}</a>: they enter their mobile number and tick a box — never ticked for them — that says exactly what is in "What you agree to" above. Customers can also tick the same box when they request an estimate online or view an estimate or invoice we sent them. We keep each consent with its date. Consent is not a condition of any purchase.</p>

<h2>Message frequency and cost</h2>
<p>Message frequency varies with your jobs. Message and data rates may apply, depending on your mobile plan.</p>

<h2>Stop and help</h2>
<p>Reply <strong>STOP</strong> to any message to opt out; you will receive one confirmation and no further texts. Reply <strong>START</strong> to opt back in. Reply <strong>HELP</strong> for help${help ? `, or ${help}` : ''}.</p>

<h2>Carriers</h2>
<p>Carriers are not liable for delayed or undelivered messages.</p>

<h2>Privacy</h2>
<p>Mobile numbers and opt-in consent are never sold or shared with third parties for marketing. See our <a href="/legal/${esc(slug)}/privacy">Privacy Policy</a>.</p>
`)
}

// ── The sign-up page: the call to action a carrier can verify ───────────────
//
// /legal/:slug/text-signup. The campaign was rejected a second time
// (2026-10-21, Twilio 30909: "issues verifying the Call to Action") because
// it said "our office records consent" — nothing a reviewer can open. This
// is: the business's name, what it texts about, an UNTICKED box with the
// registered sentence, the terms and the privacy policy. A plain HTML form —
// no JavaScript — that posts back here; the opt-in is kept in sms_opt_ins
// with the words agreed to, when and from where.

/** The sentence the carriers registered (src/lib/smsConsent.js consentDisclosure). */
const disclosure = (name) => `${String(name || '').trim() || 'this company'} may text me about my estimates, appointments, jobs and invoices. `
  + 'Message frequency varies, and message and data rates may apply. Reply STOP to stop, HELP for help.'

/** 10 US digits, or null; a leading 1 is dropped. */
function usMobile(raw) {
  let d = String(raw ?? '').replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1)
  return /^[2-9]\d{2}[2-9]\d{6}$/.test(d) ? d : null
}

function textSignup(c, slug, state = {}) {
  const name = esc(c.company_name)
  const links = `<p class="muted"><a href="/legal/${esc(slug)}/sms-terms">Text message terms</a> · <a href="/legal/${esc(slug)}/privacy">Privacy policy</a>${c.phone ? ` · ${esc(c.phone)}` : ''}</p>`
  if (state.done) {
    return page(`${c.company_name} — Text sign-up`, `
<h1>You're signed up</h1>
<p>${name} will text ${esc(state.phone)} about your estimates, appointments, jobs and invoices. Message frequency varies, and message and data rates may apply. Reply <strong>STOP</strong> to any text to stop, <strong>HELP</strong> for help.</p>
${links}`)
  }
  return page(`${c.company_name} — Get text updates`, `
<h1>Get text updates from ${name}</h1>
<p>Texts about work you have asked for or are doing with us — estimates, appointment confirmations and reminders, crew-on-the-way notices, invoices and receipts — and, for our staff, their schedules and jobs. No marketing or promotions.</p>
<form method="post" action="/legal/${esc(slug)}/text-signup" class="box">
  <p><label for="n"><strong>Your name</strong></label><br><input id="n" name="name" autocomplete="name" value="${esc(state.name || '')}" style="width:100%;padding:10px;border:1px solid #d6cdb8;border-radius:8px;font:inherit;box-sizing:border-box"></p>
  <p><label for="p"><strong>Mobile number</strong></label><br><input id="p" name="phone" type="tel" inputmode="tel" autocomplete="tel" required placeholder="(801) 555-0100" value="${esc(state.phone || '')}" style="width:100%;padding:10px;border:1px solid #d6cdb8;border-radius:8px;font:inherit;box-sizing:border-box"></p>
  <p><label style="display:flex;gap:10px;align-items:flex-start"><input type="checkbox" name="agree" value="yes" style="width:18px;height:18px;margin-top:4px;flex-shrink:0"> <span>${esc(disclosure(c.company_name))}</span></label></p>
  ${state.error ? `<p role="alert" style="color:#b91c1c">${esc(state.error)}</p>` : ''}
  <p><button type="submit" style="padding:11px 18px;border:0;border-radius:8px;background:#5a6349;color:#fff;font:inherit;font-weight:700;cursor:pointer">Sign me up for texts</button></p>
  <p class="muted">The box is not ticked for you. Agreeing to texts is not a condition of any purchase. Message frequency varies; message and data rates may apply. Reply STOP to stop, HELP for help.</p>
</form>
${links}`)
}

/** Record an opt-in. Returns an error sentence, or null when kept. */
async function recordOptIn(slug, body, req) {
  const url = process.env.VITE_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return 'Sign-up is not available right now.'
  if (String(body?.agree || '') !== 'yes') return 'Tick the box to agree to texts.'
  const phone = usMobile(body?.phone)
  if (!phone) return 'Enter a 10-digit US mobile number.'
  const H = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
  const [co] = await fetch(`${url}/rest/v1/companies?public_quote_slug=eq.${encodeURIComponent(slug)}&select=id,company_name&limit=1`, { headers: H }).then((r) => (r.ok ? r.json() : []))
  if (!co) return 'No company at this address.'
  const ip = String(req.headers?.['x-forwarded-for'] || '').split(',')[0].trim() || null
  if (ip) {
    const since = new Date(Date.now() - 3600_000).toISOString()
    const recent = await fetch(`${url}/rest/v1/sms_opt_ins?select=id&ip=eq.${encodeURIComponent(ip)}&created_at=gte.${since}&limit=11`, { headers: H }).then((r) => (r.ok ? r.json() : []))
    if (recent.length >= 10) return 'Too many sign-ups from here — try again later.'
  }
  const r = await fetch(`${url}/rest/v1/sms_opt_ins`, {
    method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify({
      company_id: co.id, phone, name: String(body?.name || '').replace(/[<>]/g, '').trim().slice(0, 120) || null,
      disclosure: disclosure(co.company_name), source: 'web_form', ip,
      user_agent: String(req.headers?.['user-agent'] || '').slice(0, 300) || null,
    }),
  })
  return r.ok ? null : 'That did not save — try again.'
}

module.exports = async function handler(req, res) {
  const slug = String(req.query?.slug || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 80)
  const doc = String(req.query?.doc || '')
  if (!['privacy', 'sms-terms', 'text-signup'].includes(doc)) return res.status(404).send('Not found')
  const c = await companyFor(slug)
  if (!c) return res.status(404).setHeader('Content-Type', 'text/html; charset=utf-8').send(page('Not found', '<h1>Not found</h1><p>No company at this address.</p>'))
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  if (doc === 'text-signup') {
    // A form is never cached: what it shows depends on what was just sent.
    res.setHeader('Cache-Control', 'no-store')
    if (req.method === 'POST') {
      const body = req.body && typeof req.body === 'object' ? req.body : Object.fromEntries(new URLSearchParams(String(req.body || '')))
      const error = await recordOptIn(slug, body, req)
      const phone = usMobile(body?.phone)
      return res.status(error ? 400 : 200).send(textSignup(c, slug, error
        ? { error, name: body?.name, phone: body?.phone }
        : { done: true, phone: phone ? `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}` : '' }))
    }
    return res.status(200).send(textSignup(c, slug))
  }
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
  return res.status(200).send(doc === 'privacy' ? privacy(c, slug) : smsTerms(c, slug))
}
module.exports.usMobile = usMobile
module.exports.disclosure = disclosure
