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
<p>Customers opt in when they request an estimate or book work and agree to receive texts; we record that consent with their mobile number. Staff opt in when they give us their mobile number for work notifications. Consent is not a condition of any purchase.</p>

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

module.exports = async function handler(req, res) {
  const slug = String(req.query?.slug || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 80)
  const doc = String(req.query?.doc || '')
  if (!['privacy', 'sms-terms'].includes(doc)) return res.status(404).send('Not found')
  const c = await companyFor(slug)
  if (!c) return res.status(404).setHeader('Content-Type', 'text/html; charset=utf-8').send(page('Not found', '<h1>Not found</h1><p>No company at this address.</p>'))
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
  return res.status(200).send(doc === 'privacy' ? privacy(c, slug) : smsTerms(c, slug))
}
