import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Estimate Follow-Up Cron
 *
 * Called on a schedule (e.g. daily). Finds sent estimates that haven't been
 * approved/rejected and sends up to 3 follow-up emails at increasing intervals:
 *   Follow-up 1: 3 days after sent
 *   Follow-up 2: 7 days after sent
 *   Follow-up 3: 14 days after sent
 *
 * Skips estimates that are already Approved, Rejected, Expired, or Draft.
 */

const FOLLOWUP_DAYS = [3, 7, 14];

const FOLLOWUP_SUBJECTS = [
  (estNum: string, company: string) => `Just checking in — Estimate ${estNum} from ${company}`,
  (estNum: string, company: string) => `Following up on your estimate ${estNum} — ${company}`,
  (estNum: string, company: string) => `Last chance to lock in your pricing — Estimate ${estNum}`,
];

const FOLLOWUP_BODIES = [
  // Follow-up 1: Friendly check-in (3 days)
  (displayName: string, estNum: string, portalUrl: string, contactPhone: string, contactEmail: string) => `
    <p style="color:#2c3530;font-size:15px;line-height:1.7;margin:0 0 16px 0;">
      Hi there! We wanted to follow up on Estimate <strong>${estNum}</strong> that we sent over a few days ago.
    </p>
    <p style="color:#2c3530;font-size:15px;line-height:1.7;margin:0 0 16px 0;">
      We know things get busy, so we just wanted to make sure you had a chance to review it.
      If you have any questions about the scope of work, pricing, or timeline — we're happy to walk through it with you.
    </p>
    <p style="color:#2c3530;font-size:15px;line-height:1.7;margin:0 0 16px 0;">
      You can view and approve your estimate online anytime:
    </p>
    ${portalUrl ? `
    <div style="text-align:center;margin:24px 0;">
      <a href="${portalUrl}" style="display:inline-block;padding:14px 36px;background-color:#5a6349;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;border-radius:8px;">
        View & Approve Estimate
      </a>
    </div>` : ''}
    <p style="color:#4d5a52;font-size:14px;line-height:1.6;margin:0;">
      ${contactPhone ? `Give us a call at <strong>${contactPhone}</strong> if you'd like to discuss.` : 'Feel free to reply to this email with any questions.'}
    </p>`,

  // Follow-up 2: Value-focused (7 days)
  (displayName: string, estNum: string, portalUrl: string, contactPhone: string, contactEmail: string) => `
    <p style="color:#2c3530;font-size:15px;line-height:1.7;margin:0 0 16px 0;">
      We're following up one more time on Estimate <strong>${estNum}</strong>. We want to make sure you don't miss out on this opportunity.
    </p>
    <p style="color:#2c3530;font-size:15px;line-height:1.7;margin:0 0 16px 0;">
      Our team is ready to get started as soon as you give the green light. The sooner we begin, the sooner you'll see results.
      If pricing or scope needs adjusting, we're flexible — just let us know what works best for you.
    </p>
    ${portalUrl ? `
    <div style="text-align:center;margin:24px 0;">
      <a href="${portalUrl}" style="display:inline-block;padding:14px 36px;background-color:#5a6349;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;border-radius:8px;">
        Review Your Estimate
      </a>
    </div>` : ''}
    <p style="color:#4d5a52;font-size:14px;line-height:1.6;margin:0;">
      ${contactPhone ? `Questions? Call us at <strong>${contactPhone}</strong> — we're here to help.` : 'Reply to this email and we\'ll get right back to you.'}
    </p>`,

  // Follow-up 3: Urgency / last touch (14 days)
  (displayName: string, estNum: string, portalUrl: string, contactPhone: string, contactEmail: string) => `
    <p style="color:#2c3530;font-size:15px;line-height:1.7;margin:0 0 16px 0;">
      This is our final follow-up regarding Estimate <strong>${estNum}</strong>. We don't want you to lose out on the pricing and availability we quoted.
    </p>
    <p style="color:#2c3530;font-size:15px;line-height:1.7;margin:0 0 16px 0;">
      Pricing and material availability can shift, so we'd love to lock things in for you while everything is still current.
      If the project isn't the right fit right now, no worries at all — just let us know and we'll keep your info on file for whenever you're ready.
    </p>
    ${portalUrl ? `
    <div style="text-align:center;margin:24px 0;">
      <a href="${portalUrl}" style="display:inline-block;padding:14px 36px;background-color:#5a6349;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;border-radius:8px;">
        Approve Estimate Now
      </a>
    </div>` : ''}
    <p style="color:#4d5a52;font-size:14px;line-height:1.6;margin:0;">
      ${contactPhone ? `We're just a phone call away: <strong>${contactPhone}</strong>.` : 'Simply reply to this email if you have questions.'}
    </p>`,
];

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

    if (!RESEND_API_KEY) {
      return new Response(JSON.stringify({ error: 'RESEND_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const now = new Date();
    const results: { estimate_id: number; followup: number; status: string }[] = [];

    // Find all "Sent" estimates that have a sent_date and haven't completed 3 follow-ups
    const { data: estimates, error: fetchErr } = await supabase
      .from('quotes')
      .select('id, company_id, quote_id, sent_date, last_sent_at, sent_to_email, portal_token, followup_count, status, quote_amount, business_unit, lead_id, customer_id')
      .eq('status', 'Sent')
      .not('sent_date', 'is', null)
      .not('sent_to_email', 'is', null)
      .lt('followup_count', 3);

    if (fetchErr) {
      console.error('Fetch error:', fetchErr);
      return new Response(JSON.stringify({ error: fetchErr.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!estimates || estimates.length === 0) {
      return new Response(JSON.stringify({ success: true, message: 'No estimates need follow-up', sent: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    for (const est of estimates) {
      const sentDate = new Date(est.sent_date);
      const daysSinceSent = Math.floor((now.getTime() - sentDate.getTime()) / (1000 * 60 * 60 * 24));
      const nextFollowup = est.followup_count || 0; // 0, 1, or 2
      const requiredDays = FOLLOWUP_DAYS[nextFollowup];

      if (daysSinceSent < requiredDays) continue;

      // Fetch company info for branding
      const { data: company } = await supabase
        .from('companies')
        .select('name')
        .eq('id', est.company_id)
        .single();

      // Fetch business unit info if applicable
      let buName = '', buPhone = '', buEmail = '', buAddress = '';
      if (est.business_unit) {
        const { data: settingsRow } = await supabase
          .from('settings')
          .select('value')
          .eq('company_id', est.company_id)
          .eq('key', 'business_units')
          .maybeSingle();

        if (settingsRow?.value) {
          try {
            const units = typeof settingsRow.value === 'string' ? JSON.parse(settingsRow.value) : settingsRow.value;
            const unit = units.find((u: any) => u.name === est.business_unit);
            if (unit) {
              buName = unit.name || '';
              buPhone = unit.phone || '';
              buEmail = unit.email || '';
              buAddress = unit.address || '';
            }
          } catch (_) {}
        }
      }

      const displayName = buName || company?.name || 'Our Company';
      const contactPhone = buPhone;
      const contactEmail = buEmail;
      const estNum = est.quote_id || `EST-${est.id}`;

      // Build portal URL
      let portalUrl = '';
      if (est.portal_token) {
        // We don't know the origin here, so use a generic approach
        // The portal token row has the origin baked into the email already
        // For follow-ups, we'll construct it from the Supabase URL domain
        // Actually, we need to store the app origin. For now, use the portal token.
        const { data: tokenRow } = await supabase
          .from('customer_portal_tokens')
          .select('token')
          .eq('document_type', 'estimate')
          .eq('document_id', est.id)
          .eq('is_revoked', false)
          .gt('expires_at', now.toISOString())
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (tokenRow) {
          // Use the app URL from settings or fallback
          const { data: appUrlSetting } = await supabase
            .from('settings')
            .select('value')
            .eq('company_id', est.company_id)
            .eq('key', 'app_url')
            .maybeSingle();

          const appUrl = appUrlSetting?.value || 'https://app.jobscout.appsannex.com';
          portalUrl = `${appUrl}/portal/${tokenRow.token}`;
        }
      }

      // Build contact info
      const contactParts: string[] = [];
      if (contactPhone) contactParts.push(contactPhone);
      if (contactEmail) contactParts.push(contactEmail);
      if (buAddress) contactParts.push(buAddress);
      const contactLine = contactParts.join(' &nbsp;|&nbsp; ');

      const subject = FOLLOWUP_SUBJECTS[nextFollowup](estNum, displayName);
      const bodyContent = FOLLOWUP_BODIES[nextFollowup](displayName, estNum, portalUrl, contactPhone, contactEmail);

      const htmlBody = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background-color:#f7f5ef;">
  <div style="max-width:600px;margin:0 auto;padding:32px 16px;">

    <!-- Accent bar -->
    <div style="height:4px;background-color:#5a6349;border-radius:4px 4px 0 0;"></div>

    <div style="background-color:#ffffff;border-radius:0 0 12px 12px;padding:40px 32px;border:1px solid #d6cdb8;border-top:none;">

      <!-- Header -->
      <div style="text-align:center;margin-bottom:28px;">
        <h1 style="color:#3e4532;font-size:26px;margin:0 0 6px 0;font-weight:700;">${displayName}</h1>
        <div style="display:inline-block;background-color:rgba(90,99,73,0.1);padding:6px 16px;border-radius:20px;">
          <span style="color:#5a6349;font-size:14px;font-weight:600;">Estimate ${estNum} — Follow-Up</span>
        </div>
      </div>

      <!-- Body -->
      <div style="border-top:1px solid #e8e4db;padding-top:24px;">
        ${bodyContent}
      </div>

      <!-- Footer -->
      <div style="margin-top:28px;padding-top:20px;border-top:1px solid #e8e4db;text-align:center;">
        <p style="color:#5a6349;font-size:13px;font-weight:600;margin:0 0 4px 0;">${displayName}</p>
        ${contactLine ? `<p style="color:#7d8a7f;font-size:11px;margin:0 0 8px 0;">${contactLine}</p>` : ''}
        <p style="color:#b4b9af;font-size:10px;margin:0;">
          Sent via Job Scout
        </p>
      </div>

    </div>
  </div>
</body>
</html>`;

      // Send via Resend
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: `${displayName} <estimates@appsannex.com>`,
          to: [est.sent_to_email],
          subject,
          html: htmlBody,
        }),
      });

      if (!resendRes.ok) {
        const errText = await resendRes.text();
        console.error(`Follow-up ${nextFollowup + 1} failed for estimate ${est.id}:`, errText);
        results.push({ estimate_id: est.id, followup: nextFollowup + 1, status: 'failed' });
        continue;
      }

      // Update estimate: increment followup_count, record follow_up timestamp
      const followupField = `follow_up_${nextFollowup + 1}`;
      await supabase
        .from('quotes')
        .update({
          followup_count: nextFollowup + 1,
          [followupField]: now.toISOString(),
        })
        .eq('id', est.id);

      results.push({ estimate_id: est.id, followup: nextFollowup + 1, status: 'sent' });
      console.log(`Follow-up ${nextFollowup + 1} sent for estimate ${est.id} to ${est.sent_to_email}`);
    }

    return new Response(JSON.stringify({
      success: true,
      sent: results.filter(r => r.status === 'sent').length,
      failed: results.filter(r => r.status === 'failed').length,
      results,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('estimate-followup error:', error);
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
