// What happened to a text after we handed it to Twilio.
//
// Tracy, 2026-10-23: "I sent my first texted invoice to Brad Scott
// INV-MUD386UN for $770. The system said the text went through by saying it
// did but I have no recorded trail that it actually did like we have for
// emailed invoice."
//
// She was right, and the gap was worse than a missing receipt. "Sent" only
// means Twilio ACCEPTED the message; the carrier can refuse it afterwards
// and nothing was listening. A real example sits in the log: 2026-10-16,
// recorded 'sent', actually undelivered with error 30034 — the number was
// not yet registered for A2P 10DLC and the carrier dropped every message.
// The row still says 'sent' today. That is the false comfort she is
// describing, and on an invoice it means chasing money that never arrived.
//
// Email already had this: resend-webhook moves an email to delivered or
// bounced. This is the same shape for SMS.
//
// Public by necessity — Twilio cannot send a Supabase JWT — but not
// unauthenticated: every delivery is signed with the company's own Twilio
// auth token and the signature is checked before anything is written.

import 'jsr:@supabase/functions-js/edge-runtime.d.ts'


const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/**
 * Twilio signs a callback with HMAC-SHA1 over the full URL followed by every
 * POST field, sorted by name and concatenated as name+value, keyed by the
 * account's auth token.
 */
// Web Crypto, not node:crypto. Buffer is not a global in the edge runtime
// (reaching for it threw a 500 that looked from outside exactly like a
// signature failure), and the node shim's createHmac did not reproduce
// Twilio's digest even given identical input. crypto.subtle does, and it is
// what livekit-webhook already verifies with.
async function expectedSignature(authToken: string, url: string, params: Record<string, string>) {
  const data = Object.keys(params).sort().reduce((acc, k) => acc + k + params[k], url)
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(authToken),
    { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
}

// Twilio's vocabulary, reduced to what a person reading an invoice needs.
// 'sent' deliberately stays 'sent': it is the honest word for "gone, not yet
// confirmed", and the whole bug was treating it as the end of the story.
function statusFor(twilioStatus: string) {
  const s = String(twilioStatus || '').toLowerCase()
  if (s === 'delivered') return 'delivered'
  if (s === 'undelivered' || s === 'failed') return 'failed'
  if (s === 'queued' || s === 'sending' || s === 'accepted' || s === 'scheduled') return 'sending'
  return 'sent'
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return ok({ error: 'POST only' }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

  // Which company's text this is. Put on the callback URL by send-sms,
  // because the auth token that signs the delivery is that company's own.
  const url = new URL(req.url)
  const companyId = parseInt(url.searchParams.get('c') || '', 10)
  if (!Number.isFinite(companyId) || companyId <= 0) return ok({ error: 'no company' }, 400)

  const raw = await req.text()
  const params: Record<string, string> = {}
  for (const [k, v] of new URLSearchParams(raw)) params[k] = v

  const sid = params.MessageSid || params.SmsSid || ''
  if (!sid) return ok({ error: 'no MessageSid' }, 400)

  // ---- the company's own Twilio token, to check the signature -------------
  const cfgRes = await fetch(
    `${SUPABASE_URL}/rest/v1/settings?select=value&company_id=eq.${companyId}&key=eq.twilio_config`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
  )
  const cfgRows = cfgRes.ok ? await cfgRes.json() : []
  let authToken = ''
  try { authToken = JSON.parse(cfgRows?.[0]?.value || '{}').auth_token || '' } catch { /* malformed */ }
  if (!authToken) return ok({ error: 'company not configured' }, 403)

  // Twilio signs the URL it was GIVEN, so sign the one we GAVE it — built
  // from the same env var send-sms used to build the StatusCallback.
  //
  // Reconstructing it from req.url does not work: inside the edge runtime
  // that is an internal address, not the public function URL, so the digest
  // never matched and every genuine delivery came back "bad signature" —
  // indistinguishable from an attack, and it would have looked like Twilio
  // was simply never calling.
  const signedUrl = `${SUPABASE_URL}/functions/v1/sms-status?c=${companyId}`
  const given = req.headers.get('x-twilio-signature') || ''
  if (given !== await expectedSignature(authToken, signedUrl, params)) {
    return ok({ error: 'bad signature' }, 401)
  }

  // ---- record it ----------------------------------------------------------
  const next = statusFor(params.MessageStatus)
  const errorCode = params.ErrorCode || null

  const patch: Record<string, unknown> = { status: next, updated_at: new Date().toISOString() }

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/communications_log?company_id=eq.${companyId}&communication_id=eq.${encodeURIComponent(sid)}`,
    {
      method: 'PATCH',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(patch),
    },
  )
  const updated = res.ok ? await res.json() : []
  if (!res.ok) console.error('[sms-status]', res.status, (await res.text()).slice(0, 200))

  // A carrier refusal is the thing nobody ever saw. Say it in the log so it
  // is findable without a Twilio console.
  if (next === 'failed') {
    console.error(`[sms-status] company ${companyId} message ${sid} ${params.MessageStatus}${errorCode ? ` error ${errorCode}` : ''}`)
  }

  return ok({ recorded: true, sid, status: next, rows: Array.isArray(updated) ? updated.length : 0 })
})
