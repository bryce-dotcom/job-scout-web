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
import { callAnthropic } from "../_shared/anthropic.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ALLOWED_TARGETS = ['business_units', 'lead_sources', 'service_types'] as const;
const TARGET_LABEL: Record<string, string> = {
  business_units: 'business unit',
  lead_sources: 'lead source',
  service_types: 'service type',
};

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

// Resolve the caller to an admin of a company, from their JWT — never trust a
// company_id in the body.
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

// Read a taxonomy list from settings (stored as a JSON-stringified array).
async function readList(sb: any, companyId: number, key: string): Promise<{ row: any | null; list: string[] }> {
  const { data } = await sb.from('settings').select('id, value')
    .eq('company_id', companyId).eq('key', key).order('id').limit(1);
  const row = data?.[0] || null;
  let list: string[] = [];
  if (row?.value) { try { const p = JSON.parse(row.value); if (Array.isArray(p)) list = p.map(String); } catch { /* ignore */ } }
  return { row, list };
}

// Deterministically compute the new list for an action. Returns null if the
// action is a no-op or invalid (so we don't apply meaningless changes).
function applyToList(list: string[], action: string, value: string, newValue?: string): string[] | null {
  const has = (v: string) => list.some((x) => x.toLowerCase() === v.toLowerCase());
  if (action === 'add') {
    if (!value || has(value)) return null;
    return [...list, value];
  }
  if (action === 'remove') {
    if (!has(value)) return null;
    return list.filter((x) => x.toLowerCase() !== value.toLowerCase());
  }
  if (action === 'rename') {
    if (!value || !newValue || !has(value)) return null;
    return list.map((x) => (x.toLowerCase() === value.toLowerCase() ? newValue : x));
  }
  return null;
}

async function writeList(sb: any, companyId: number, key: string, row: any | null, list: string[]) {
  const value = JSON.stringify(list);
  if (row) await sb.from('settings').update({ value }).eq('id', row.id);
  else await sb.from('settings').insert({ company_id: companyId, key, value });
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
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const caller = await resolveAdmin(sb, req);
    if (!caller) return json({ error: 'Only an admin can configure the system.' }, 403);
    const companyId = caller.companyId;

    const body = await req.json().catch(() => ({}));
    const action = body.action;

    // ── PROPOSE: Arnie parses the request into a structured, validated change
    if (action === 'propose') {
      const request = String(body.request || '').trim();
      if (!request) return json({ error: 'Tell Arnie what you want to change.' }, 400);

      // Ground the model with the current lists.
      const current: Record<string, string[]> = {};
      for (const t of ALLOWED_TARGETS) current[t] = (await readList(sb, companyId, t)).list;

      const sys = `You configure a field-service SaaS. Convert the admin's request into EXACTLY ONE change to one of these lists. Respond with ONLY minified JSON, no prose.
Targets and their current values:
- business_units: ${JSON.stringify(current.business_units)}
- lead_sources: ${JSON.stringify(current.lead_sources)}
- service_types: ${JSON.stringify(current.service_types)}
Schema: {"target":"business_units|lead_sources|service_types","action":"add|rename|remove","value":"<item>","newValue":"<only for rename>","summary":"<one plain sentence>"}
If the request cannot be mapped to one of these lists/actions, respond {"error":"<why, and what you CAN change>"}.`;

      const ai = await callAnthropic(
        { feature: 'arnie-config', companyId },
        { model: 'claude-sonnet-4-5-20250929', max_tokens: 400, system: sys, messages: [{ role: 'user', content: request }] },
      );
      if (!ai.ok) return json({ error: ai.friendly || 'Arnie is unavailable right now.', ai_unavailable: ai.unavailable === true }, 200);

      const txt = (ai.data?.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
      let parsed: any;
      try { parsed = JSON.parse((txt.match(/\{[\s\S]*\}/) || [txt])[0]); } catch { return json({ error: "Arnie couldn't turn that into a change. Try naming the list and item, e.g. \"add a business unit called Government\"." }, 200); }
      if (parsed.error) return json({ error: parsed.error }, 200);

      const target = String(parsed.target || '');
      const act = String(parsed.action || '');
      const value = String(parsed.value || '').trim();
      const newValue = parsed.newValue ? String(parsed.newValue).trim() : undefined;
      if (!ALLOWED_TARGETS.includes(target as any) || !['add', 'rename', 'remove'].includes(act) || !value) {
        return json({ error: 'That isn\'t a change Arnie can make yet (Tier A covers business units, lead sources, and service types).' }, 200);
      }

      const { list } = await readList(sb, companyId, target);
      const after = applyToList(list, act, value, newValue);
      if (!after) {
        const why = act === 'add' ? `"${value}" is already in your ${TARGET_LABEL[target]}s`
          : `"${value}" isn't in your ${TARGET_LABEL[target]}s`;
        return json({ error: `Nothing to do — ${why}.` }, 200);
      }

      const summary = String(parsed.summary || `${act} ${TARGET_LABEL[target]} "${value}"`);
      const { data: prop, error: insErr } = await sb.from('arnie_proposals').insert({
        company_id: companyId, created_by: caller.email, request_text: request,
        target, action: act, payload: { value, newValue }, summary,
        before_value: list, after_value: after, status: 'pending',
      }).select().single();
      if (insErr) return json({ error: insErr.message }, 500);
      return json({ proposal: prop, preview: { target, label: TARGET_LABEL[target], before: list, after } });
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
      const { row, list } = await readList(sb, companyId, prop.target);
      const after = applyToList(list, prop.action, prop.payload.value, prop.payload.newValue);
      if (!after) {
        await sb.from('arnie_proposals').update({ status: 'failed', error: 'No longer applicable (config changed).', decided_by: caller.email, decided_at: new Date().toISOString() }).eq('id', proposalId);
        return json({ error: 'That change no longer applies — the list changed since it was drafted.' }, 409);
      }
      await writeList(sb, companyId, prop.target, row, after);
      await sb.from('arnie_proposals').update({ status: 'applied', before_value: list, after_value: after, decided_by: caller.email, decided_at: new Date().toISOString() }).eq('id', proposalId);
      await audit(sb, companyId, caller.email, `arnie_config_apply:${prop.target}`, proposalId, { summary: prop.summary, before: list, after });
      return json({ ok: true, status: 'applied', target: prop.target, before: list, after });
    }

    if (action === 'rollback') {
      if (prop.status !== 'applied') return json({ error: `Only an applied change can be rolled back (this one is ${prop.status}).` }, 400);
      const { row } = await readList(sb, companyId, prop.target);
      const restore = Array.isArray(prop.before_value) ? prop.before_value.map(String) : [];
      await writeList(sb, companyId, prop.target, row, restore);
      await sb.from('arnie_proposals').update({ status: 'rolled_back', decided_by: caller.email, decided_at: new Date().toISOString() }).eq('id', proposalId);
      await audit(sb, companyId, caller.email, `arnie_config_rollback:${prop.target}`, proposalId, { summary: prop.summary, restored: restore });
      return json({ ok: true, status: 'rolled_back', target: prop.target, restored: restore });
    }

    return json({ error: 'Unknown action.' }, 400);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
