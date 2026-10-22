// Keeping Arnie on the best model — the server half (Bryce, 2026-10-22).
// The weekly GitHub job (scripts/arnie-model-watch.mjs) runs the evals, which
// take longer than a function may; this does the parts that need the
// Anthropic key or decide anything:
//
//   { action: 'candidates' }  → what Anthropic lists that is worth trying
//   { action: 'record', … }   → keep the trial, decide, switch if it passes,
//                                email the platform owners either way
//   { action: 'rollback' }    → back to the previous model
//
// Servers only (isServiceCaller). Rules in _shared/arnieModelWatch.ts.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { isServiceCaller } from "../_shared/auth.ts";
import { hasExactPrice } from "../_shared/anthropic.ts";
import { decideTrial, pickCandidates } from "../_shared/arnieModelWatch.ts";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });
const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

serve(async (req) => {
  const URL_ = Deno.env.get('SUPABASE_URL')!, KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  if (!(await isServiceCaller(req, URL_, KEY))) return json({ error: 'servers only' }, 401)
  const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }
  const get = async (p: string) => { const r = await fetch(`${URL_}/rest/v1/${p}`, { headers: H }); return r.ok ? r.json() : [] }
  const body = await req.json().catch(() => ({})) as Record<string, any>
  const [state] = await get('arnie_model_state?select=model,previous_model,changed_at&id=eq.1&limit=1')
  const current = state?.model || 'claude-sonnet-5-5'

  if (body.action === 'candidates') {
    const r = await fetch('https://api.anthropic.com/v1/models?limit=100', {
      headers: { 'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') || '', 'anthropic-version': '2023-06-01' },
    })
    if (!r.ok) return json({ error: `Anthropic model list: ${r.status}` }, 502)
    const models = (await r.json())?.data || []
    const tried = new Set<string>((await get('arnie_model_trials?select=model,decision&limit=500'))
      .filter((t: any) => t.decision !== 'not_priced' || !hasExactPrice(t.model)).map((t: any) => t.model))
    const candidates = pickCandidates(models, current, tried).map((m) => ({ ...m, priced: hasExactPrice(m.id) }))
    return json({ current, candidates, listed: models.map((m: any) => m.id) })
  }

  if (body.action === 'record') {
    const model = String(body.model || '')
    if (!/^claude-[a-z0-9-]{3,60}$/.test(model)) return json({ error: 'model?' }, 400)
    const t = {
      passed: Number(body.passed) || 0, total: Number(body.total) || 0,
      costPerCall: body.cost_per_call == null ? null : Number(body.cost_per_call),
      baselinePassed: Number(body.baseline_passed) || 0, baselineTotal: Number(body.baseline_total) || 0,
      baselineCostPerCall: body.baseline_cost_per_call == null ? null : Number(body.baseline_cost_per_call),
      priced: hasExactPrice(model),
    }
    const { decision, why } = decideTrial(t)
    await fetch(`${URL_}/rest/v1/arnie_model_trials`, {
      method: 'POST', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({
        model, passed: t.passed, total: t.total, cost_per_call: t.costPerCall,
        baseline_model: current, baseline_passed: t.baselinePassed, baseline_total: t.baselineTotal, baseline_cost_per_call: t.baselineCostPerCall,
        decision, note: why,
      }),
    })
    if (decision === 'switched') {
      await fetch(`${URL_}/rest/v1/arnie_model_state?id=eq.1`, {
        method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
        body: JSON.stringify({ model, previous_model: current, changed_at: new Date().toISOString(), reason: `Model watch: ${why}` }),
      })
    }
    await tellOwners(URL_, H, decision === 'switched'
      ? `Arnie moved to ${model}`
      : `Arnie stays on ${current} — ${model} tried`,
      `<p><b>${esc(model)}</b> was tried against Arnie's current model, <b>${esc(current)}</b>, on the full eval.</p>`
      + `<p>${esc(why)}</p>`
      + (decision === 'switched'
        ? `<p>Arnie now answers on ${esc(model)}. If anything looks worse, it goes back with one step: the model watch's rollback, which restores ${esc(current)}.</p>`
        : `<p>Nothing changed.</p>`))
    return json({ model, decision, why })
  }

  if (body.action === 'rollback') {
    if (!state?.previous_model) return json({ error: 'no previous model to go back to' }, 400)
    await fetch(`${URL_}/rest/v1/arnie_model_state?id=eq.1`, {
      method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' },
      body: JSON.stringify({ model: state.previous_model, previous_model: current, changed_at: new Date().toISOString(), reason: `Rolled back from ${current}` }),
    })
    await tellOwners(URL_, H, `Arnie rolled back to ${state.previous_model}`, `<p>Arnie was moved back from ${esc(current)} to <b>${esc(state.previous_model)}</b>.</p>`)
    return json({ model: state.previous_model, from: current })
  }

  return json({ current, previous: state?.previous_model || null, changed_at: state?.changed_at || null })
})

/** The platform company's owners — the people who run JobScout itself. */
async function tellOwners(url: string, H: Record<string, string>, subject: string, html: string) {
  try {
    const cos = await (await fetch(`${url}/rest/v1/companies?select=id,owner_email&is_platform=eq.true`, { headers: H })).json()
    const to = [...new Set((cos || []).map((c: any) => String(c.owner_email || '').toLowerCase()).filter(Boolean))]
    if (!to.length) return
    await fetch(`${url}/functions/v1/send-email`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ to, subject, from: 'JobScout <alerts@appsannex.com>',
        html: `<div style="font:14px/1.6 -apple-system,Segoe UI,Arial,sans-serif;color:#2c3530;max-width:640px">${html}<p style="color:#7d8a7f;font-size:12px">The weekly Arnie model watch: it tries each new Sonnet and Opus once, on the full eval, and switches only if the new one scores at least as well and costs no more than 30% extra per reply.</p></div>` }),
    })
  } catch (e) { console.error('[arnie-model-watch] email', (e as Error)?.message) }
}
