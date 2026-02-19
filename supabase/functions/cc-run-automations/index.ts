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
  } catch {
    return null;
  }
}

// Send a single email via CC API to a specific contact
async function sendEmailToContact(
  token: string,
  contactId: string,
  subject: string,
  htmlContent: string,
  fromName: string,
  fromEmail: string
): Promise<boolean> {
  try {
    // Create a single-send email activity
    const createRes = await fetch(`${CC_API_BASE}/emails`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: `Auto: ${subject.substring(0, 50)} - ${new Date().toISOString()}`,
        email_campaign_activities: [{
          format_type: 5, // custom HTML
          from_name: fromName,
          from_email: fromEmail,
          subject,
          html_content: htmlContent,
        }],
      }),
    });

    if (!createRes.ok) return false;
    const campaign = await createRes.json();
    const activityId = campaign.campaign_activities?.[0]?.campaign_activity_id;
    if (!activityId) return false;

    // Schedule to send immediately to the specific contact
    const scheduleRes = await fetch(`${CC_API_BASE}/emails/activities/${activityId}/schedules`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        scheduled_date: '0', // Send immediately
      }),
    });

    return scheduleRes.ok;
  } catch {
    return false;
  }
}

// Resolve merge variables in template content
function resolveVariables(content: string, vars: Record<string, string>): string {
  let result = content;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || '');
  }
  return result;
}

// Evaluate triggers and find matching records
async function evaluateTrigger(
  automation: any,
  companyId: number
): Promise<Array<{ email: string; name: string; vars: Record<string, string> }>> {
  const matches: Array<{ email: string; name: string; vars: Record<string, string> }> = [];
  const delayDays = automation.trigger_config?.delay_days || 0;
  const cutoffDate = new Date(Date.now() - delayDays * 24 * 60 * 60 * 1000).toISOString();

  switch (automation.trigger_type) {
    case 'audit_completed': {
      // Find audits completed within the delay window (between cutoff and cutoff+1day)
      const windowEnd = new Date(new Date(cutoffDate).getTime() + 24 * 60 * 60 * 1000).toISOString();
      const audits = await querySupabase(
        'lighting_audits',
        `company_id=eq.${companyId}&status=eq.Completed&updated_at=gte.${cutoffDate}&updated_at=lt.${windowEnd}&select=*,customer:customers!customer_id(id,name,email)`
      );

      for (const audit of audits) {
        if (audit.customer?.email) {
          // Check if we already sent this automation for this audit
          const existing = await querySupabase(
            'communications_log',
            `company_id=eq.${companyId}&type=eq.Email&notes=cs.Automated: ${automation.name}&notes=cs.audit:${audit.id}`
          );
          if (existing.length === 0) {
            matches.push({
              email: audit.customer.email,
              name: audit.customer.name || '',
              vars: {
                first_name: (audit.customer.name || '').split(' ')[0],
                company_name: audit.customer.name || '',
                email: audit.customer.email,
                audit_id: audit.audit_id || String(audit.id),
              },
            });
          }
        }
      }
      break;
    }

    case 'quote_sent':
    case 'quote_no_response': {
      // Find quotes sent N days ago with no response (still in Sent status)
      const windowEnd = new Date(new Date(cutoffDate).getTime() + 24 * 60 * 60 * 1000).toISOString();
      const quotes = await querySupabase(
        'quotes',
        `company_id=eq.${companyId}&status=eq.Sent&updated_at=gte.${cutoffDate}&updated_at=lt.${windowEnd}&select=*,customer:customers!customer_id(id,name,email)`
      );

      for (const quote of quotes) {
        if (quote.customer?.email) {
          const existing = await querySupabase(
            'communications_log',
            `company_id=eq.${companyId}&type=eq.Email&notes=cs.Automated: ${automation.name}&notes=cs.quote:${quote.id}`
          );
          if (existing.length === 0) {
            matches.push({
              email: quote.customer.email,
              name: quote.customer.name || '',
              vars: {
                first_name: (quote.customer.name || '').split(' ')[0],
                company_name: quote.customer.name || '',
                email: quote.customer.email,
                quote_total: quote.total ? `$${Number(quote.total).toFixed(2)}` : '',
              },
            });
          }
        }
      }
      break;
    }

    case 'job_completed': {
      const windowEnd = new Date(new Date(cutoffDate).getTime() + 24 * 60 * 60 * 1000).toISOString();
      const jobs = await querySupabase(
        'jobs',
        `company_id=eq.${companyId}&status=eq.Completed&updated_at=gte.${cutoffDate}&updated_at=lt.${windowEnd}&select=*,customer:customers!customer_id(id,name,email)`
      );

      for (const job of jobs) {
        if (job.customer?.email) {
          const existing = await querySupabase(
            'communications_log',
            `company_id=eq.${companyId}&type=eq.Email&notes=cs.Automated: ${automation.name}&notes=cs.job:${job.id}`
          );
          if (existing.length === 0) {
            matches.push({
              email: job.customer.email,
              name: job.customer.name || '',
              vars: {
                first_name: (job.customer.name || '').split(' ')[0],
                company_name: job.customer.name || '',
                email: job.customer.email,
                job_title: job.job_title || '',
              },
            });
          }
        }
      }
      break;
    }

    case 'customer_anniversary': {
      // Customers created approximately 365 days ago (within a 7-day window)
      const anniversaryStart = new Date(Date.now() - 372 * 24 * 60 * 60 * 1000).toISOString();
      const anniversaryEnd = new Date(Date.now() - 358 * 24 * 60 * 60 * 1000).toISOString();
      const customers = await querySupabase(
        'customers',
        `company_id=eq.${companyId}&created_at=gte.${anniversaryStart}&created_at=lt.${anniversaryEnd}&marketing_opt_in=eq.true&select=*`
      );

      for (const customer of customers) {
        if (customer.email) {
          const existing = await querySupabase(
            'communications_log',
            `company_id=eq.${companyId}&type=eq.Email&notes=cs.Automated: ${automation.name}&customer_id=eq.${customer.id}&sent_date=gte.${new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()}`
          );
          if (existing.length === 0) {
            matches.push({
              email: customer.email,
              name: customer.name || '',
              vars: {
                first_name: (customer.name || '').split(' ')[0],
                company_name: customer.name || '',
                email: customer.email,
              },
            });
          }
        }
      }
      break;
    }

    case 'seasonal': {
      const targetMonth = automation.trigger_config?.month;
      const currentMonth = new Date().toLocaleString('en-US', { month: 'long' });
      if (targetMonth && targetMonth.toLowerCase() !== currentMonth.toLowerCase()) break;

      // Check if already sent this month
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const existing = await querySupabase(
        'communications_log',
        `company_id=eq.${companyId}&type=eq.Email&notes=cs.Automated: ${automation.name}&sent_date=gte.${monthStart}`
      );
      if (existing.length > 0) break;

      // Get all marketing-opted-in customers
      const customers = await querySupabase(
        'customers',
        `company_id=eq.${companyId}&marketing_opt_in=eq.true&select=*`
      );

      for (const customer of customers) {
        if (customer.email) {
          matches.push({
            email: customer.email,
            name: customer.name || '',
            vars: {
              first_name: (customer.name || '').split(' ')[0],
              company_name: customer.name || '',
              email: customer.email,
              season: currentMonth,
            },
          });
        }
      }
      break;
    }
  }

  return matches;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { company_id } = await req.json();

    if (!company_id) {
      return new Response(JSON.stringify({ success: false, error: 'company_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get CC access token
    const token = await getCcToken(company_id);
    if (!token) {
      return new Response(JSON.stringify({ success: false, error: 'Constant Contact not connected or token expired' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get integration settings for default sender
    const integrations = await querySupabase('cc_integrations', `company_id=eq.${company_id}&select=*`);
    const integration = integrations[0];
    const defaultFromName = integration?.settings?.default_from_name || 'Your Company';
    const defaultFromEmail = integration?.settings?.default_from_email || '';

    // Fetch all active automations for this company
    const automations = await querySupabase(
      'email_automations',
      `company_id=eq.${company_id}&active=eq.true&select=*,template:email_templates!template_id(*)`
    );

    let totalSent = 0;
    let totalErrors = 0;
    const results: Array<{ automation: string; sent: number; errors: number }> = [];

    for (const automation of automations) {
      if (!automation.template) continue;

      const matches = await evaluateTrigger(automation, company_id);
      let sent = 0;
      let errors = 0;

      for (const match of matches) {
        // Resolve template variables
        const subject = resolveVariables(automation.template.subject || '', match.vars);
        const htmlContent = resolveVariables(automation.template.html_content || '', match.vars);
        const fromName = defaultFromName;
        const fromEmail = defaultFromEmail;

        if (!fromEmail) {
          errors++;
          continue;
        }

        // Send email via CC
        const success = await sendEmailToContact(token, match.email, subject, htmlContent, fromName, fromEmail);

        if (success) {
          sent++;

          // Log to communications_log
          await upsertSupabase('communications_log', {
            company_id,
            type: 'Email',
            recipient: match.email,
            sent_date: new Date().toISOString(),
            status: 'Sent',
            notes: `Automated: ${automation.name} | ${automation.trigger_type}`,
          });
        } else {
          errors++;
        }

        // Throttle: 4 requests/sec for CC API
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      // Update automation stats
      if (sent > 0) {
        await upsertSupabase(
          'email_automations',
          {
            last_triggered: new Date().toISOString(),
            times_triggered: (automation.times_triggered || 0) + sent,
            updated_at: new Date().toISOString(),
          },
          'PATCH',
          `id=eq.${automation.id}`
        );
      }

      totalSent += sent;
      totalErrors += errors;
      results.push({ automation: automation.name, sent, errors });
    }

    return new Response(JSON.stringify({
      success: true,
      automations_evaluated: automations.length,
      total_sent: totalSent,
      total_errors: totalErrors,
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
