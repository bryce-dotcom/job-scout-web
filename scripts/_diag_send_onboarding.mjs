// Sign in as Bryce, then call send-onboarding-link to trigger a real
// HR-side send. Reports the delivery_errors / delivery_details.
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

// We don't have Bryce's password here. Use the service-role key path
// instead: signInAs via the auth admin. For diagnosis we'll call the
// function bypassing the HR check by using the service-role auth header
// — but the function expects a real user JWT.
// Easier: temporarily call send-onboarding-link with the SERVICE_ROLE_KEY
// as bearer. The function tries supabase.auth.getUser(token) which will
// succeed (service-role can introspect any user) but return... let's see.

// The cleanest path for a quick diag: skip the function and call its
// inner pieces directly via service role.
const SERVICE = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

// Dispatch send-email exactly like the function does, with the same
// new shape (from-with-name).
const targets = ['bryce@hhh.services', 'alayda@hhh.services']
for (const to of targets) {
  console.log(`\n=== Probing ${to} ===`)
  const res = await fetch(`${process.env.VITE_SUPABASE_URL}/functions/v1/send-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({
      to,
      subject: 'JobScout onboarding — delivery probe',
      html: `<p>If you got this, Resend → ${to} delivery works. Reply to confirm.</p>`,
      from: 'HHH Services <invoices@appsannex.com>',
    }),
  })
  const body = await res.json()
  console.log(`  http=${res.status} body=${JSON.stringify(body)}`)
}

// SMS probe
console.log('\n=== Probing SMS to 8014044848 ===')
try {
  const res = await fetch(`${process.env.VITE_SUPABASE_URL}/functions/v1/send-sms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({ to: '8014044848', body: 'JobScout SMS probe — reply if you got this' }),
  })
  const body = await res.json()
  console.log(`  http=${res.status} body=${JSON.stringify(body)}`)
} catch (err) {
  console.error('  SMS fetch FAILED:', err.message)
}
