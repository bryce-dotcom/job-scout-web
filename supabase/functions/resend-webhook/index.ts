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

        // A bid sent by email (bid-submit): delivered / bounced land on the
        // submission, and a bounce raises a notification at once — the
        // deadline has not moved and the bid is not in (SAL_SCOUT_PLAN §5.8).
        if (['delivered', 'bounced', 'complained', 'delayed'].includes(simpleStatus)) {
          const { data: subs } = await supabase
            .from('bid_submissions')
            .select('id, company_id, quote_id, opportunity_id, status')
            .eq('email_id', emailId)
            .limit(1)
          const sub = subs?.[0]
          if (sub) {
            const patch: Record<string, unknown> = { delivery_status: simpleStatus, updated_at: new Date().toISOString() }
            if (simpleStatus === 'delivered' && sub.status === 'sent') patch.status = 'delivered'
            if (simpleStatus === 'bounced') { patch.status = 'bounced'; patch.bounce_reason = bounceReason || 'bounced' }
            await supabase.from('bid_submissions').update(patch).eq('id', sub.id)
            if (simpleStatus === 'bounced') {
              let title = 'the bid'
              if (sub.opportunity_id) {
                const { data: opp } = await supabase.from('bid_opportunities').select('title').eq('id', sub.opportunity_id).maybeSingle()
                if (opp?.title) title = opp.title
                await supabase.from('bid_opportunities').update({ status: 'ready', updated_at: new Date().toISOString() }).eq('id', sub.opportunity_id)
              }
              await supabase.from('company_notifications').insert({
                company_id: sub.company_id, type: 'bid_bounced',
                title: `Sal: the bid email BOUNCED — ${title}`,
                message: `${bounceReason || 'The buyer\'s server refused it'}. The bid is NOT in — send it again or submit another way before the deadline.`,
                metadata: { submission_id: sub.id, quote_id: sub.quote_id, opportunity_id: sub.opportunity_id, route: `/estimates/${sub.quote_id}`, source: 'sal' },
                created_by: null,
              })
            }
          }
        }
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
