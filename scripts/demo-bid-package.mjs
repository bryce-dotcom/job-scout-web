// Dougie demo: a realistic invitation-to-bid PDF run through dougie-bid-intake
// in the DEMO tenant (company 25). Re-run any time to put a fresh bid on
// Dougie's page for a sales demo (about a minute). Remove it afterwards with
// the ids it prints. Live rehearsal of Dougie's bid intake in the DEMO tenant.
// 1. Make a realistic invitation-to-bid PDF.  2. Upload it the way the page
// does.  3. Sign in as the demo owner and call dougie-bid-intake.  4. Print
// what landed.  Cleanup is a separate script (tmp-bid-cleanup.mjs).
import { jsPDF } from 'jspdf'
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
const env = Object.fromEntries(fs.readFileSync('.env', 'utf8').split('\n').filter(l => l.includes('=')).map(l => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()] }))
const OUT = process.argv[2] || 'ITB_2026-114_LED_Retrofit.pdf'

// ── 1. The package
const doc = new jsPDF({ unit: 'pt', format: 'letter' })
const W = doc.internal.pageSize.getWidth(); const M = 54
let y = M
const H = (t, s = 16) => { doc.setFont('helvetica', 'bold'); doc.setFontSize(s); doc.text(t, M, y); y += s + 8 }
const P = (t, s = 10.5) => { doc.setFont('helvetica', 'normal'); doc.setFontSize(s); const ls = doc.splitTextToSize(t, W - 2 * M); doc.text(ls, M, y); y += ls.length * (s + 3) + 6 }
H('CITY OF OGDEN — PARKS & RECREATION DEPARTMENT', 14)
H('INVITATION TO BID No. ITB 2026-114', 18)
H('LED Lighting Retrofit — Lorin Farr Park Recreation Center', 13)
P('The City of Ogden, Utah ("City") invites sealed bids for the furnishing and installation of LED lighting fixtures and controls at the Lorin Farr Park Recreation Center, 1691 Gramercy Ave, Ogden, UT 84404, in accordance with the specifications contained herein.')
P('BIDS DUE: Tuesday, October 14, 2026 at 2:00 PM Mountain Time. Bids received after this time will not be opened.')
P('SUBMIT TO: Ogden City Purchasing Division, 2549 Washington Blvd, Suite 510, Ogden, UT 84401, or electronically through the Utah Public Procurement Place (U3P) portal. Envelopes shall be marked "ITB 2026-114 — LED Retrofit".')
P('BID FORM: Bidders shall complete the Bid Schedule on page 3 in its entirety, entering a unit price and extended price for every item. Item numbers and quantities shall not be altered. The Base Bid and Alternate 1 shall be priced separately. Lump-sum ("LS") items shall be priced as a single unit.')
P('ACKNOWLEDGEMENTS: Bidder shall acknowledge receipt of Addendum No. 1 dated September 30, 2026 and Addendum No. 2 dated October 3, 2026 by initialing the Bid Schedule.')
P('BID SECURITY: Five percent (5%) bid bond. PERFORMANCE: Work shall be substantially complete within 60 calendar days of Notice to Proceed. Prevailing wage rates apply.')
doc.addPage(); y = M
H('SECTION 26 51 00 — INTERIOR AND EXTERIOR LIGHTING (SPECIFICATIONS)', 13)
P('2.1 LED HIGH BAY FIXTURES: Nominal 150 W, minimum 21,000 delivered lumens, 5000 K CCT, CRI 80+, 0-10 V dimming driver, DLC Premium listed, L70 ≥ 100,000 hours, 5-year manufacturer warranty. Basis of design: Lithonia JEBL or approved equal.')
P('2.2 LED FLAT PANELS: 2 ft × 4 ft recessed troffer, nominal 40 W, minimum 5,000 delivered lumens, 4000 K, DLC Standard listed, 0-10 V dimming.')
P('2.3 EXTERIOR WALL PACKS: Nominal 80 W full-cutoff LED wall pack, 5000 K, integral photocell, IP65, dark-bronze finish, DLC listed.')
P('2.4 OCCUPANCY SENSORS: Ceiling-mount dual-technology (PIR + ultrasonic), 0-10 V, 2000 sq ft coverage, UL listed.')
P('2.5 EXIT SIGNS: LED exit sign, red letters, universal mounting, 90-minute battery backup, UL 924.')
P('2.6 POLE BASES: Precast concrete light pole base, 24 in diameter × 48 in depth, with galvanized anchor bolts and conduit stubs per pole manufacturer template.')
P('2.7 PHOTOCONTROLS: Twist-lock electronic photocontrol, 120-277 V, ANSI C136.10, 10-year rated.')
P('3.1 INSTALLATION: Contractor shall remove and lawfully dispose of existing fixtures and lamps (including fluorescent lamp recycling), furnish and install all new fixtures, and provide controls commissioning and two hours of owner training.')
doc.addPage(); y = M
H('BID SCHEDULE — ITB 2026-114', 14)
P('Bidder: ______________________________   Addendum No. 1 ____   Addendum No. 2 ____', 10)
const cols = [['Item', 40], ['Description', 270], ['Qty', 40], ['Unit', 40], ['Unit Price', 60], ['Extended', 60]]
const row = (cells, bold = false) => {
  doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(9.5)
  let x = M; let maxLines = 1
  const wrapped = cells.map((c, i) => { const ls = doc.splitTextToSize(String(c), cols[i][1] - 6); maxLines = Math.max(maxLines, ls.length); return ls })
  wrapped.forEach((ls, i) => { doc.text(ls, x + 3, y); x += cols[i][1] })
  y += maxLines * 12 + 4
  doc.setDrawColor(180); doc.line(M, y - 3, M + cols.reduce((t, c) => t + c[1], 0), y - 3)
}
const section = (name, items) => { doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(name, M, y); y += 14; row(cols.map(c => c[0]), true); items.forEach(it => row(it)); doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text(`${name.toUpperCase()} TOTAL: $______________`, M + 300, y + 4); y += 26 }
section('Base Bid', [
  ['1', 'LED high bay fixture, 150 W, 21,000 lm min, 5000 K, 0-10 V dimming, DLC Premium (Spec 2.1)', '24', 'EA', '', ''],
  ['2', 'LED flat panel 2×4, 40 W, 5,000 lm, 4000 K, DLC (Spec 2.2)', '30', 'EA', '', ''],
  ['3', 'Exterior LED wall pack, 80 W, full cutoff, integral photocell, dark bronze (Spec 2.3)', '8', 'EA', '', ''],
  ['4', 'Ceiling-mount dual-technology occupancy sensor, 0-10 V (Spec 2.4)', '12', 'EA', '', ''],
  ['5', 'LED exit sign, universal mount, 90-min battery backup (Spec 2.5)', '6', 'EA', '', ''],
  ['6', 'Installation labor per fixture, including removal and lawful disposal of existing fixture (Spec 3.1)', '80', 'EA', '', ''],
  ['7', 'Precast concrete pole base, 24 in × 48 in, with anchor bolts (Spec 2.6)', '4', 'EA', '', ''],
  ['8', 'Twist-lock electronic photocontrol, 120-277 V, ANSI C136.10 (Spec 2.7)', '8', 'EA', '', ''],
  ['9', 'Lighting controls commissioning and owner training (Spec 3.1)', '1', 'LS', '', ''],
])
section('Alternate 1', [
  ['A-1', 'Replace existing 4-ft T8 fluorescent lamps with Type B LED tubes, DLC listed, in existing fixtures', '120', 'EA', '', ''],
])
doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
doc.text('Authorized Signature: ______________________________   Title: ______________   Date: __________', M, y + 10)
const pdfBytes = Buffer.from(doc.output('arraybuffer'))
fs.writeFileSync(OUT, pdfBytes)
console.log('package written', OUT, pdfBytes.length, 'bytes,', doc.getNumberOfPages(), 'pages')

// ── 2. Upload as the page would, 3. sign in as the demo owner, call Dougie
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)
const { data: auth, error: aErr } = await sb.auth.signInWithPassword({ email: 'demo@jobscout.app', password: 'Demo1234!' })
if (aErr) { console.error('demo sign-in failed:', aErr.message); process.exit(1) }
const path = `bids/25/${Date.now()}_ITB_2026-114_LED_Retrofit.pdf`
const { error: upErr } = await sb.storage.from('project-documents').upload(path, pdfBytes, { contentType: 'application/pdf' })
if (upErr) { console.error('upload failed:', upErr.message); process.exit(1) }
console.log('uploaded', path)
const { data: lead } = await sb.from('leads').select('id, customer_name, business_name').eq('company_id', 25).order('id', { ascending: false }).limit(1).single()
console.log('lead', lead)
const t0 = Date.now()
const res = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/dougie-bid-intake`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${auth.session.access_token}`, apikey: env.VITE_SUPABASE_ANON_KEY },
  body: JSON.stringify({ company_id: 25, mode: 'create', storage_path: path, storage_bucket: 'project-documents', file_name: 'ITB_2026-114_LED_Retrofit.pdf', media_type: 'application/pdf', lead_id: lead.id }),
})
const out = await res.json().catch(() => ({}))
console.log('dougie', res.status, `${Math.round((Date.now() - t0) / 1000)}s`, JSON.stringify(out, null, 1))
if (out.quote_id) {
  const { data: lines } = await sb.from('quote_lines').select('bid_item_no, item_name, quantity, unit_of_measure, price, price_source, match_kind, match_note, sourced_price, source_note').eq('quote_id', out.quote_id).order('sort_order')
  for (const l of lines || []) console.log(`  [${l.bid_item_no}] ${l.item_name} × ${l.quantity} ${l.unit_of_measure || ''} @ $${l.price} | ${l.price_source} | ${l.match_kind} | ${(l.match_note || '').slice(0, 110)}${l.source_note ? ' | basis: ' + l.source_note.slice(0, 80) : ''}`)
  const { data: q } = await sb.from('quotes').select('id, quote_amount, document_type, estimate_name, settings_overrides, bid_intake').eq('id', out.quote_id).single()
  console.log('quote', q.id, q.document_type, q.settings_overrides?.presentation_mode, '$' + q.quote_amount, '|', q.estimate_name)
  console.log('bid_intake', JSON.stringify({ ...q.bid_intake, sections: q.bid_intake?.sections?.map(s => `${s.name}: ${s.item_nos.join(',')}`) }, null, 1))
}
await sb.auth.signOut()
