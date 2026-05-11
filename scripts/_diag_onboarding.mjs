// Diagnose: did the packet create? Did send-email return ok? What did
// the edge function log say?
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

console.log('=== Recent onboarding packets ===')
const { data: pkts } = await supabase
  .from('employee_onboarding_packets')
  .select('id, employee_id, token, status, sent_at, sent_via, opened_at, is_revoked, created_at')
  .order('created_at', { ascending: false })
  .limit(10)
for (const p of pkts || []) {
  console.log(`  [${p.id}] emp=${p.employee_id} status=${p.status} sent_via=${JSON.stringify(p.sent_via)} sent_at=${p.sent_at?.slice(0,19) || '-'} revoked=${p.is_revoked}`)
}

// Look up Bryce + Alayda employees
const { data: emps } = await supabase
  .from('employees')
  .select('id, name, email, phone, company_id')
  .in('email', ['bryce@hhh.services','alayda@hhh.services'])
console.log('\n=== Target employees ===')
for (const e of emps || []) console.log(`  ${e.id} ${e.email} phone=${e.phone || '-'}`)

// Test send-email directly with current env
console.log('\n=== Probe: invoke send-email directly ===')
try {
  const res = await fetch(`${process.env.VITE_SUPABASE_URL}/functions/v1/send-email`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
    body: JSON.stringify({
      to: 'bryce@hhh.services',
      subject: 'JobScout: onboarding probe',
      html: '<p>This is a probe message from the onboarding diagnostic. If you got it, send-email works.</p>',
      from_name: 'JobScout Diagnostic',
    }),
  })
  const txt = await res.text()
  console.log(`  status=${res.status}`)
  console.log(`  body=${txt.slice(0, 500)}`)
} catch (err) {
  console.error('  fetch FAILED:', err.message)
}
