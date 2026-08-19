// Arnie config customization — Tier A (ARCHITECTURE.md §9).
//
// "Tell Arnie what to change and he sets it up" — SAFELY. Arnie (the LLM)
// only PROPOSES a structured change; a deterministic path here applies the
// approved change to real config tables. No model-generated code ever runs.
//
// Flow: propose → (admin approves in UI) → apply (versioned + audited) →
//       rollback. Every action is admin-gated and company-scoped.
//
// Body: { action: 'propose'|'apply'|'reject'|'rollback', request?, proposal_id? }
// Config targets (Tier A): the taxonomy lists that drive the whole app.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { applyToList, proposeChange, readList, writeList } from "../_shared/arnieConfig.ts";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const rest = { url: SUPABASE_URL, key: SERVICE_KEY };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Everything about WHAT may change and HOW a list is edited now lives in
// _shared/arnieConfig.ts, shared with arnie-chat. What stays here is the part
// that is specific to this endpoint: who is allowed to ask, and the
// approve / reject / rollback lifecycle.

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// Decode the caller's JWT email (mirrors _shared/auth.ts).
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

async function resolveAdmin(sb: any, req: Request): Promise<{ email: string; companyId: number } | null> {
  const email = jwtEmail(req);
  if (!email) return null;
  const { data } = await sb.from('employees')
    .select('company_id, role, user_role, is_admin, is_developer')
    .ilike('email', email).eq('active', true).limit(1);
  const e = data?.[0];
  if (!e) return null;
  const admin = e.is_developer === true || e.is_admin === true
    || ['Admin', 'admin', 'Owner', 'owner'].includes(e.user_role)
    || ['Admin', 'Owner'].includes(e.role);
  if (!admin) return null;
  return { email, companyId: e.company_id };
}

async function audit(sb: any, companyId: number, email: string, action: string, proposalId: number, details: unknown) {
  try {
    await sb.from('audit_log').insert({
      company_id: companyId, user_email: email, action, table_name: 'settings',
      record_id: String(proposalId), new_values: details, created_at: new Date().toISOString(),
    });
  } catch { /* audit is best-effort */ }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const caller = await resolveAdmin(sb, req);
    if (!caller) return json({ error: 'Only an admin can configure the system.' }, 403);
    const companyId = caller.companyId;

    const body = await req.json().catch(() => ({}));
    const action = body.action;

    // ── PROPOSE: shared with arnie-chat, so a change asked for in conversation
    // and the same change asked for in Setup produce an identical proposal.
    if (action === 'propose') {
      const request = String(body.request || '').trim();
      if (!request) return json({ error: 'Tell Arnie what you want to change.' }, 400);
      const res = await proposeChange(rest, companyId, caller.email, request);
      return json(res, 200);
    }

    // ── APPLY / REJECT / ROLLBACK: operate on an existing proposal
    const proposalId = Number(body.proposal_id);
    if (!proposalId) return json({ error: 'proposal_id required' }, 400);
    const { data: prop } = await sb.from('arnie_proposals').select('*').eq('id', proposalId).eq('company_id', companyId).maybeSingle();
    if (!prop) return json({ error: 'Proposal not found.' }, 404);

    if (action === 'reject') {
      if (prop.status !== 'pending') return json({ error: `Can't reject a ${prop.status} change.` }, 400);
      await sb.from('arnie_proposals').update({ status: 'rejected', decided_by: caller.email, decided_at: new Date().toISOString() }).eq('id', proposalId);
      return json({ ok: true, status: 'rejected' });
    }

    if (action === 'apply') {
      if (prop.status !== 'pending') return json({ error: `This change is already ${prop.status}.` }, 400);
      // Re-read live list at apply time (config may have changed since propose)
      const { row, list } = await readList(rest, companyId, prop.target);
      const after = applyToList(list, prop.action, prop.payload.value, prop.payload.newValue, prop.target);
      if (!after) {
        await sb.from('arnie_proposals').update({ status: 'failed', error: 'No longer applicable (config changed).', decided_by: caller.email, decided_at: new Date().toISOString() }).eq('id', proposalId);
        return json({ error: 'That change no longer applies — the list changed since it was drafted.' }, 409);
      }
      await writeList(rest, companyId, prop.target, row, after);
      await sb.from('arnie_proposals').update({ status: 'applied', before_value: list, after_value: after, decided_by: caller.email, decided_at: new Date().toISOString() }).eq('id', proposalId);
      await audit(sb, companyId, caller.email, `arnie_config_apply:${prop.target}`, proposalId, { summary: prop.summary, before: list, after });
      return json({ ok: true, status: 'applied', target: prop.target, before: list, after });
    }

    if (action === 'rollback') {
      if (prop.status !== 'applied') return json({ error: `Only an applied change can be rolled back (this one is ${prop.status}).` }, 400);
      const { row } = await readList(rest, companyId, prop.target);
      const restore = Array.isArray(prop.before_value) ? prop.before_value : [];
      await writeList(rest, companyId, prop.target, row, restore);
      await sb.from('arnie_proposals').update({ status: 'rolled_back', decided_by: caller.email, decided_at: new Date().toISOString() }).eq('id', proposalId);
      await audit(sb, companyId, caller.email, `arnie_config_rollback:${prop.target}`, proposalId, { summary: prop.summary, restored: restore });
      return json({ ok: true, status: 'rolled_back', target: prop.target, restored: restore });
    }

    return json({ error: 'Unknown action.' }, 400);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
