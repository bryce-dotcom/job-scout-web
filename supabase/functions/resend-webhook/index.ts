// Resend webhook receiver — updates invoices with delivery status
// Configure in Resend dashboard: https://resend.com/webhooks
// Endpoint: https://<project>.supabase.co/functions/v1/resend-webhook
// Subscribe to: email.delivered, email.bounced, email.complained, email.opened, email.clicked, email.delivery_delayed

import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, svix-id, svix-timestamp, svix-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    const payload = await req.json()
    console.log('[resend-webhook] received', payload.type, payload.data?.email_id)

    const eventType: string = payload.type || ''
    const data = payload.data || {}
    const emailId: string = data.email_id || data.id || ''
    if (!emailId) {
      return new Response(JSON.stringify({ ok: true, skipped: 'no email_id' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const recipient = Array.isArray(data.to) ? data.to[0] : (data.to || '')
    const bounceReason = data.bounce?.message || data.bounce?.subType || data.bounce_message || null

    // Always log the raw event
    await supabase.from('email_events').insert({
      email_id: emailId,
      event_type: eventType,
      recipient,
      bounce_reason: bounceReason,
      raw_payload: payload,
    })

    // Map Resend event → simplified status
    const statusMap: Record<string, string> = {
      'email.sent': 'sent',
      'email.delivered': 'delivered',
      'email.delivery_delayed': 'delayed',
      'email.bounced': 'bounced',
      'email.complained': 'complained',
      'email.opened': 'opened',
      'email.clicked': 'clicked',
    }
    const simpleStatus = statusMap[eventType]

    if (simpleStatus) {
      const update: Record<string, unknown> = {}

      // Track terminal states + opens/clicks separately
      if (['sent', 'delivered', 'delayed', 'bounced', 'complained'].includes(simpleStatus)) {
        update.email_status = simpleStatus
        update.email_status_at = new Date().toISOString()
        if (bounceReason) update.email_bounce_reason = bounceReason
      }
      if (simpleStatus === 'opened') {
        update.email_opened_at = new Date().toISOString()
      }
      if (simpleStatus === 'clicked') {
        update.email_clicked_at = new Date().toISOString()
      }

      if (Object.keys(update).length > 0) {
        // Update both invoices and quotes — whichever table actually has a
        // row with this email_id. email_id values are Resend-side UUIDs so
        // there's zero risk of collision between the two tables.
        const { error: invErr } = await supabase
          .from('invoices')
          .update(update)
          .eq('email_id', emailId)
        if (invErr) console.error('[resend-webhook] invoices update error', invErr)

        const { error: quoteErr } = await supabase
          .from('quotes')
          .update(update)
          .eq('email_id', emailId)
        if (quoteErr) console.error('[resend-webhook] quotes update error', quoteErr)
      }
    }

    return new Response(JSON.stringify({ ok: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('[resend-webhook] error', err)
    return new Response(JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
