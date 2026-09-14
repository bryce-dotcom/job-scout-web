import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { feedbackReplyAddress } from "../_shared/replyToken.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ success: false, error: 'RESEND_API_KEY not configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { recipient_email, subject, original_message, reply_message, feedback_type, feedback_id } = await req.json();

    if (!recipient_email || !reply_message) {
      return new Response(JSON.stringify({ success: false, error: 'recipient_email and reply_message are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const typeLabel = ({
      bug: 'Bug Report',
      feature: 'Feature Request',
      question: 'Question',
      feedback: 'Feedback'
    } as Record<string, string>)[feedback_type] || 'Feedback';

    const replyNote = feedback_id && Deno.env.get('REPLY_TOKEN_SECRET')
      ? 'Reply to this email and your answer goes straight onto your ticket.'
      : 'Thank you for helping us improve JobScout.';

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
        <div style="background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%); border-radius: 12px; padding: 32px; color: #ffffff;">
          <div style="text-align: center; margin-bottom: 24px;">
            <h1 style="font-size: 22px; font-weight: 700; margin: 0 0 4px;">JobScout</h1>
            <p style="font-size: 13px; color: #888; margin: 0;">Response to your ${typeLabel}</p>
          </div>

          <div style="background: rgba(249,115,22,0.1); border: 1px solid rgba(249,115,22,0.25); border-radius: 8px; padding: 16px; margin-bottom: 20px;">
            <div style="font-size: 11px; text-transform: uppercase; color: #f97316; font-weight: 600; margin-bottom: 8px;">Your ${typeLabel}${subject ? `: ${subject}` : ''}</div>
            <div style="font-size: 14px; color: #ccc; line-height: 1.5; white-space: pre-wrap;">${(original_message || '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
          </div>

          <div style="background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.25); border-radius: 8px; padding: 16px; margin-bottom: 20px;">
            <div style="font-size: 11px; text-transform: uppercase; color: #22c55e; font-weight: 600; margin-bottom: 8px;">Developer Response</div>
            <div style="font-size: 14px; color: #fff; line-height: 1.6; white-space: pre-wrap;">${reply_message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
          </div>

          <div style="text-align: center; padding-top: 16px; border-top: 1px solid #333;">
            <p style="font-size: 12px; color: #666; margin: 0;">${replyNote}</p>
          </div>
        </div>
      </div>
    `;

    // Where a reply to this email goes. With the ticket id, it goes to a
    // signed address the inbound router resolves back to the ticket, so the
    // reporter's answer lands on the thread. Without one (an old caller, or no
    // signing secret) it goes where it always went — noreply@ — and is lost,
    // which is what happened to Alayda's answer on 2026-09-11.
    const REPLY_SECRET = Deno.env.get('REPLY_TOKEN_SECRET') || '';
    const INBOUND_DOMAIN = Deno.env.get('INBOUND_EMAIL_DOMAIN') || 'appsannex.com';
    let reply_to: string | undefined;
    if (feedback_id && REPLY_SECRET) {
      try { reply_to = await feedbackReplyAddress(String(feedback_id), REPLY_SECRET, INBOUND_DOMAIN); }
      catch (e) { console.warn('[send-feedback-reply] could not build a reply address:', (e as Error).message); }
    } else if (feedback_id) {
      console.warn('[send-feedback-reply] REPLY_TOKEN_SECRET not set — a reply to this email will not reach the ticket');
    }

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'JobScout <noreply@appsannex.com>',
        to: [recipient_email],
        ...(reply_to ? { reply_to } : {}),
        subject: `Re: Your ${typeLabel}${subject ? ' - ' + subject : ''} — JobScout`,
        html,
      }),
    });

    const emailResult = await emailRes.json();

    if (!emailRes.ok) {
      return new Response(JSON.stringify({ success: false, error: emailResult.message || 'Failed to send' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // The address replies will come back on — informational; the token carries no privilege.
    return new Response(JSON.stringify({ success: true, reply_to: reply_to || null }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
