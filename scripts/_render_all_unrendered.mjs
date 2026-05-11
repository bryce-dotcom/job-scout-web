// Backfill: render PDFs for any signed_documents missing pdf_storage_path.
import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'
const URL = process.env.VITE_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const s = createClient(URL, KEY)

const { data: missing } = await s
  .from('signed_documents')
  .select('id, onboarding_packet_id')
  .eq('status', 'signed')
  .is('pdf_storage_path', null)

const packetIds = [...new Set((missing || []).map(d => d.onboarding_packet_id).filter(Boolean))]
console.log(`${missing?.length || 0} docs missing PDFs across ${packetIds.length} packets`)

for (const id of packetIds) {
  const r = await fetch(`${URL}/functions/v1/render-onboarding-pdfs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}`, apikey: KEY },
    body: JSON.stringify({ packet_id: id }),
  })
  const body = await r.json().catch(() => null)
  console.log(`packet ${id}: http=${r.status} rendered=${body?.rendered?.length ?? '?'}`)
}
