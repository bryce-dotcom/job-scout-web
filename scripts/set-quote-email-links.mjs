// Configure the extra links on outgoing quote emails.
//
// Cole (9bcf6581): "Can we send links to the energy scout website and the link
// to Rocky Mountain Power approved vendor list."
//
// Scoped per business unit — an Energy Scout link has no business on an HHH
// Building Services window-cleaning quote. Omit business_unit for a link that
// belongs on every quote. See supabase/functions/_shared/quoteEmailLinks.ts.
//
//   node scripts/set-quote-email-links.mjs                                  # show current
//   node scripts/set-quote-email-links.mjs --add "Energy Scout|Label|https://…" --write
//   node scripts/set-quote-email-links.mjs --clear --write
//
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { resolveQuoteEmailLinks } from '../supabase/functions/_shared/quoteEmailLinks.ts'
config()

const argAll = (name) => process.argv.reduce((acc, v, i) =>
  v === `--${name}` && process.argv[i + 1] ? [...acc, process.argv[i + 1]] : acc, [])
const one = (name, d = null) => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? d : process.argv[i + 1]
}
const WRITE = process.argv.includes('--write')
const CLEAR = process.argv.includes('--clear')
const COMPANY = Number(one('company', 3))
const KEY = 'quote_email_links'
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

;(async () => {
  const { data: row, error } = await s.from('settings')
    .select('id,value').eq('company_id', COMPANY).eq('key', KEY).maybeSingle()
  if (error) { console.error('QUERY FAILED:', error.message); process.exit(1) }

  let current = []
  try { current = JSON.parse(row?.value ?? '[]') } catch { current = [] }
  if (!Array.isArray(current)) current = []

  console.log(`company ${COMPANY} — ${current.length} link(s) configured:`)
  for (const l of current) console.log(`  [${l.business_unit || 'all quotes'}] ${l.label} -> ${l.url}`)

  let next = CLEAR ? [] : [...current]
  for (const spec of argAll('add')) {
    const [bu, label, url] = spec.split('|').map((x) => (x ?? '').trim())
    if (!url) { console.error(`bad --add "${spec}" — expected "BusinessUnit|Label|https://url"`); process.exit(1) }
    next = next.filter((l) => l.url !== url)
    next.push(bu ? { business_unit: bu, label, url } : { label, url })
  }

  // Run it through the real resolver: anything it would drop at send time
  // (a non-http url, a duplicate) should not be written in the first place.
  const kept = resolveQuoteEmailLinks(JSON.stringify(next), null)
  const scoped = next.filter((l) => l.business_unit)
  console.log(`\nwould store ${next.length} link(s)  (${kept.length} unscoped-valid, ${scoped.length} scoped)`)
  for (const l of next) {
    const ok = resolveQuoteEmailLinks(JSON.stringify([{ ...l, business_unit: undefined }]), null).length === 1
    console.log(`  ${ok ? 'ok  ' : 'DROP'} [${l.business_unit || 'all quotes'}] ${l.label} -> ${l.url}`)
    if (!ok) { console.error('   refusing to write a link the sender would discard'); process.exit(1) }
  }

  if (!WRITE) { console.log('\ndry run — re-run with --write'); return }
  const value = JSON.stringify(next)
  const { error: wErr } = row
    ? await s.from('settings').update({ value }).eq('id', row.id)
    : await s.from('settings').insert({ company_id: COMPANY, key: KEY, list_name: 'Quote Email Links', value })
  console.log(wErr ? `FAILED: ${wErr.message}` : 'applied')
})()
