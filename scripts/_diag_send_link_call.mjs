// Call send-onboarding-link with service role key — see what error
// path it hits + dump the full delivery_details so we can see what
// each channel actually returned.
import 'dotenv/config'
const URL = process.env.VITE_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

// First: try with service_role as Bearer (simulates a logged-in admin
// in the simplest possible way — function uses getUser() to resolve
// the caller, but service_role is special-cased by gotrue).
console.log('=== Attempting send-onboarding-link for emp 3 (Bryce) ===')
const res = await fetch(`${URL}/functions/v1/send-onboarding-link`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${KEY}`,
    apikey: KEY,
  },
  body: JSON.stringify({ employee_id: 3, channels: ['email','sms'] }),
})
console.log(`http=${res.status}`)
const body = await res.json().catch(() => null)
console.log('body:', JSON.stringify(body, null, 2))
