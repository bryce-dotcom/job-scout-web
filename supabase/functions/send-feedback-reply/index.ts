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

    const { recipient_email, subject, original_message, reply_message, feedback_type, feedback_id, attachments } = await req.json();

    // Optional pictures — "here is what you asked for" is often a screenshot.
    // Images only, a handful, and small enough that Resend takes the lot.
    const files = (Array.isArray(attachments) ? attachments : [])
      .filter((a: { filename?: string; content?: string }) =>
        a && typeof a.content === 'string' && /\.(png|jpe?g)$/i.test(String(a.filename || '')))
      .slice(0, 8)
      .map((a: { filename: string; content: string }) => ({ filename: String(a.filename).slice(0, 80), content: a.content }));
    if (files.reduce((n: number, a: { content: string }) => n + a.content.length, 0) > 25_000_000) {
      return new Response(JSON.stringify({ success: false, error: 'Attachments are too large — keep them under about 18 MB in total.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

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

    // Solid colours, dark text on a light card. The old template's dark card
    // was a CSS gradient with no solid fallback: Gmail drops gradients, so the
    // card went white under white text, and phone dark mode then flipped that
    // text dark — Antonino (2026-10-12) saw dark green on dark green and was
    // copying replies into Messages to read them. A light design with solid
    // hex colours is what dark-mode clients recolour legibly.
    const esc = (x: unknown) => String(x ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"></head>
<body style="margin:0;padding:0;background-color:#f7f5ef;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f7f5ef;">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;border:1px solid #d6cdb8;border-radius:12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
        <tr><td style="padding:28px 28px 8px;text-align:center;">
          <div style="font-size:22px;font-weight:700;color:#2c3530;">JobScout</div>
          <div style="font-size:13px;color:#4d5a52;margin-top:4px;">Response to your ${typeLabel}</div>
        </td></tr>
        <tr><td style="padding:16px 28px 0;">
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#4d5a52;margin-bottom:6px;">Your ${typeLabel}${subject ? `: ${esc(subject)}` : ''}</div>
          <div style="background-color:#f3f0e8;border-left:4px solid #b8ad94;border-radius:6px;padding:14px 16px;font-size:14px;line-height:1.55;color:#4d5a52;white-space:pre-wrap;">${esc(original_message)}</div>
        </td></tr>
        <tr><td style="padding:20px 28px 0;">
          <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#3f6b3a;margin-bottom:6px;">Our reply</div>
          <div style="background-color:#eef5ec;border-left:4px solid #3f6b3a;border-radius:6px;padding:16px;font-size:15px;line-height:1.6;color:#1f2a22;white-space:pre-wrap;">${esc(reply_message)}</div>
        </td></tr>
        <tr><td style="padding:22px 28px 26px;text-align:center;">
          <div style="font-size:13px;color:#4d5a52;border-top:1px solid #e5dfd0;padding-top:16px;">${replyNote}</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

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
        ...(files.length ? { attachments: files } : {}),
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
