import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
    const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { action, employee_id, company_id, access_token, refresh_token, expires_in } = await req.json();

    if (!action) {
      return new Response(JSON.stringify({ error: 'action is required (store, refresh, disconnect)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ─── STORE: Upsert tokens after OAuth ───
    if (action === 'store') {
      if (!employee_id || !company_id || !access_token) {
        return new Response(JSON.stringify({ error: 'employee_id, company_id, and access_token are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const token_expires_at = expires_in
        ? new Date(Date.now() + expires_in * 1000).toISOString()
        : new Date(Date.now() + 3600 * 1000).toISOString(); // default 1hr

      const { error } = await supabase
        .from('google_calendar_tokens')
        .upsert({
          employee_id,
          company_id,
          access_token,
          refresh_token: refresh_token || null,
          token_expires_at,
          connected_at: new Date().toISOString(),
          status: 'active'
        }, { onConflict: 'employee_id' });

      if (error) {
        return new Response(JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ─── REFRESH: Use refresh_token to get new access_token ───
    if (action === 'refresh') {
      if (!employee_id) {
        return new Response(JSON.stringify({ error: 'employee_id is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
        return new Response(JSON.stringify({ error: 'Google OAuth credentials not configured' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Get stored refresh token
      const { data: tokenRow, error: fetchError } = await supabase
        .from('google_calendar_tokens')
        .select('*')
        .eq('employee_id', employee_id)
        .single();

      if (fetchError || !tokenRow?.refresh_token) {
        return new Response(JSON.stringify({ error: 'No refresh token found. Please reconnect Google Calendar.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Exchange refresh token for new access token
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          refresh_token: tokenRow.refresh_token,
          grant_type: 'refresh_token'
        })
      });

      const tokenData = await tokenRes.json();

      if (!tokenRes.ok || !tokenData.access_token) {
        // Token revoked or expired
        await supabase.from('google_calendar_tokens').update({ status: 'expired' }).eq('employee_id', employee_id);
        return new Response(JSON.stringify({ error: 'Token refresh failed. Please reconnect Google Calendar.', expired: true }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Update stored token
      const newExpiry = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString();
      await supabase
        .from('google_calendar_tokens')
        .update({
          access_token: tokenData.access_token,
          token_expires_at: newExpiry,
          status: 'active'
        })
        .eq('employee_id', employee_id);

      return new Response(JSON.stringify({ success: true, access_token: tokenData.access_token, expires_at: newExpiry }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ─── DISCONNECT: Remove token row ───
    if (action === 'disconnect') {
      if (!employee_id) {
        return new Response(JSON.stringify({ error: 'employee_id is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      await supabase.from('google_calendar_tokens').delete().eq('employee_id', employee_id);

      return new Response(JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
