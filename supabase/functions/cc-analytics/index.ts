import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CC_API_BASE = 'https://api.cc.email/v3';
const CC_AUTH_BASE = 'https://authz.constantcontact.com/oauth2/default/v1';

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

// Helper to get valid CC access token (auto-refresh if expired)
async function getCcToken(companyId: number): Promise<string | null> {
  const integrations = await querySupabase('cc_integrations', `company_id=eq.${companyId}&select=*`);
  if (!integrations.length) return null;
  const integration = integrations[0];

  if (new Date(integration.token_expires_at) < new Date()) {
    const refreshed = await refreshToken(integration, companyId);
    if (!refreshed) return null;
    return refreshed;
  }

  return integration.access_token;
}

// Refresh an expired token
async function refreshToken(integration: any, companyId: number): Promise<string | null> {
  if (!integration.refresh_token) return null;

  const clientId = Deno.env.get('CC_CLIENT_ID') || '';
  const clientSecret = Deno.env.get('CC_CLIENT_SECRET') || '';
  const basicAuth = btoa(`${clientId}:${clientSecret}`);

  try {
    const tokenRes = await fetch(`${CC_AUTH_BASE}/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: integration.refresh_token,
      }).toString(),
    });

    if (!tokenRes.ok) {
      console.error('Token refresh failed:', tokenRes.status);
      await upsertSupabase(
        'cc_integrations',
        { status: 'expired', updated_at: new Date().toISOString() },
        'PATCH',
        `company_id=eq.${companyId}`
      );
      return null;
    }

    const tokenData = await tokenRes.json();
    const expiresIn = tokenData.expires_in || 7200;
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    await upsertSupabase(
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

    return tokenData.access_token;
  } catch (err) {
    console.error('Token refresh error:', (err as Error).message);
    return null;
  }
}

// Fetch campaign stats from CC reporting API
async function fetchCampaignStats(
  accessToken: string,
  ccCampaignId: string
): Promise<{ ok: boolean; stats?: Record<string, unknown>; error?: string }> {
  try {
    const res = await fetch(`${CC_API_BASE}/reports/email_reports/${ccCampaignId}`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      if (res.status === 404) {
        return { ok: false, error: 'Campaign report not available yet' };
      }
      const errText = await res.text();
      return { ok: false, error: `CC API ${res.status}: ${errText}` };
    }

    const data = await res.json();

    // Extract key metrics
    const sends = data.stats?.em_sends || 0;
    const opens = data.stats?.em_opens || 0;
    const clicks = data.stats?.em_clicks || 0;
    const bounces = data.stats?.em_bounces || 0;
    const unsubscribes = data.stats?.em_unsubscribes || 0;
    const forwards = data.stats?.em_forwards || 0;
    const abuse = data.stats?.em_abuse || 0;
    const notOpened = data.stats?.em_not_opened || 0;

    // Calculate rates
    const openRate = sends > 0 ? Math.round((opens / sends) * 10000) / 100 : 0;
    const clickRate = sends > 0 ? Math.round((clicks / sends) * 10000) / 100 : 0;
    const bounceRate = sends > 0 ? Math.round((bounces / sends) * 10000) / 100 : 0;
    const unsubscribeRate = sends > 0 ? Math.round((unsubscribes / sends) * 10000) / 100 : 0;
    // Click-to-open rate
    const clickToOpenRate = opens > 0 ? Math.round((clicks / opens) * 10000) / 100 : 0;

    return {
      ok: true,
      stats: {
        sends,
        opens,
        clicks,
        bounces,
        unsubscribes,
        forwards,
        abuse,
        not_opened: notOpened,
        open_rate: openRate,
        click_rate: clickRate,
        bounce_rate: bounceRate,
        unsubscribe_rate: unsubscribeRate,
        click_to_open_rate: clickToOpenRate,
        campaign_status: data.stats?.em_campaign_status || 'unknown',
        last_polled: new Date().toISOString(),
      },
    };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// ── Main Handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { company_id, campaign_id } = await req.json();

    if (!company_id) {
      return new Response(JSON.stringify({ success: false, error: 'company_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get CC access token
    const accessToken = await getCcToken(company_id);
    if (!accessToken) {
      return new Response(JSON.stringify({ success: false, error: 'No valid Constant Contact connection — please authorize first' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Determine which campaigns to poll
    let campaignsToUpdate: any[];

    if (campaign_id) {
      // Single campaign
      campaignsToUpdate = await querySupabase(
        'email_campaigns',
        `id=eq.${campaign_id}&company_id=eq.${company_id}&cc_campaign_id=not.is.null&select=id,cc_campaign_id,name,status`
      );
      if (!campaignsToUpdate.length) {
        return new Response(JSON.stringify({ success: false, error: 'Campaign not found or has no CC campaign ID' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else {
      // All sent/sending/scheduled campaigns with CC IDs
      campaignsToUpdate = await querySupabase(
        'email_campaigns',
        `company_id=eq.${company_id}&cc_campaign_id=not.is.null&status=in.(sent,sending,scheduled)&select=id,cc_campaign_id,name,status`
      );
    }

    if (!campaignsToUpdate.length) {
      return new Response(JSON.stringify({
        success: true,
        campaigns_updated: 0,
        message: 'No campaigns with Constant Contact IDs to poll',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let updatedCount = 0;
    let errorCount = 0;
    const results: { campaign_id: string; name: string; status: string; stats?: Record<string, unknown>; error?: string }[] = [];

    for (const campaign of campaignsToUpdate) {
      const statsResult = await fetchCampaignStats(accessToken, campaign.cc_campaign_id);

      if (statsResult.ok && statsResult.stats) {
        // Update campaign stats in our database
        const updateData: Record<string, unknown> = {
          stats: statsResult.stats,
          last_stats_poll: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        // Update status based on CC campaign status
        const ccStatus = statsResult.stats.campaign_status as string;
        if (ccStatus === 'Sent' && campaign.status !== 'sent') {
          updateData.status = 'sent';
          if (!campaign.sent_at) {
            updateData.sent_at = new Date().toISOString();
          }
        }

        await upsertSupabase(
          'email_campaigns',
          updateData,
          'PATCH',
          `id=eq.${campaign.id}&company_id=eq.${company_id}`
        );

        updatedCount++;
        results.push({
          campaign_id: campaign.id,
          name: campaign.name,
          status: 'updated',
          stats: statsResult.stats,
        });
      } else {
        errorCount++;
        results.push({
          campaign_id: campaign.id,
          name: campaign.name,
          status: 'error',
          error: statsResult.error,
        });
      }
    }

    console.log(`Analytics poll for company ${company_id}: ${updatedCount} updated, ${errorCount} errors out of ${campaignsToUpdate.length} campaigns`);

    return new Response(JSON.stringify({
      success: true,
      campaigns_updated: updatedCount,
      campaigns_errored: errorCount,
      total_campaigns: campaignsToUpdate.length,
      results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
