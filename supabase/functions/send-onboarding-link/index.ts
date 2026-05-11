// send-onboarding-link
// =====================================================================
// HR-side: creates a fresh employee_onboarding_packets row + delivers
// the magic link to the new hire via email + SMS.
//
// Auth: caller must be an HR-access employee in the same company as
// the target employee. Verified server-side (we don't trust the
// browser's "I'm HR" claim).
//
// Body:
//   { employee_id, channels: ('email'|'sms')[], custom_message?: string }
// =====================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const auth = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!auth) return json({ error: 'Authorization required' }, 401);

    // Resolve caller from JWT
    const { data: { user: callerUser }, error: userErr } = await supabase.auth.getUser(auth);
    if (userErr || !callerUser) return json({ error: 'Invalid auth token' }, 401);

    const body = await req.json().catch(() => ({}));
    const { employee_id, channels = ['email', 'sms'], custom_message } = body;
    if (!employee_id) return json({ error: 'employee_id is required' }, 400);

    // Find the caller's employee row + verify HR access on the SAME company
    // as the target employee.
    const { data: targetEmp, error: tErr } = await supabase
      .from('employees')
      .select('id, name, email, phone, company_id, hire_date')
      .eq('id', employee_id)
      .single();
    if (tErr || !targetEmp) return json({ error: 'Target employee not found' }, 404);

    const { data: callerEmp } = await supabase
      .from('employees')
      .select('id, name, has_hr_access, is_developer, user_role')
      .eq('company_id', targetEmp.company_id)
      .ilike('email', callerUser.email!)
      .maybeSingle();
    const callerHR = callerEmp?.has_hr_access || callerEmp?.is_developer ||
                     ['Admin','Owner','Super Admin'].includes(callerEmp?.user_role || '');
    if (!callerHR) return json({ error: 'Only HR-access users can send onboarding links' }, 403);

    if (!targetEmp.email && channels.includes('email')) {
      return json({ error: 'Employee has no email on file. Add one before sending the link.' }, 400);
    }
    if (!targetEmp.phone && channels.includes('sms')) {
      // SMS is optional — drop it silently if no phone
      const newChannels = channels.filter((c: string) => c !== 'sms');
      if (newChannels.length === 0) return json({ error: 'Employee has neither email nor phone on file.' }, 400);
      body.channels = newChannels;
    }

    // Create packet (fresh token every send; old links from prior sends
    // get revoked so the new hire only ever has one valid link)
    await supabase
      .from('employee_onboarding_packets')
      .update({ is_revoked: true })
      .eq('employee_id', employee_id)
      .neq('status', 'completed');

    const { data: packet, error: pktErr } = await supabase
      .from('employee_onboarding_packets')
      .insert({
        company_id: targetEmp.company_id,
        employee_id: targetEmp.id,
        status: 'sent',
        sent_at: new Date().toISOString(),
        sent_via: channels,
        created_by: callerEmp?.id || null,
      })
      .select('id, token, expires_at')
      .single();
    if (pktErr) return json({ error: pktErr.message }, 500);

    const SITE_URL = Deno.env.get('SITE_URL') || 'https://jobscout.appsannex.com';
    const link = `${SITE_URL}/onboarding/${packet.token}`;

    // Pull company info for greeting
    const { data: company } = await supabase
      .from('companies')
      .select('company_name, owner_email, phone')
      .eq('id', targetEmp.company_id)
      .single();

    const firstName = (targetEmp.name || '').split(' ')[0] || 'there';
    const greeting = custom_message?.trim() ||
      `Welcome to ${company?.company_name || 'the team'}! Tap the link below to fill out your tax info, direct deposit, and a few signatures. It takes about 15 minutes — you can do the whole thing on your phone.`;

    // ── EMAIL (via send-email function) ───────────────────────────────
    const sentVia: string[] = [];
    const deliveryErrors: string[] = [];
    const deliveryInfo: string[] = [];           // soft notes (e.g. SMS not configured)
    const deliveryDetails: Record<string, unknown> = {};

    // Pre-check: is Twilio configured for this company? If not, drop
    // SMS from the channels list entirely so we don't generate a noisy
    // "failed" error — it's a setup gap, not a delivery failure.
    if (channels.includes('sms')) {
      const { data: twSetting } = await supabase
        .from('settings')
        .select('value')
        .eq('company_id', targetEmp.company_id)
        .eq('key', 'twilio_config')
        .maybeSingle();
      const twCfg = twSetting?.value || {};
      const hasTwilio = !!(twCfg.account_sid && twCfg.auth_token && twCfg.from_number);
      if (!hasTwilio) {
        const idx = channels.indexOf('sms');
        if (idx >= 0) channels.splice(idx, 1);
        deliveryInfo.push('SMS skipped — Twilio not set up. Open Settings → Integrations to enable.');
      }
    }

    if (channels.includes('email') && targetEmp.email) {
      const html = `
<!DOCTYPE html><html><body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f3f1ea;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;background:#fff;border-radius:14px;margin-top:24px;">
    <h1 style="margin:0 0 12px;font-size:22px;color:#2c3530;">Hi ${firstName},</h1>
    <p style="margin:0 0 18px;color:#4d5a52;line-height:1.55;">${greeting}</p>
    <p style="margin:24px 0;text-align:center;">
      <a href="${link}" style="display:inline-block;padding:14px 36px;background:#5a6349;color:#fff;text-decoration:none;font-weight:700;border-radius:10px;">Start onboarding</a>
    </p>
    <p style="margin:0;color:#7d8a7f;font-size:12px;line-height:1.5;">
      This link is private to you and expires in 14 days. If you have any trouble, reply to this email or call us at ${company?.phone || ''}.
    </p>
  </div>
</body></html>`;
      try {
        // send-email expects `from` (a "Name <addr>" string), not `from_name`.
        // Without it the function defaults to JobScout <invoices@appsannex.com>.
        const fromName = (company?.company_name || 'JobScout').replace(/[^\x20-\x7E]/g, '').trim();
        const fromAddr = `${fromName} <invoices@appsannex.com>`;

        const emailRes = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            apikey: SERVICE_ROLE_KEY,
          },
          body: JSON.stringify({
            to: targetEmp.email,
            subject: `Welcome to ${company?.company_name || 'the team'} — finish your onboarding`,
            html,
            from: fromAddr,
            reply_to: company?.owner_email || undefined,
          }),
        });
        const emailBody = await emailRes.json().catch(() => ({}));
        deliveryDetails.email = { http: emailRes.status, body: emailBody };

        if (emailRes.ok && emailBody?.success) {
          sentVia.push('email');
        } else {
          const msg = emailBody?.error || `send-email returned ${emailRes.status}`;
          console.warn('[send-onboarding-link] email failed:', msg, emailBody);
          deliveryErrors.push(`email: ${msg}`);
        }
      } catch (err) {
        const msg = String((err as Error)?.message || err);
        console.warn('[send-onboarding-link] email threw:', msg);
        deliveryErrors.push(`email: ${msg}`);
      }
    }

    // ── SMS (via send-sms function) ───────────────────────────────────
    if (channels.includes('sms') && targetEmp.phone) {
      const smsText = `Hi ${firstName}! Welcome to ${company?.company_name || 'the team'}. Finish your onboarding here: ${link}`;
      try {
        const smsRes = await fetch(`${SUPABASE_URL}/functions/v1/send-sms`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            apikey: SERVICE_ROLE_KEY,
          },
          body: JSON.stringify({
            company_id: targetEmp.company_id,
            to: targetEmp.phone,
            message: smsText,
          }),
        });
        const smsBody = await smsRes.json().catch(() => ({}));
        deliveryDetails.sms = { http: smsRes.status, body: smsBody };

        if (smsRes.ok && (smsBody?.success || smsBody?.sid)) {
          sentVia.push('sms');
        } else {
          const msg = smsBody?.error || `send-sms returned ${smsRes.status}`;
          console.warn('[send-onboarding-link] sms failed:', msg, smsBody);
          deliveryErrors.push(`sms: ${msg}`);
        }
      } catch (err) {
        const msg = String((err as Error)?.message || err);
        console.warn('[send-onboarding-link] sms threw:', msg);
        deliveryErrors.push(`sms: ${msg}`);
      }
    }

    // Stamp the actual delivered channels
    if (sentVia.length > 0) {
      await supabase
        .from('employee_onboarding_packets')
        .update({ sent_via: sentVia })
        .eq('id', packet.id);
    }

    return json({
      ok: sentVia.length > 0,
      packet_id: packet.id,
      token: packet.token,
      link,
      sent_via: sentVia,
      delivery_errors: deliveryErrors,
      delivery_info:   deliveryInfo,
      delivery_details: deliveryDetails,
      expires_at: packet.expires_at,
    });
  } catch (err) {
    console.error('[send-onboarding-link] crashed:', err);
    return json({ error: String((err as Error)?.message || err) }, 500);
  }
});
