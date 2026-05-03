require('dotenv').config()
const { createClient } = require('@supabase/supabase-js')
const URL = process.env.VITE_SUPABASE_URL
const ANON = process.env.VITE_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY
const ADMIN = createClient(URL, SERVICE)

;(async () => {
  // Pick an HHH lead to test with
  const { data: testLead } = await ADMIN.from('leads').select('id, customer_signature_method').eq('company_id', 3).limit(1).single()
  console.log('Testing with lead:', testLead.id, '(current sig method:', testLead.customer_signature_method, ')')

  // Tiny 1px PNG
  const pngB64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgYAAAAAMAASsJTYQAAAAASUVORK5CYII='

  // Call the edge function as anon (the actual production path)
  const anon = createClient(URL, ANON, { auth: { persistSession: false } })
  const result = await anon.functions.invoke('lenard-capture-signature', {
    body: {
      leadId: testLead.id,
      signatureBase64: 'data:image/png;base64,' + pngB64,
      method: 'edge-fn-test',
    },
  })
  console.log('Edge function response:', result)

  // Verify the lead was updated
  const { data: updated } = await ADMIN.from('leads').select('id, customer_signature_method, customer_signature_path, customer_signature_captured_at').eq('id', testLead.id).single()
  console.log('Lead after update:')
  console.log('  method:', updated.customer_signature_method)
  console.log('  path:', updated.customer_signature_path)
  console.log('  captured_at:', updated.customer_signature_captured_at)

  if (updated.customer_signature_method === 'edge-fn-test') {
    console.log('\n✓ Edge function works — anon can capture signature without direct table access')
  } else {
    console.log('\n✗ Update did not stick')
  }

  // Restore original signature method to avoid polluting data
  await ADMIN.from('leads').update({ customer_signature_method: testLead.customer_signature_method }).eq('id', testLead.id)
})()
