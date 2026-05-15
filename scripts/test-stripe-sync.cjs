// Manually invoke stripe-sync-books for HHH and capture the response
require('dotenv').config()
const url = `${process.env.VITE_SUPABASE_URL}/functions/v1/stripe-sync-books`
;(async () => {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ company_id: 3 }),
  })
  const text = await res.text()
  console.log(`Status: ${res.status}`)
  console.log(`Body: ${text}`)
})()
