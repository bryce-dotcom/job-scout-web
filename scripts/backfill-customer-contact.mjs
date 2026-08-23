// Fill contact details a converted customer is missing but its lead has.
//
// Doug (ad33b5fe): "Damion can see the contact info in the Job. I cannot."
//
// Converting a lead matches an existing customer where one exists, and used it
// as-is — so Halverson Mechanical kept its name and address and never received
// the lead's phone (8014304041) or email (dave@halversonmechanical.com). The
// job reads the CUSTOMER, so the job showed no contact at all.
//
// The conversion is fixed going forward. This is for the records already in
// that state. Blanks only, never an overwrite — a customer someone corrected by
// hand outranks a lead typed months ago.
//
//   node scripts/backfill-customer-contact.mjs           # dry run
//   node scripts/backfill-customer-contact.mjs --write   # apply
//
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'
import { contactGapPatch } from '../src/lib/customerMatch.js'
config()

const WRITE = process.argv.includes('--write')
const i = process.argv.indexOf('--company')
const COMPANY = Number(i === -1 ? 3 : process.argv[i + 1])
const s = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

const page = async (table, select) => {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await s.from(table).select(select).eq('company_id', COMPANY).range(from, from + 999)
    if (error) { console.error(`${table} FAILED: ${error.message}`); process.exit(1) }
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out
}

;(async () => {
  const leads = await page('leads', 'id,customer_name,business_name,phone,email,address,converted_customer_id')
  const customers = await page('customers', 'id,name,business_name,phone,email,address')
  const byId = new Map(customers.map((c) => [String(c.id), c]))

  let changed = 0
  for (const l of leads) {
    if (l.converted_customer_id == null) continue
    const c = byId.get(String(l.converted_customer_id))
    if (!c) continue
    const patch = contactGapPatch(c, l)
    if (!patch) continue
    changed++
    console.log(`  ${String(c.business_name || c.name).slice(0, 34).padEnd(36)} ${JSON.stringify(patch)}`)
    if (WRITE) {
      const { error } = await s.from('customers').update(patch).eq('id', c.id)
      if (error) console.log(`     FAILED: ${error.message}`)
    }
  }
  console.log(`\n  ${changed} customer(s) ${WRITE ? 'updated' : 'would be filled'}`)
  console.log(WRITE ? 'applied' : 'dry run — re-run with --write')
})()
