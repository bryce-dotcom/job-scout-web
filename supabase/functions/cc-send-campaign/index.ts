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

// Get CC contact list IDs based on recipient_list_type
async function getListIds(
  accessToken: string,
  recipientListType: string
): Promise<string[]> {
  try {
    const listsRes = await fetch(`${CC_API_BASE}/contact_lists`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (!listsRes.ok) return [];

    const listsData = await listsRes.json();
    const allLists = listsData.lists || [];

    // Map our recipient types to CC list names
    const customerList = allLists.find((l: any) => l.name === 'Job Scout Customers');
    const leadList = allLists.find((l: any) => l.name === 'Job Scout Leads');

    switch (recipientListType) {
      case 'customers':
        return customerList ? [customerList.list_id] : [];
      case 'leads':
        return leadList ? [leadList.list_id] : [];
      case 'all':
      default:
        const ids: string[] = [];
        if (customerList) ids.push(customerList.list_id);
        if (leadList) ids.push(leadList.list_id);
        return ids;
    }
  } catch (err) {
    console.error('Failed to get list IDs:', (err as Error).message);
    return [];
  }
}

// ── Main Handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { company_id, campaign_id } = await req.json();

    if (!company_id || !campaign_id) {
      return new Response(JSON.stringify({ success: false, error: 'company_id and campaign_id are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch campaign from our database
    const campaigns = await querySupabase(
      'email_campaigns',
      `id=eq.${campaign_id}&company_id=eq.${company_id}&select=*`
    );
    if (!campaigns.length) {
      return new Response(JSON.stringify({ success: false, error: 'Campaign not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const campaign = campaigns[0];

    if (campaign.status === 'sent' || campaign.status === 'sending') {
      return new Response(JSON.stringify({ success: false, error: `Campaign already ${campaign.status}` }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch template if linked
    let htmlContent = '';
    let textContent = '';
    let subject = campaign.subject || '';

    if (campaign.template_id) {
      const templates = await querySupabase(
        'email_templates',
        `id=eq.${campaign.template_id}&select=*`
      );
      if (templates.length) {
        const template = templates[0];
        htmlContent = template.html_content || '';
        textContent = template.text_content || '';
        if (!subject) subject = template.subject || 'No Subject';
      }
    }

    if (!htmlContent) {
      return new Response(JSON.stringify({ success: false, error: 'Campaign has no HTML content — link a template first' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!subject) {
      return new Response(JSON.stringify({ success: false, error: 'Campaign has no subject line' }), {
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

    // Get contact list IDs based on recipient type
    const contactListIds = await getListIds(accessToken, campaign.recipient_list_type || 'all');
    if (!contactListIds.length) {
      return new Response(JSON.stringify({ success: false, error: 'No contact lists found — sync contacts first' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Step 1: Create email campaign activity in CC
    const fromName = campaign.from_name || 'Energy Team';
    const fromEmail = campaign.from_email;

    const createBody: Record<string, unknown> = {
      name: campaign.name || `Job Scout Campaign ${new Date().toISOString().split('T')[0]}`,
      email_campaign_activities: [{
        format_type: 5, // Custom Code format
        from_name: fromName,
        from_email: fromEmail,
        reply_to_email: fromEmail,
        subject,
        html_content: htmlContent,
        ...(textContent ? { text_content: textContent } : {}),
        contact_list_ids: contactListIds,
      }],
    };

    console.log(`Creating CC campaign for company ${company_id}: "${campaign.name}"`);

    const createRes = await fetch(`${CC_API_BASE}/emails`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(createBody),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      console.error('CC campaign creation failed:', createRes.status, errText);
      return new Response(JSON.stringify({ success: false, error: `Failed to create CC campaign: ${errText}` }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const ccCampaign = await createRes.json();
    const ccCampaignId = ccCampaign.campaign_id;
    const ccActivityId = ccCampaign.campaign_activities?.[0]?.campaign_activity_id;

    if (!ccCampaignId || !ccActivityId) {
      return new Response(JSON.stringify({ success: false, error: 'CC campaign created but missing IDs in response' }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`CC campaign created: ${ccCampaignId}, activity: ${ccActivityId}`);

    // Step 2: Schedule or send immediately
    let finalStatus = 'sending';

    if (campaign.scheduled_at) {
      // Schedule for later
      const scheduleRes = await fetch(`${CC_API_BASE}/emails/activities/${ccActivityId}/schedules`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scheduled_date: campaign.scheduled_at,
        }),
      });

      if (!scheduleRes.ok) {
        const errText = await scheduleRes.text();
        console.error('CC scheduling failed:', scheduleRes.status, errText);
        // Campaign is created but not scheduled — update with what we have
        finalStatus = 'draft';
      } else {
        finalStatus = 'scheduled';
        console.log(`CC campaign scheduled for ${campaign.scheduled_at}`);
      }
    } else {
      // Send immediately — schedule for "now" (CC requires scheduling)
      const sendRes = await fetch(`${CC_API_BASE}/emails/activities/${ccActivityId}/schedules`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scheduled_date: '0', // "0" means send immediately in CC API
        }),
      });

      if (!sendRes.ok) {
        const errText = await sendRes.text();
        console.error('CC immediate send failed:', sendRes.status, errText);
        finalStatus = 'draft';
      } else {
        finalStatus = 'sending';
        console.log(`CC campaign sent immediately`);
      }
    }

    // Step 3: Update our campaign record
    const updateData: Record<string, unknown> = {
      cc_campaign_id: ccCampaignId,
      status: finalStatus,
      updated_at: new Date().toISOString(),
    };

    if (finalStatus === 'sending') {
      updateData.sent_at = new Date().toISOString();
    }

    await upsertSupabase(
      'email_campaigns',
      updateData,
      'PATCH',
      `id=eq.${campaign_id}&company_id=eq.${company_id}`
    );

    return new Response(JSON.stringify({
      success: true,
      cc_campaign_id: ccCampaignId,
      cc_activity_id: ccActivityId,
      status: finalStatus,
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
