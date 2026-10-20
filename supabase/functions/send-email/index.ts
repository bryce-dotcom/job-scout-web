import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { authorizeEmailCaller, companySenderNames, restrictFrom } from '../_shared/emailSender.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Helper: always return 200 so supabase-js exposes the body to the caller
  const json = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    // Who is asking? Our servers, or a signed-in active employee — never the
    // anon key alone (it ships in every browser bundle). See _shared/emailSender.ts.
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const auth = await authorizeEmailCaller(req, {
      supabaseUrl: SUPABASE_URL,
      serviceKey: SERVICE_KEY,
      internalKey: Deno.env.get('ARNIE_INTERNAL_KEY'),
    })
    if (!auth.ok) {
      console.warn('[send-email] refused: caller is not a service or an active employee')
      return json({ success: false, error: auth.error }, auth.status)
    }

    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    if (!RESEND_API_KEY) {
      return json({ success: false, error: 'RESEND_API_KEY not configured' })
    }

    let payload: Record<string, unknown> = {}
    try {
      payload = await req.json()
    } catch {
      return json({ success: false, error: 'Invalid JSON body' })
    }

    const { to, subject, html, reply_to, attachments } = payload as {
      to?: string | string[]
      subject?: string
      html?: string
      from?: string
      reply_to?: string
      // Resend attachments — each { filename, content (base64-encoded string), content_type? }
      // Resend accepts up to ~40MB combined; caller should check before sending.
      attachments?: Array<{ filename: string; content: string; content_type?: string }>
    }

    if (!to || !subject) {
      return json({ success: false, error: 'to and subject are required' })
    }

    // A signed-in person sends as their company (or one of its business
    // units) from one of our mailboxes — never a name and domain of their
    // choosing. Servers keep the `from` they ask for.
    let from = payload.from as string | undefined
    if (auth.kind === 'employee') {
      const names = await companySenderNames(auth.caller.companyId as number, SUPABASE_URL, SERVICE_KEY)
      const asked = from
      from = restrictFrom(asked, names)
      if ((asked || '').trim() !== from) {
        console.warn('[send-email] from rewritten for', auth.caller.email, { asked, used: from })
      }
    }

    // Sanitize from. Resend rejects non-ASCII and is strict about
    // RFC 2822 — display names containing commas, semicolons, dots,
    // or @ MUST be quoted. ("HHH Services, LLC <addr>" would be parsed
    // as TWO addresses without quotes, and Resend silently drops the
    // request — onboarding emails were vanishing for exactly this
    // reason.)
    let safeFrom = (from || '').trim()
    if (safeFrom) {
      const m = safeFrom.match(/^(.*)<([^>]+)>\s*$/)
      if (m) {
        const rawName = m[1].replace(/["\\]/g, '').replace(/[^\x20-\x7E]/g, '').trim() || 'JobScout'
        const addr = m[2].trim()
        // Quote-wrap if the display name has any RFC 2822 specials.
        const needsQuote = /[,;.@()<>:\[\]\\]/.test(rawName)
        const finalName = needsQuote ? `"${rawName}"` : rawName
        safeFrom = `${finalName} <${addr}>`
      }
    }
    if (!safeFrom) safeFrom = 'JobScout <invoices@appsannex.com>'

    const requestBody: Record<string, unknown> = {
      from: safeFrom,
      to: Array.isArray(to) ? to : [to],
      subject,
      html: html || '',
      reply_to: reply_to || undefined,
    }
    if (Array.isArray(attachments) && attachments.length > 0) {
      // Resend expects: { filename, content (base64 string) }. content_type
      // is optional — Resend infers from filename.
      requestBody.attachments = attachments
        .filter(a => a && a.filename && a.content)
        .map(a => ({
          filename: a.filename,
          content: a.content,
          ...(a.content_type ? { content_type: a.content_type } : {}),
        }))
    }

    console.log('[send-email] sending', { by: auth.kind === 'employee' ? auth.caller.email : 'service', to: requestBody.to, from: requestBody.from, subjectLen: subject.length, htmlLen: (html || '').length })

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    const text = await response.text()
    let result: Record<string, unknown> = {}
    try { result = JSON.parse(text) } catch { result = { raw: text } }

    if (!response.ok) {
      console.error('[send-email] Resend error:', response.status, result)
      return json({
        success: false,
        error: (result.message as string) || `Resend ${response.status}`,
        details: result,
        from_used: safeFrom,
      })
    }

    return json({ success: true, id: result.id })
  } catch (err) {
    console.error('[send-email] Error:', err)
    return json({ success: false, error: (err as Error).message || 'Internal error' })
  }
})
