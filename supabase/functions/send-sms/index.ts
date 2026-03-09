import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Send SMS via Twilio REST API using per-company credentials from settings
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { company_id, to, message, template, template_data } = await req.json();

    if (!company_id) {
      return new Response(JSON.stringify({ error: 'company_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!to || !message) {
      return new Response(JSON.stringify({ error: 'to and message are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get Twilio config from per-company settings
    const { data: setting } = await supabase
      .from('settings')
      .select('value')
      .eq('company_id', company_id)
      .eq('key', 'twilio_config')
      .single();

    if (!setting?.value) {
      return new Response(JSON.stringify({ error: 'Twilio not configured. Go to Settings > Integrations to set up.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let config: Record<string, string>;
    try {
      config = JSON.parse(setting.value);
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid Twilio configuration' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!config.account_sid || !config.auth_token || !config.from_number) {
      return new Response(JSON.stringify({ error: 'Twilio Account SID, Auth Token, and From Number are all required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Clean phone number — strip non-digits, ensure +1 prefix
    let cleanTo = to.replace(/\D/g, '');
    if (cleanTo.length === 10) cleanTo = '1' + cleanTo;
    if (!cleanTo.startsWith('+')) cleanTo = '+' + cleanTo;

    // Build message body — if template provided, do simple variable substitution
    let body = message;
    if (template && template_data) {
      body = template;
      for (const [key, val] of Object.entries(template_data)) {
        body = body.replace(new RegExp(`{{${key}}}`, 'g'), String(val));
      }
    }

    // Send via Twilio REST API
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${config.account_sid}/Messages.json`;
    const credentials = btoa(`${config.account_sid}:${config.auth_token}`);

    const twilioRes = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: cleanTo,
        From: config.from_number,
        Body: body,
      }),
    });

    const twilioData = await twilioRes.json();

    if (!twilioRes.ok) {
      console.error('Twilio error:', twilioData);
      return new Response(JSON.stringify({
        error: twilioData.message || 'Failed to send SMS',
        code: twilioData.code,
      }), { status: twilioRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Log to communications_log if table exists
    try {
      await supabase.from('communications_log').insert({
        company_id,
        type: 'sms',
        direction: 'outbound',
        to_address: cleanTo,
        from_address: config.from_number,
        subject: null,
        body: body,
        status: 'sent',
        external_id: twilioData.sid,
        sent_at: new Date().toISOString(),
      });
    } catch {
      // Table might not exist yet — that's okay
    }

    return new Response(JSON.stringify({
      success: true,
      sid: twilioData.sid,
      status: twilioData.status,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('send-sms error:', error);
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
