// Compose (and optionally send) Alayda's "fixtures needing an order code" email.
//   node scripts/send-missing-codes-email.mjs <json> <htmlOut>          # build + preview only
//   node scripts/send-missing-codes-email.mjs <json> <htmlOut> --send    # actually send
import { config } from 'dotenv'
import fs from 'node:fs'
config()

const [jsonPath, htmlOut] = process.argv.slice(2)
const SEND = process.argv.includes('--send')
const { needing, totalFixtures, lines } = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))

const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const A = '#5a6349', BORDER = '#d6cdb8', MUT = '#7d8a7f', INK = '#2c3530'

const famBlocks = needing.map((f) => {
  const rows = f.missing.map((m) => `
      <tr>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;font-weight:600;color:${INK};white-space:nowrap">${esc(m.watt)}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;color:${MUT};font-family:ui-monospace,Menlo,monospace;font-size:12px">${m.model ? esc(m.model) : '<span style="color:#b45309">no model # on file</span>'}</td>
        <td style="padding:6px 10px;border-bottom:1px solid #eee;color:${MUT};text-align:right;white-space:nowrap">${m.variants} variant${m.variants > 1 ? 's' : ''}</td>
      </tr>`).join('')
  return `
    <tr><td colspan="3" style="padding:14px 10px 4px;font-weight:700;color:${A};font-size:14px">${esc(f.label)} <span style="font-weight:400;color:${MUT}">— ${f.missing.length} fixture${f.missing.length > 1 ? 's' : ''}</span></td></tr>
    ${rows}`
}).join('')

const html = `<!doctype html><html><body style="margin:0;background:#f7f5ef;padding:24px;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:${INK}">
  <div style="max-width:640px;margin:0 auto;background:#fff;border:1px solid ${BORDER};border-radius:12px;overflow:hidden">
    <div style="background:${A};color:#fff;padding:18px 22px">
      <div style="font-size:18px;font-weight:700">Fixtures that need an order code</div>
      <div style="font-size:13px;opacity:.85;margin-top:2px">Energy Scout catalog · ${totalFixtures} fixtures across ${lines} product lines</div>
    </div>
    <div style="padding:22px">
      <p style="margin:0 0 12px;font-size:14px;line-height:1.5">Hi Alayda,</p>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.5">We just rolled out a new way to pick products on estimates — instead of scrolling dozens of near-identical rows, each fixture line is now one tile where you choose the wattage and install options (like picking a T-shirt size). Every pick lands on a real product that carries its own <b>order code</b>, so purchase orders stop being guesswork.</p>
      <p style="margin:0 0 12px;font-size:14px;line-height:1.5">To finish the job, the fixtures below still need an order code from the vendor. <b>One code per fixture covers all of its install variants</b> (base, w/ Lift, w/ Controls, Relocate, etc.), so this is ${totalFixtures} codes to source, not one per row. Where we already have a manufacturer model # on file, it's listed to help you match.</p>
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:8px">
        <thead>
          <tr>
            <th style="text-align:left;padding:6px 10px;border-bottom:2px solid ${BORDER};color:${MUT};font-size:11px;text-transform:uppercase;letter-spacing:.04em">Wattage / fixture</th>
            <th style="text-align:left;padding:6px 10px;border-bottom:2px solid ${BORDER};color:${MUT};font-size:11px;text-transform:uppercase;letter-spacing:.04em">Model # on file</th>
            <th style="text-align:right;padding:6px 10px;border-bottom:2px solid ${BORDER};color:${MUT};font-size:11px;text-transform:uppercase;letter-spacing:.04em">Covers</th>
          </tr>
        </thead>
        <tbody>${famBlocks}</tbody>
      </table>
      <p style="margin:18px 0 0;font-size:13px;color:${MUT};line-height:1.5">Once you have the codes, drop them on the product (or send them my way and I'll load them in). After that, every PO for these fixtures fills in the order code automatically.</p>
      <p style="margin:14px 0 0;font-size:14px">Thanks!<br>Bryce</p>
    </div>
  </div>
</body></html>`

fs.writeFileSync(htmlOut, html)
console.log(`wrote ${htmlOut} (${html.length} chars, ${needing.length} families, ${totalFixtures} fixtures)`)

if (!SEND) { console.log('[preview only] add --send to email it.'); process.exit(0) }

const url = `${process.env.VITE_SUPABASE_URL}/functions/v1/send-email`
const res = await fetch(url, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    to: 'alayda@hhh.services',
    reply_to: 'bryce@hhh.services',
    from: 'JobScout <invoices@appsannex.com>',
    subject: `${totalFixtures} fixtures need an order code (new variant picker)`,
    html,
  }),
})
const out = await res.json()
console.log('send-email result:', JSON.stringify(out))
