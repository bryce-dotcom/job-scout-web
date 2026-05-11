// Confirm send-email now handles "HHH Services, LLC" From-name.
import 'dotenv/config'
const URL = process.env.VITE_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

const cases = [
  { label: 'no comma',     from: 'HHH Services <invoices@appsannex.com>' },
  { label: 'with comma',   from: 'HHH Services, LLC <invoices@appsannex.com>' },
  { label: 'with period',  from: 'HHH Inc. <invoices@appsannex.com>' },
]
for (const c of cases) {
  const res = await fetch(`${URL}/functions/v1/send-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}`, apikey: KEY },
    body: JSON.stringify({
      to: 'bryce@hhh.services',
      subject: `JobScout probe — ${c.label}`,
      html: `<p>Probe: <strong>${c.label}</strong> · From=${c.from}</p>`,
      from: c.from,
    }),
  })
  const body = await res.json()
  console.log(`${c.label.padEnd(14)} http=${res.status} body=${JSON.stringify(body).slice(0, 120)}`)
}
