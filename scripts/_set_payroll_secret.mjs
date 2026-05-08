// One-time: set the database GUC used by encrypt_ssn / decrypt_ssn.
// Generates a 64-char random secret if one isn't already set.
// Stores the secret to .env so it can be retrieved if someone wants to verify.
//
// Re-running is safe — it skips if the secret is already set.
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Try to encrypt a probe value to detect whether the secret is set.
const { data: probe, error: probeErr } = await supabase.rpc('encrypt_ssn', { p_ssn: '111111111' })
if (!probeErr) {
  console.log('app.payroll_secret is already set on the database — nothing to do.')
  process.exit(0)
}
console.log('Probe error (expected if secret missing):', probeErr.message)

const secret = randomBytes(48).toString('hex') // 96 chars
console.log('Generated new secret (length:', secret.length, ')')

// Write to .env (don't overwrite if already there)
const envPath = '.env'
let envText = ''
try { envText = fs.readFileSync(envPath, 'utf8') } catch {}
if (!/PAYROLL_SECRET=/.test(envText)) {
  fs.appendFileSync(envPath, `\nPAYROLL_SECRET=${secret}\n`)
  console.log('Wrote PAYROLL_SECRET to .env')
} else {
  console.log('.env already has PAYROLL_SECRET — leaving it alone')
}

// Set the GUC via a direct SQL call. supabase-js doesn't have a generic
// SQL endpoint; use the management RPC if available, or instruct the
// user to run the SQL manually.
console.log('\nNow run this in the Supabase SQL editor (one time):')
console.log('-------------------------------------------------')
console.log(`ALTER DATABASE postgres SET app.payroll_secret TO '${secret}';`)
console.log('-------------------------------------------------')
console.log('Then disconnect any open Postgres sessions so the new GUC takes effect.')
