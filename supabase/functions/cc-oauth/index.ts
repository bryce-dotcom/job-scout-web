import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CC_AUTH_BASE = 'https://authz.constantcontact.com/oauth2/default/v1';
const CC_API_BASE = 'https://api.cc.email/v3';

// Helper to query Supabase REST API
async function querySupabase(table: string, params: string = ''): Promise<any[]> {
  const url = `${Deno.env.get('SUPABASE_URL')}/rest/v1/${table}?${params}`;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) return [];
  try {
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${key}`,
        'apikey': key,
      }
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

// Helper to write/update Supabase REST API
async function upsertSupabase(
  table: string,
  body: Record<string, unknown>,
  method: 'POST' | 'PATCH' = 'POST',
  params: string = ''
): Promise<{ ok: boolean; data?: any; error?: string }> {
  const url = `${Deno.env.get('SUPABASE_URL')}/rest/v1/${table}?${params}`;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) return { ok: false, error: 'Missing service role key' };
  try {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${key}`,
      'apikey': key,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    };
    if (method === 'POST') {
      headers['Prefer'] = 'resolution=merge-duplicates,return=representation';
    }
    const res = await fetch(url, { method, headers, body: JSON.stringify(body) });
    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: errText };
    }
    const data = await res.json();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// Build Basic auth header for CC token endpoint
function ccBasicAuth(): string {
  const clientId = Deno.env.get('CC_CLIENT_ID') || '';
  const clientSecret = Deno.env.get('CC_CLIENT_SECRET') || '';
  const encoded = base64Encode(new TextEncoder().encode(`${clientId}:${clientSecret}`));
  return `Basic ${encoded}`;
}

// ── Action: authorize ─────────────────────────────────────────────────────────
async function handleAuthorize(body: Record<string, unknown>): Promise<Response> {
  const companyId = body.company_id;
  if (!companyId) {
    return new Response(JSON.stringify({ success: false, error: 'company_id is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const clientId = Deno.env.get('CC_CLIENT_ID');
  if (!clientId) {
    return new Response(JSON.stringify({ success: false, error: 'CC_CLIENT_ID not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const redirectUri = Deno.env.get('CC_REDIRECT_URI')
    || `${Deno.env.get('SUPABASE_URL')}/functions/v1/cc-oauth`;

  // Encode state as base64 JSON with company_id
  const statePayload = JSON.stringify({ company_id: companyId, ts: Date.now() });
  const state = base64Encode(new TextEncoder().encode(statePayload));

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: 'contact_data campaign_data account_read offline_access',
    state,
  });

  const url = `${CC_AUTH_BASE}/authorize?${params.toString()}`;

  return new Response(JSON.stringify({ success: true, url }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ── Action: callback ──────────────────────────────────────────────────────────
async function handleCallback(req: Request): Promise<Response> {
  const reqUrl = new URL(req.url);
  const code = reqUrl.searchParams.get('code');
  const stateParam = reqUrl.searchParams.get('state');
  const error = reqUrl.searchParams.get('error');

  // If CC returns an error, show it
  if (error) {
    const errorDesc = reqUrl.searchParams.get('error_description') || error;
    return new Response(errorHtml(`Constant Contact authorization failed: ${errorDesc}`), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'text/html' },
    });
  }

  if (!code || !stateParam) {
    return new Response(errorHtml('Missing code or state parameter'), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'text/html' },
    });
  }

  // Decode state to get company_id
  let companyId: number;
  try {
    const decoded = new TextDecoder().decode(base64Decode(stateParam));
    const stateObj = JSON.parse(decoded);
    companyId = stateObj.company_id;
  } catch {
    return new Response(errorHtml('Invalid state parameter'), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'text/html' },
    });
  }

  const redirectUri = Deno.env.get('CC_REDIRECT_URI')
    || `${Deno.env.get('SUPABASE_URL')}/functions/v1/cc-oauth`;

  // Exchange authorization code for tokens
  const tokenRes = await fetch(`${CC_AUTH_BASE}/token`, {
    method: 'POST',
    headers: {
      'Authorization': ccBasicAuth(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }).toString(),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error('CC token exchange failed:', tokenRes.status, errText);
    return new Response(errorHtml('Failed to exchange authorization code for tokens'), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'text/html' },
    });
  }

  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;
  const refreshToken = tokenData.refresh_token;
  const expiresIn = tokenData.expires_in || 7200;
  const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  // Fetch CC account info to get account ID
  let ccAccountId: string | null = null;
  try {
    const accountRes = await fetch(`${CC_API_BASE}/account/summary`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (accountRes.ok) {
      const accountData = await accountRes.json();
      ccAccountId = accountData.encoded_account_id || accountData.account_id || null;
    }
  } catch (err) {
    console.error('Failed to fetch CC account info:', (err as Error).message);
  }

  // Store tokens in cc_integrations (upsert by company_id)
  const integrationData = {
    company_id: companyId,
    access_token: accessToken,
    refresh_token: refreshToken,
    token_expires_at: tokenExpiresAt,
    cc_account_id: ccAccountId,
    status: 'active',
    connected_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const result = await upsertSupabase('cc_integrations', integrationData, 'POST', 'on_conflict=company_id');
  if (!result.ok) {
    console.error('Failed to store CC integration:', result.error);
    return new Response(errorHtml('Connected to Constant Contact but failed to save tokens'), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'text/html' },
    });
  }

  // Return success HTML that notifies opener and closes
  const html = `<!DOCTYPE html>
<html>
<head><title>Connected!</title></head>
<body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f0fdf4;">
  <div style="text-align:center;">
    <div style="font-size:48px;margin-bottom:16px;">&#10003;</div>
    <h2 style="color:#166534;">Constant Contact Connected!</h2>
    <p style="color:#4b5563;">This window will close automatically...</p>
  </div>
  <script>
    if (window.opener) {
      window.opener.postMessage({ type: 'CC_OAUTH_SUCCESS', company_id: ${companyId} }, '*');
    }
    setTimeout(() => window.close(), 2000);
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: { ...corsHeaders, 'Content-Type': 'text/html' },
  });
}

// ── Action: refresh ───────────────────────────────────────────────────────────
async function handleRefresh(body: Record<string, unknown>): Promise<Response> {
  const companyId = body.company_id;
  if (!companyId) {
    return new Response(JSON.stringify({ success: false, error: 'company_id is required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const integrations = await querySupabase('cc_integrations', `company_id=eq.${companyId}&select=*`);
  if (!integrations.length) {
    return new Response(JSON.stringify({ success: false, error: 'No Constant Contact integration found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const integration = integrations[0];
  if (!integration.refresh_token) {
    return new Response(JSON.stringify({ success: false, error: 'No refresh token available — re-authorize required' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Request new tokens from CC
  const tokenRes = await fetch(`${CC_AUTH_BASE}/token`, {
    method: 'POST',
    headers: {
      'Authorization': ccBasicAuth(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: integration.refresh_token,
    }).toString(),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    console.error('CC token refresh failed:', tokenRes.status, errText);

    // Mark integration as expired
    await upsertSupabase(
      'cc_integrations',
      { status: 'expired', updated_at: new Date().toISOString() },
      'PATCH',
      `company_id=eq.${companyId}`
    );

    return new Response(JSON.stringify({ success: false, error: 'Token refresh failed — re-authorization required' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const tokenData = await tokenRes.json();
  const expiresIn = tokenData.expires_in || 7200;
  const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  // Update tokens in database
  const updateResult = await upsertSupabase(
    'cc_integrations',
    {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      token_expires_at: tokenExpiresAt,
      status: 'active',
      updated_at: new Date().toISOString(),
    },
    'PATCH',
    `company_id=eq.${companyId}`
  );

  if (!updateResult.ok) {
    return new Response(JSON.stringify({ success: false, error: 'Tokens refreshed but failed to save' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

// ── Helper: decode base64 (for state param) ───────────────────────────────────
function base64Decode(str: string): Uint8Array {
  const binStr = atob(str);
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) {
    bytes[i] = binStr.charCodeAt(i);
  }
  return bytes;
}

// ── Helper: error HTML page ───────────────────────────────────────────────────
function errorHtml(message: string): string {
  return `<!DOCTYPE html>
<html>
<head><title>Connection Error</title></head>
<body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#fef2f2;">
  <div style="text-align:center;max-width:480px;">
    <div style="font-size:48px;margin-bottom:16px;">&#10007;</div>
    <h2 style="color:#991b1b;">Connection Failed</h2>
    <p style="color:#4b5563;">${message}</p>
    <button onclick="window.close()" style="margin-top:16px;padding:8px 24px;background:#dc2626;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px;">Close</button>
  </div>
  <script>
    if (window.opener) {
      window.opener.postMessage({ type: 'CC_OAUTH_ERROR', error: '${message.replace(/'/g, "\\'")}' }, '*');
    }
  </script>
</body>
</html>`;
}

// ── Main Handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // GET requests are OAuth callbacks from Constant Contact
    if (req.method === 'GET') {
      return await handleCallback(req);
    }

    // POST requests are actions (authorize, refresh)
    const body = await req.json();
    const action = body.action;

    switch (action) {
      case 'authorize':
        return await handleAuthorize(body);
      case 'callback':
        return await handleCallback(req);
      case 'refresh':
        return await handleRefresh(body);
      default:
        return new Response(JSON.stringify({ success: false, error: `Unknown action: ${action}. Use "authorize", "callback", or "refresh".` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
