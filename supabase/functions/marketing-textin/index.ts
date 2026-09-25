// marketing-textin: a tech texts a photo to the company's number and it lands
// in the Marketing inbox.
//
// Two callers share this URL:
//
//   Twilio (form-encoded POST, no JWT)  the inbound MMS webhook. The company
//       is found by the number it was sent TO (settings.twilio_config
//       .from_number), the request is checked against that company's Twilio
//       auth token (X-Twilio-Signature), the sender is matched to an employee
//       by phone, each attachment is copied into marketing-media and filed as
//       a marketing_captures row (source 'text', the SMS body as the note),
//       the managers are told, and the tech gets a one-line reply.
//
//   JobScout (JSON POST, user JWT)     { action: 'status' | 'enable' }.
//       status says whether Twilio is configured and whether this URL is the
//       number's SMS webhook. enable sets it, through Twilio's API with the
//       company's own credentials, so nobody has to open the Twilio console.
//
// Deployed --no-verify-jwt (pinned in config.toml) because Twilio does not
// send one. The signature check is the auth for that path.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resolveCaller } from '../_shared/auth.ts'
import { MEDIA_BUCKET, notifyManagers } from '../_shared/marketing.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
const twiml = (msg: string) =>
  new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${msg ? `<Message>${msg.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] as string))}</Message>` : ''}</Response>`,
    { status: 200, headers: { 'Content-Type': 'text/xml' } })

const digits = (s: unknown) => String(s || '').replace(/\D/g, '')
const last10 = (s: unknown) => digits(s).slice(-10)

async function twilioSignature(authToken: string, url: string, params: Record<string, string>) {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join('')
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(authToken), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return btoa(String.fromCharCode(...new Uint8Array(sig)))
}

function parseCfg(v: unknown): any {
  try { return typeof v === 'string' ? JSON.parse(v) : v || {} } catch { return {} }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  const WEBHOOK_URL = `${SUPABASE_URL}/functions/v1/marketing-textin`
  const ctype = req.headers.get('content-type') || ''

  try {
    // ── Twilio webhook ────────────────────────────────────────────────
    if (req.method === 'POST' && ctype.includes('application/x-www-form-urlencoded')) {
      const form = await req.formData()
      const params: Record<string, string> = {}
      for (const [k, v] of form.entries()) params[k] = String(v)
      const to = last10(params.To)
      const from = last10(params.From)
      if (!to || !from) return twiml('')

      // Which company owns the number this was sent to?
      const { data: rows } = await sb.from('settings').select('company_id, value').eq('key', 'twilio_config')
      const match = (rows || []).map((r: any) => ({ company_id: r.company_id, cfg: parseCfg(r.value) }))
        .find((r: any) => last10(r.cfg?.from_number) === to)
      if (!match?.cfg?.auth_token) { console.warn('[marketing-textin] no company for number', to); return twiml('') }
      const companyId: number = match.company_id

      // Twilio signs url + sorted params with the account's auth token.
      const expected = await twilioSignature(match.cfg.auth_token, WEBHOOK_URL, params)
      const given = req.headers.get('x-twilio-signature') || ''
      if (expected !== given) { console.warn('[marketing-textin] bad signature for company', companyId); return new Response('forbidden', { status: 403 }) }

      const { data: emp } = await sb.from('employees').select('id, name, phone').eq('company_id', companyId).eq('active', true)
      const sender = (emp || []).find((e: any) => last10(e.phone) === from) || null
      if (!sender) return twiml('This number is not on the team list in JobScout, so the photo was not saved. Ask the office to add your cell to your employee record.')

      const n = Number(params.NumMedia || 0)
      const note = (params.Body || '').trim()
      if (!n) return twiml('Send a photo with a line about the job and it goes straight to Marketing.')

      const basic = 'Basic ' + btoa(`${match.cfg.account_sid}:${match.cfg.auth_token}`)
      let saved = 0
      const ids: number[] = []
      for (let i = 0; i < Math.min(n, 10); i++) {
        const mediaUrl = params[`MediaUrl${i}`]
        const mediaType = params[`MediaContentType${i}`] || 'image/jpeg'
        if (!mediaUrl) continue
        try {
          const res = await fetch(mediaUrl, { headers: { Authorization: basic }, redirect: 'follow' })
          if (!res.ok) throw new Error(`media ${res.status}`)
          const bytes = new Uint8Array(await res.arrayBuffer())
          const ext = mediaType.includes('png') ? 'png' : mediaType.includes('gif') ? 'gif' : mediaType.startsWith('video/') ? 'mp4' : 'jpg'
          const ym = new Date().toISOString().slice(0, 7)
          const path = `${companyId}/${ym}/${Date.now()}_text_${i}.${ext}`
          const { error: upErr } = await sb.storage.from(MEDIA_BUCKET).upload(path, bytes, { contentType: mediaType, upsert: false })
          if (upErr) throw upErr
          const { data: pub } = sb.storage.from(MEDIA_BUCKET).getPublicUrl(path)
          const { data: row, error: dbErr } = await sb.from('marketing_captures').insert({
            company_id: companyId, employee_id: sender.id, bucket: MEDIA_BUCKET, path, url: pub.publicUrl,
            media_type: mediaType.startsWith('video/') ? 'video' : 'image', note: note || null, source: 'text',
          }).select('id').maybeSingle()
          if (dbErr) throw dbErr
          if (row?.id) ids.push(row.id)
          saved++
        } catch (err) {
          console.error('[marketing-textin] media failed', err)
        }
      }
      if (saved) {
        await notifyManagers(sb, companyId, {
          type: 'marketing_capture',
          title: `${sender.name || 'A tech'} texted ${saved === 1 ? 'a photo' : `${saved} photos`} for marketing`,
          message: note ? note.slice(0, 140) : 'No note. Open the inbox to make a post.',
          route: '/marketing', dedupe_key: `marketing-capture-${ids[0] || Date.now()}`,
          metadata: { capture_ids: ids, employee_id: sender.id },
        })
        return twiml(saved === 1 ? 'Got it. Added to Marketing for the office to post.' : `Got ${saved} photos. Added to Marketing for the office to post.`)
      }
      return twiml('That photo did not come through. Try sending it again.')
    }

    // ── JobScout actions ──────────────────────────────────────────────
    const caller = await resolveCaller(req, SUPABASE_URL, SERVICE_KEY)
    if (!caller?.companyId) return json({ ok: false, error: 'Sign in first.' }, 401)
    const companyId = caller.companyId
    const body = await req.json().catch(() => ({}))
    const action = String(body.action || 'status')

    const { data: tw } = await sb.from('settings').select('value').eq('company_id', companyId).eq('key', 'twilio_config').limit(1)
    const cfg = parseCfg(tw?.[0]?.value)
    const configured = !!(cfg.account_sid && cfg.auth_token && cfg.from_number)
    const twAuth = configured ? { Authorization: 'Basic ' + btoa(`${cfg.account_sid}:${cfg.auth_token}`) } : null

    const findNumber = async () => {
      const q = new URLSearchParams({ PhoneNumber: '+' + (digits(cfg.from_number).length === 10 ? '1' : '') + digits(cfg.from_number) })
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${cfg.account_sid}/IncomingPhoneNumbers.json?${q}`, { headers: twAuth! })
      const d = await r.json().catch(() => ({}))
      const num = (d.incoming_phone_numbers || [])[0]
      return num ? { sid: num.sid, sms_url: num.sms_url, phone: num.phone_number } : null
    }

    if (action === 'status') {
      if (!configured) return json({ ok: true, configured: false, enabled: false })
      const num = await findNumber().catch(() => null)
      return json({ ok: true, configured: true, number: cfg.from_number, found: !!num, enabled: !!num && num.sms_url === WEBHOOK_URL, current_url: num?.sms_url || null })
    }
    if (action === 'enable') {
      if (caller.level < 2) return json({ ok: false, error: 'Only a Manager or above can switch this on.' }, 403)
      if (!configured) return json({ ok: false, error: 'Set up Twilio under Settings → Integrations first (Account SID, Auth Token, From Number).' }, 400)
      const num = await findNumber().catch(() => null)
      if (!num) return json({ ok: false, error: `Twilio does not list ${cfg.from_number} on this account.` }, 400)
      const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${cfg.account_sid}/IncomingPhoneNumbers/${num.sid}.json`, {
        method: 'POST', headers: { ...twAuth!, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ SmsUrl: WEBHOOK_URL, SmsMethod: 'POST' }),
      })
      if (!r.ok) return json({ ok: false, error: `Twilio refused: ${(await r.text()).slice(0, 200)}` }, 400)
      return json({ ok: true, enabled: true, number: num.phone })
    }
    return json({ ok: false, error: `Unknown action "${action}"` }, 400)
  } catch (err) {
    console.error('[marketing-textin]', err)
    if (ctype.includes('x-www-form-urlencoded')) return twiml('')
    return json({ ok: false, error: (err as Error)?.message || 'Failed' }, 500)
  }
})
