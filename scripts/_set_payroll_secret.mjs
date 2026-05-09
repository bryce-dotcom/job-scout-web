// Set the SSN encryption secret in Supabase Vault.
// Idempotent: re-running rotates the secret. Existing encrypted SSNs
// would NOT decrypt after rotation — only run rotation when you've
// also re-entered every SSN. For first-time setup just run normally.
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs'

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Reuse the secret from .env if one is already there. Otherwise generate.
const envPath = '.env'
let envText = ''
try { envText = fs.readFileSync(envPath, 'utf8') } catch {}
const m = envText.match(/^PAYROLL_SECRET=(.+)$/m)
let secret = m ? m[1].trim() : null
if (!secret) {
  secret = randomBytes(48).toString('hex') // 96 chars
  fs.appendFileSync(envPath, `\nPAYROLL_SECRET=${secret}\n`)
  console.log('Generated new secret and wrote to .env (length:', secret.length, ')')
} else {
  console.log('Reusing PAYROLL_SECRET from .env (length:', secret.length, ')')
}

const { data, error } = await supabase.rpc('set_payroll_secret', { p_value: secret })
if (error) {
  console.error('FAILED:', error.message)
  process.exit(1)
}
console.log(`Vault secret ${data} ✓`)

// Quick smoke-test: encrypt a probe SSN to confirm everything works.
const { data: enc, error: encErr } = await supabase.rpc('encrypt_ssn', { p_ssn: '123-45-6789' })
if (encErr) {
  console.error('encrypt_ssn smoke-test FAILED:', encErr.message)
  process.exit(1)
}
console.log('encrypt_ssn smoke-test OK (returned', String(enc).slice(0, 24), '...)')
