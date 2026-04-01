import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

    const { recipient_email, subject, original_message, reply_message, feedback_type } = await req.json();

    if (!recipient_email || !reply_message) {
      return new Response(JSON.stringify({ success: false, error: 'recipient_email and reply_message are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const typeLabel = {
      bug: 'Bug Report',
      feature: 'Feature Request',
      question: 'Question',
      feedback: 'Feedback'
    }[feedback_type] || 'Feedback';

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
            <p style="font-size: 12px; color: #666; margin: 0;">Thank you for helping us improve JobScout.</p>
          </div>
        </div>
      </div>
    `;

    const emailRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'JobScout <noreply@appsannex.com>',
        to: [recipient_email],
        subject: `Re: Your ${typeLabel}${subject ? ' - ' + subject : ''} — JobScout`,
        html,
      }),
    });

    const emailResult = await emailRes.json();

    if (!emailRes.ok) {
      return new Response(JSON.stringify({ success: false, error: emailResult.message || 'Failed to send' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
