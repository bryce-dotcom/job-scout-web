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
import { resolveCaller, type Caller } from "../_shared/auth.ts";
import { isRecordTarget } from "../_shared/arnieRecords.ts";
import { applyRecordProposal, mayChange, rollbackRecordProposal } from "../_shared/arnieRecordPropose.ts";
import { applyBulkProposal, BULK_TARGETS, isBulkTarget, rollbackBulkProposal } from "../_shared/arnieBulk.ts";

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

// Who may decide this proposal?
//
// Config changes remain admin-only, as they always were. Record changes defer
// to the target's own rule, re-checked here at decision time rather than
// trusted from whenever the draft was made.
async function mayDecide(rest: { url: string; key: string }, caller: Caller, prop: any) {
  if (isBulkTarget(prop.target)) {
    const need = BULK_TARGETS[prop.target].minLevel;
    return caller.level >= need
      ? { ok: true as const }
      : { ok: false as const, error: 'Only an admin can approve a catalogue-wide change.' };
  }
  if (isRecordTarget(prop.target)) {
    return await mayChange(rest, caller, prop.target, prop.payload?.entity_id ?? null);
  }
  return caller.level >= 3
    ? { ok: true as const }
    : { ok: false as const, error: 'Only an admin can change company settings.' };
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
    const caller = await resolveCaller(req, SUPABASE_URL, SERVICE_KEY);
    if (!caller || caller.companyId == null) {
      return json({ error: 'Sign in with a company account to change settings.' }, 403);
    }
    const companyId = caller.companyId;

    const body = await req.json().catch(() => ({}));
    const action = body.action;

    // ── PROPOSE: shared with arnie-chat, so a change asked for in conversation
    // and the same change asked for in Setup produce an identical proposal.
    if (action === 'propose') {
      if (caller.level < 3) return json({ error: 'Only an admin can change company settings.' }, 403);
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

    const permitted = await mayDecide(rest, caller, prop);
    if (!permitted.ok) return json({ error: permitted.error }, 403);
    const isRecord = isRecordTarget(prop.target);
    const isBulk = isBulkTarget(prop.target);

    if (action === 'reject') {
      if (prop.status !== 'pending') return json({ error: `Can't reject a ${prop.status} change.` }, 400);
      await sb.from('arnie_proposals').update({ status: 'rejected', decided_by: caller.email, decided_at: new Date().toISOString() }).eq('id', proposalId);
      return json({ ok: true, status: 'rejected' });
    }

    if (action === 'apply') {
      if (prop.status !== 'pending') return json({ error: `This change is already ${prop.status}.` }, 400);
      if (isBulk) {
        const res = await applyBulkProposal(rest, companyId, prop);
        if (!res.ok) {
          if (res.stale) {
            await sb.from('arnie_proposals').update({
              status: 'failed', error: res.error, decided_by: caller.email, decided_at: new Date().toISOString(),
            }).eq('id', proposalId);
            return json({ error: res.error }, 409);
          }
          return json({ error: res.error }, 500);
        }
        await sb.from('arnie_proposals').update({
          status: 'applied', decided_by: caller.email, decided_at: new Date().toISOString(),
        }).eq('id', proposalId);
        await audit(sb, companyId, caller.email, `arnie_bulk_apply:${prop.target}`, proposalId, {
          summary: prop.summary, changed: res.changed, before: prop.before_value, after: prop.after_value,
        });
        return json({ ok: true, status: 'applied', target: prop.target, changed: res.changed });
      }
      if (isRecord) {
        const res = await applyRecordProposal(rest, companyId, prop);
        if (!res.ok) {
          if (res.stale) {
            await sb.from('arnie_proposals').update({
              status: 'failed', error: res.error, decided_by: caller.email, decided_at: new Date().toISOString(),
            }).eq('id', proposalId);
            return json({ error: res.error }, 409);
          }
          return json({ error: res.error }, 500);
        }
        await sb.from('arnie_proposals').update({
          status: 'applied', decided_by: caller.email, decided_at: new Date().toISOString(),
        }).eq('id', proposalId);
        await audit(sb, companyId, caller.email, `arnie_record_apply:${prop.target}`, proposalId, {
          summary: prop.summary, entity: prop.payload?.entity_label, before: res.before, after: res.after,
        });
        return json({ ok: true, status: 'applied', target: prop.target });
      }
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
      if (isBulk) {
        const res = await rollbackBulkProposal(rest, companyId, prop);
        if (!res.ok) return json({ error: res.error }, 500);
        await sb.from('arnie_proposals').update({
          status: 'rolled_back', decided_by: caller.email, decided_at: new Date().toISOString(),
        }).eq('id', proposalId);
        await audit(sb, companyId, caller.email, `arnie_bulk_rollback:${prop.target}`, proposalId, {
          summary: prop.summary, restored: res.restored,
        });
        return json({ ok: true, status: 'rolled_back', target: prop.target, restored: res.restored });
      }
      if (isRecord) {
        const res = await rollbackRecordProposal(rest, companyId, prop);
        if (!res.ok) return json({ error: res.error }, 500);
        await sb.from('arnie_proposals').update({
          status: 'rolled_back', decided_by: caller.email, decided_at: new Date().toISOString(),
        }).eq('id', proposalId);
        await audit(sb, companyId, caller.email, `arnie_record_rollback:${prop.target}`, proposalId, {
          summary: prop.summary, entity: prop.payload?.entity_label, restored: res.restored,
        });
        return json({ ok: true, status: 'rolled_back', target: prop.target });
      }
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
