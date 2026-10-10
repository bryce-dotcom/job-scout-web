// employee-direct-deposit
// =====================================================================
// An employee puts their own bank on file from My Pay, the way they would
// in Gusto's employee app — no admin typing account numbers, no onboarding
// link to chase.
//
// Two ways in:
//   link_token  → a Plaid Link token (Auth product only) for this employee
//   exchange    → public_token from Link → routing + account from Plaid
//                 → signed direct-deposit authorization → the Plaid item
//                 is removed at once (we keep numbers, not a live link)
//   manual      → routing + account typed in, routing checksum verified
//
// Either way the result is a signed_documents row (document_kind
// 'direct_deposit_auth'), which is what payroll-dd-export, the NACHA file
// and My Pay already read. The newest signed row wins.
//
// Auth: the caller's JWT email must be the employee's own email, or an
// admin of the company. company_id and employee_id come from the body but
// are checked against that.
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

function jwtEmail(req: Request): string | null {
  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
    const part = token.split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
    return (payload?.email || '').toLowerCase() || null;
  } catch { return null; }
}

// ABA routing number: nine digits, weighted checksum (3,7,1) mod 10 = 0.
function validRouting(r: string): boolean {
  if (!/^\d{9}$/.test(r)) return false;
  const w = [3, 7, 1, 3, 7, 1, 3, 7, 1];
  return r.split('').reduce((s, d, i) => s + Number(d) * w[i], 0) % 10 === 0;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');
    const companyId = Number(body.company_id);
    const employeeId = Number(body.employee_id);
    if (!action || !companyId || !employeeId) return json({ error: 'action, company_id and employee_id are required' }, 400);

    // Who is asking, and may they act for this employee?
    const email = jwtEmail(req);
    if (!email) return json({ error: 'Sign in first.' }, 401);
    const { data: emp } = await sb.from('employees').select('id, name, email, company_id, active, tax_classification').eq('id', employeeId).eq('company_id', companyId).maybeSingle();
    if (!emp) return json({ error: 'Employee not found.' }, 404);
    let allowed = String(emp.email || '').toLowerCase() === email;
    if (!allowed) {
      const { data: me } = await sb.from('employees').select('role, user_role, is_admin, is_developer').ilike('email', email).eq('active', true).eq('company_id', companyId).limit(1);
      const m = me?.[0];
      allowed = !!m && (m.is_developer === true || m.is_admin === true || ['Admin', 'admin', 'Owner', 'owner'].includes(m.user_role) || ['Admin', 'Owner'].includes(m.role));
    }
    if (!allowed) return json({ error: 'You can only set up your own direct deposit.' }, 403);

    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
    const ua = req.headers.get('user-agent') || null;
    const consent = 'I authorize my employer to deposit my pay into the account below and, if needed, to reverse a deposit made in error. This authorization stays in effect until I replace it or cancel it in writing.';

    const saveAuthorization = async (snap: Record<string, unknown>, label: string, typedName: string) => {
      const { data, error } = await sb.from('signed_documents').insert({
        company_id: companyId,
        employee_id: employeeId,
        document_kind: 'direct_deposit_auth',
        document_label: label,
        values_snapshot: snap,
        signature_typed_name: typedName,
        signed_at: new Date().toISOString(),
        signer_ip: ip,
        signer_user_agent: ua,
        consent_text: consent,
        status: 'signed',
      }).select('id, signed_at').single();
      if (error) throw new Error('Could not save the authorization: ' + error.message);
      const acct = String(snap.account_number || '');
      await sb.from('employees').update({
        dd_account_last4: acct.slice(-4),
        dd_account_type: snap.account_type || 'checking',
        updated_at: new Date().toISOString(),
      }).eq('id', employeeId);
      return { id: data.id, signed_at: data.signed_at, mask: acct.slice(-4), type: snap.account_type || 'checking', bank_name: snap.bank_name || null };
    };

    // ── Manual entry ──────────────────────────────────────────────────
    if (action === 'manual') {
      const routing = String(body.routing_number || '').replace(/\D/g, '');
      const account = String(body.account_number || '').replace(/\D/g, '');
      const type = body.account_type === 'savings' ? 'savings' : 'checking';
      const typedName = String(body.signature_typed_name || '').trim();
      if (!validRouting(routing)) return json({ error: 'That routing number does not check out. It is the nine-digit number at the bottom left of a check.' }, 400);
      if (account.length < 4 || account.length > 17) return json({ error: 'Account numbers are 4 to 17 digits.' }, 400);
      if (!typedName) return json({ error: 'Type your full name to sign.' }, 400);
      const saved = await saveAuthorization({ routing_number: routing, account_number: account, account_type: type, bank_name: body.bank_name || null, source: 'manual', enable: true }, 'Direct Deposit Authorization', typedName);
      return json({ ok: true, ...saved });
    }

    // ── Plaid ─────────────────────────────────────────────────────────
    const { data: setting } = await sb.from('settings').select('value').eq('company_id', companyId).eq('key', 'plaid_config').maybeSingle();
    const config = setting?.value ? JSON.parse(setting.value) : {};
    const clientId = Deno.env.get('PLAID_CLIENT_ID') || config.client_id;
    const secret = Deno.env.get('PLAID_SECRET') || config.secret;
    const plaidEnv = Deno.env.get('PLAID_ENV') || config.environment || 'sandbox';
    const plaidBase = plaidEnv === 'production' ? 'https://production.plaid.com' : `https://${plaidEnv}.plaid.com`;
    if (!clientId || !secret) return json({ error: 'Bank linking is not set up for this company yet. Enter your account by hand instead.' }, 400);
    const plaid = async (path: string, payload: Record<string, unknown>) => {
      const r = await fetch(`${plaidBase}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client_id: clientId, secret, ...payload }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.display_message || d.error_message || `Plaid ${path} failed`);
      return d;
    };

    if (action === 'link_token') {
      const d = await plaid('/link/token/create', {
        user: { client_user_id: `employee-${employeeId}` },
        client_name: 'JobScout',
        products: ['auth'],
        country_codes: ['US'],
        language: 'en',
      });
      return json({ link_token: d.link_token });
    }

    if (action === 'exchange') {
      const publicToken = String(body.public_token || '');
      const typedName = String(body.signature_typed_name || '').trim();
      if (!publicToken) return json({ error: 'public_token is required' }, 400);
      if (!typedName) return json({ error: 'Type your full name to sign.' }, 400);
      const ex = await plaid('/item/public_token/exchange', { public_token: publicToken });
      const accessToken = ex.access_token;
      try {
        const auth = await plaid('/auth/get', { access_token: accessToken });
        const byId: Record<string, any> = {};
        for (const a of auth.accounts || []) byId[a.account_id] = a;
        const nums: any[] = (auth.numbers?.ach || []).filter((n: any) => !byId[n.account_id]?.type || byId[n.account_id].type === 'depository');
        const wanted = body.account_id ? nums.find((n: any) => n.account_id === body.account_id) : null;
        const n = wanted || nums[0];
        if (!n) return json({ error: 'That bank did not return a checking or savings account that can take a deposit.' }, 400);
        const a = byId[n.account_id] || {};
        const type = a.subtype === 'savings' ? 'savings' : 'checking';
        const bankName = body.institution_name || auth.item?.institution_name || null;
        const saved = await saveAuthorization(
          { routing_number: n.routing, account_number: n.account, account_type: type, bank_name: bankName, account_name: a.name || a.official_name || null, source: 'plaid', verified_at: new Date().toISOString(), enable: true },
          'Direct Deposit Authorization (bank verified)', typedName);
        return json({ ok: true, ...saved });
      } finally {
        // We keep the numbers, not the connection.
        try { await plaid('/item/remove', { access_token: accessToken }); } catch { /* best effort */ }
      }
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
