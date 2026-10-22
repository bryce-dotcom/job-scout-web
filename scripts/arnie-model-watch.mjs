#!/usr/bin/env node
// Keep Arnie on the best model — the weekly runner (Bryce, 2026-10-22).
//
//   npm run arnie:model-watch            ask, try anything new, record
//   npm run arnie:model-watch -- --dry   only list what would be tried
//
// Asks arnie-model-watch for candidates (the newest Sonnet and Opus that came
// out after Arnie's current model and were never tried). For each, runs the
// full eval on the CURRENT model and on the candidate, one after the other —
// they share the demo tenant and its test login — measures the cost per reply
// from ai_usage, and records it. The function decides and switches; this only
// measures. Nothing new: it exits in seconds and costs nothing.
//
// Needs .env with VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY and
// SUPABASE_SERVICE_ROLE_KEY — the same three as the nightly eval.

import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(readFileSync(resolve(root, '.env'), 'utf8').split(/\r?\n/)
  .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
  .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]))
const U = env.VITE_SUPABASE_URL, SR = env.SUPABASE_SERVICE_ROLE_KEY
if (!U || !SR) { console.error('arnie:model-watch — .env is missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(2) }
const H = { apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' }
const DRY = process.argv.includes('--dry')

const watch = async (body) => {
  const r = await fetch(`${U}/functions/v1/arnie-model-watch`, { method: 'POST', headers: H, body: JSON.stringify(body) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(`arnie-model-watch ${body.action}: ${r.status} ${JSON.stringify(j).slice(0, 300)}`)
  return j
}

/** "77/80 passed" from the eval's output — the last such line. */
export function scoreOf(out) {
  const m = [...String(out).matchAll(/(\d+)\/(\d+) passed/g)].pop()
  return m ? { passed: Number(m[1]), total: Number(m[2]) } : null
}

/** Average cost of one Arnie reply on this model, in the demo company, between two times. */
async function costPerCall(model, from, to) {
  const q = new URLSearchParams({ select: 'est_cost_usd', feature: 'eq.arnie-chat', company_id: 'eq.25', model: `eq.${model}`, limit: '5000' })
  q.append('created_at', `gte.${from}`); q.append('created_at', `lte.${to}`)
  const rows = await (await fetch(`${U}/rest/v1/ai_usage?${q}`, { headers: H })).json().catch(() => [])
  if (!Array.isArray(rows) || !rows.length) return null
  return rows.reduce((s, r) => s + (Number(r.est_cost_usd) || 0), 0) / rows.length
}

function runEval(model) {
  const from = new Date().toISOString()
  console.log(`\n── eval on ${model} ──`)
  const r = spawnSync(process.execPath, [resolve(root, 'scripts/arnie-eval.mjs'), '--model', model], { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const out = `${r.stdout || ''}${r.stderr || ''}`
  const score = scoreOf(out)
  console.log(score ? `${model}: ${score.passed}/${score.total}` : `${model}: the eval did not finish\n${out.slice(-800)}`)
  return { model, score, from, to: new Date().toISOString() }
}

const { current, candidates, listed } = await watch({ action: 'candidates' })
console.log(`Arnie is on ${current}. Anthropic lists: ${(listed || []).filter((m) => /sonnet|opus/.test(m)).join(', ')}`)
if (!candidates?.length) { console.log('Nothing new to try.'); process.exit(0) }
console.log(`To try: ${candidates.map((c) => `${c.id}${c.priced ? '' : ' (price not in the table yet)'}`).join(', ')}`)
if (DRY) process.exit(0)

const base = runEval(current)
const baseCost = await costPerCall(current, base.from, base.to)
for (const c of candidates) {
  const t = runEval(c.id)
  const cost = await costPerCall(c.id, t.from, t.to)
  const res = await watch({
    action: 'record', model: c.id,
    passed: t.score?.passed ?? 0, total: t.score?.total ?? 0, cost_per_call: cost,
    baseline_passed: base.score?.passed ?? 0, baseline_total: base.score?.total ?? 0, baseline_cost_per_call: baseCost,
  })
  console.log(`${c.id}: ${res.decision} — ${res.why}`)
  if (res.decision === 'switched') break   // one move a week; the next run compares against the new model
}
