import "jsr:@supabase/functions-js/edge-runtime.d.ts"

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

    const { to, subject, html, from, reply_to } = payload as {
      to?: string | string[]
      subject?: string
      html?: string
      from?: string
      reply_to?: string
    }

    if (!to || !subject) {
      return json({ success: false, error: 'to and subject are required' })
    }

    // Sanitize from: strip non-ASCII chars from display name (Resend rejects them)
    // Allow either "Name <addr>" or just "addr"
    let safeFrom = (from || '').trim()
    if (safeFrom) {
      const m = safeFrom.match(/^(.*)<([^>]+)>\s*$/)
      if (m) {
        const name = m[1].replace(/["\\]/g, '').replace(/[^\x20-\x7E]/g, '').trim() || 'JobScout'
        const addr = m[2].trim()
        safeFrom = `${name} <${addr}>`
      }
    }
    if (!safeFrom) safeFrom = 'JobScout <invoices@appsannex.com>'

    const requestBody = {
      from: safeFrom,
      to: Array.isArray(to) ? to : [to],
      subject,
      html: html || '',
      reply_to: reply_to || undefined,
    }

    console.log('[send-email] sending', { to: requestBody.to, from: requestBody.from, subjectLen: subject.length, htmlLen: (html || '').length })

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
