#!/usr/bin/env node
// Frankie eval — ask him the questions the team actually asked, grade the answers.
//
// Why: one bad answer ("I don't have enough data… talk to your CPA") got
// fixed by hand. The next prompt change can quietly bring it back, and
// nobody finds out until a customer does. This runs every real question
// through exactly what production builds — same persona, same data
// context, from frankieContext.js — and grades each answer two ways:
//
//   1. Deterministic checks: a money question leads with a dollar figure;
//      no "what I don't have" inventories; no CPA hand-off as the answer;
//      no stage directions; the tax year is the fiscal year.
//   2. A judge model scores accuracy against the data context (are the
//      numbers traceable, is anything invented), decisiveness, usefulness.
//
// Reads the company's rows with the service key. Never writes.
//
//   node scripts/frankie-eval.mjs --dry                 # assemble only, no model calls, no cost
//   node scripts/frankie-eval.mjs                       # production model, all questions
//   node scripts/frankie-eval.mjs --model claude-opus-5 # compare a stronger model
//   node scripts/frankie-eval.mjs --only 19,20          # just some question ids
//
// Needs ANTHROPIC_API_KEY in the environment (the app's key lives in
// Supabase secrets, which cannot be read back — paste one from the console).
// Reports land in scripts/frankie-eval/runs/ (gitignored: they contain the
// company's numbers).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const src = (p) => pathToFileURL(path.join(root, 'src', p)).href

const { fullSystemPrompt } = await import(src('pages/agents/frankie/frankieContext.js'))
const { QUERIES } = await import(src('lib/schema.js'))
const { dedupeStripePayouts } = await import(src('lib/bankLedger.js'))

// ── args & env ───────────────────────────────────────────────────────
const args = process.argv.slice(2)
const flag = (name, dflt) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? (args[i + 1] ?? true) : dflt
}
const DRY = args.includes('--dry')
const COMPANY_ID = Number(flag('company', 3))
const MODEL = flag('model', 'claude-sonnet-4-5-20250929')   // what production runs (supabase/functions/arnie-chat)
const JUDGE = flag('judge', 'claude-opus-5')
const ROLE = flag('role', 'admin')
const ONLY = flag('only', null) ? String(flag('only')).split(',').map(s => s.trim()) : null

const env = Object.fromEntries(fs.readFileSync(path.join(root, '.env'), 'utf8').split('\n')
  .filter(l => /^[A-Z_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '').trim()] }))
const SB_URL = env.VITE_SUPABASE_URL
const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY
if (!SB_URL || !SB_KEY) { console.error('Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env'); process.exit(1) }
if (!DRY && !ANTHROPIC_KEY) { console.error('Set ANTHROPIC_API_KEY (or run with --dry to assemble prompts without calling the model).'); process.exit(1) }
if (!DRY && !/^sk-ant-/.test(ANTHROPIC_KEY)) {
  // The first run used the placeholder from the instructions as the key.
  console.error(`ANTHROPIC_API_KEY does not look like a real key (got "${ANTHROPIC_KEY.slice(0, 12)}…"). Real keys start with sk-ant- — create one at console.anthropic.com → API Keys and paste the whole thing.`)
  process.exit(1)
}

// $ per million tokens, in / out. Update when the price sheet does.
const PRICES = [
  [/opus-5/, 5, 25], [/opus-4/, 5, 25], [/sonnet-5/, 2, 10], [/sonnet-4-6/, 3, 15], [/sonnet-4-5/, 3, 15], [/haiku-4-5/, 1, 5],
]
const cost = (model, u) => {
  const [, pin, pout] = PRICES.find(([re]) => re.test(model)) || [null, 5, 25]
  return ((u?.input_tokens || 0) * pin + (u?.output_tokens || 0) * pout) / 1e6
}

// ── data (read-only) ─────────────────────────────────────────────────
async function rows(table, query) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const r = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, {
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, Range: `${from}-${from + 999}` },
    })
    if (!r.ok) throw new Error(`${table}: ${r.status} ${await r.text()}`)
    const page = await r.json()
    out.push(...page)
    if (page.length < 1000) break
  }
  return out
}
const sel = (s) => `select=${encodeURIComponent(s)}`
const co = `company_id=eq.${COMPANY_ID}`

async function loadCompanyData() {
  const [companies, invoices, payments, expenses, plaidRaw, jobs, customers, employees, timeLogs, payrollRuns, connectedAccounts, expenseCategories] = await Promise.all([
    rows('companies', `id=eq.${COMPANY_ID}&${sel('*')}`),
    rows('invoices', `${co}&${sel(QUERIES.invoices)}`),
    rows('payments', `${co}&${sel(QUERIES.payments)}&order=date.desc`),
    rows('expenses', `${co}&${sel(QUERIES.expenses)}`),
    rows('plaid_transactions', `${co}&${sel('*, account:connected_accounts(id, account_name, mask, institution_name)')}&order=date.desc`),
    rows('jobs', `${co}&${sel(QUERIES.jobs)}`),
    rows('customers', `${co}&${sel(QUERIES.customers)}`),
    rows('employees', `${co}&${sel(QUERIES.employees)}`),
    rows('time_logs', `${co}&${sel(QUERIES.timeLogs)}`).catch(() => rows('time_clock', `${co}&${sel('*')}`)).catch(() => []),
    ROLE === 'admin' ? rows('payroll_runs', `${co}&${sel('pay_date, period_end, status, total_gross, employee_count')}&order=pay_date.desc&limit=120`) : Promise.resolve(null),
    rows('connected_accounts', `${co}&${sel('*')}`),
    rows('expense_categories', `${co}&${sel('name, type')}&order=sort_order`),
  ])
  const { rows: plaidTransactions } = dedupeStripePayouts(plaidRaw)
  return { company: companies[0], invoices, payments, expenses, plaidTransactions, jobs, customers, employees, timeLogs, payrollRuns, connectedAccounts, expenseCategories }
}

// ── the model ────────────────────────────────────────────────────────
async function ask(model, system, messages, max_tokens = 4096) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens, system, messages }),
  })
  const data = await r.json()
  if (!r.ok) throw new Error(`${model}: ${r.status} ${JSON.stringify(data).slice(0, 300)}`)
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n')
  return { text, usage: data.usage, stop: data.stop_reason }
}

// ── grading ──────────────────────────────────────────────────────────
// The deterministic checks live in frankie-eval/checks.mjs, shared with the
// grader for answers captured from the running app.
const { deterministicChecks, head } = await import(pathToFileURL(path.join(here, 'frankie-eval', 'checks.mjs')).href)

const JUDGE_PROMPT = `You are grading an AI CFO's answer for a small contracting company. You are given the DATA CONTEXT the CFO was allowed to use, the QUESTION, and the ANSWER.

Score 1–5 on each:
- accuracy: every number in the answer is traceable to the data context or is a clearly labelled estimate derived from it; nothing invented. 5 = all traceable; 1 = made-up figures.
- decisiveness: leads with the answer, commits to a number or a call, names at most one caveat. 5 = a CFO; 1 = a list of what it does not have.
- usefulness: the owner could act on this today. 5 = clear next step with the reasoning; 1 = generic advice.

Reply with JSON only: {"accuracy": n, "decisiveness": n, "usefulness": n, "worst_problem": "one sentence, or 'none'"}`

async function judge(system, question, answer) {
  const msg = `DATA CONTEXT (what the CFO could see):\n<<<\n${system}\n>>>\n\nQUESTION:\n${question}\n\nANSWER:\n${answer}`
  const { text, usage } = await ask(JUDGE, JUDGE_PROMPT, [{ role: 'user', content: msg }], 400)
  let scores = null
  try { scores = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || 'null') } catch { /* leave null */ }
  return { scores, usage }
}

// ── run ──────────────────────────────────────────────────────────────
const questions = JSON.parse(fs.readFileSync(path.join(here, 'frankie-eval', 'questions.json'), 'utf8'))
  .filter(q => !ONLY || ONLY.includes(String(q.id)))

const data = await loadCompanyData()
const user = { email: `eval@${(data.company?.company_name || 'company').toLowerCase().replace(/\W+/g, '')}.local` }
const system = fullSystemPrompt({ user, company: data.company, role: ROLE, data })
const sysTokens = Math.round(system.length / 4)

const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16)
const runDir = path.join(here, 'frankie-eval', 'runs')
fs.mkdirSync(runDir, { recursive: true })

console.error(`company ${COMPANY_ID} (${data.company?.company_name}) · ${questions.length} questions · model ${MODEL} · judge ${JUDGE}`)
console.error(`system prompt ≈ ${sysTokens.toLocaleString()} tokens (persona + data context)`)

if (DRY) {
  const est = questions.length * (cost(MODEL, { input_tokens: sysTokens + 60, output_tokens: 700 }) + cost(JUDGE, { input_tokens: sysTokens + 900, output_tokens: 120 }))
  fs.writeFileSync(path.join(runDir, `${stamp}-dry-system-prompt.md`), system)
  console.error(`dry run: no model calls. Estimated cost for a full run: $${est.toFixed(2)}. System prompt saved to runs/${stamp}-dry-system-prompt.md`)
  process.exit(0)
}

const results = []
let spent = 0
const partial = path.join(runDir, `${stamp}-${MODEL}.partial.json`)
for (const q of questions) {
  process.stderr.write(`#${q.id} ${head(q.q, 60)}… `)
  const t0 = Date.now()
  let text, usage
  try {
    ({ text, usage } = await ask(MODEL, system, [{ role: 'user', content: q.q }]))
  } catch (e) {
    console.error(`\nstopped at #${q.id}: ${e.message}`)
    if (results.length) console.error(`${results.length} finished answer(s) kept in ${path.relative(root, partial)}`)
    process.exit(1)
  }
  spent += cost(MODEL, usage)
  const checks = deterministicChecks(text, q.tags)
  // A judge failure (model not enabled on this key, a 529, unparseable
  // JSON) costs that question its scores, not the whole run its answers.
  let j = { scores: null, usage: null, error: null }
  try { j = await judge(system, q.q, text) } catch (e) { j.error = e.message }
  spent += cost(JUDGE, j.usage)
  const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k)
  results.push({ ...q, answer: text, checks, failed, judge: j.scores, judgeError: j.error, ms: Date.now() - t0 })
  // Every answer is real money; keep what is finished so far.
  fs.writeFileSync(partial, JSON.stringify({ model: MODEL, judge: JUDGE, company: COMPANY_ID, cost: spent, results }, null, 2))
  const s = j.scores ? `A${j.scores.accuracy} D${j.scores.decisiveness} U${j.scores.usefulness}` : `judge? ${j.error ? head(j.error, 80) : 'no scores'}`
  process.stderr.write(`${failed.length ? 'FAIL ' + failed.join(',') : 'ok'} · ${s}\n`)
}
fs.rmSync(partial, { force: true })

// ── report ───────────────────────────────────────────────────────────
const avg = (k) => { const v = results.map(r => r.judge?.[k]).filter(Number.isFinite); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(2) : '—' }
const passRate = (results.filter(r => r.failed.length === 0).length / results.length * 100).toFixed(0)

let md = `# Frankie eval — ${stamp}\n\n`
md += `- Company: ${COMPANY_ID} (${data.company?.company_name}) · role ${ROLE}\n- Model: ${MODEL} · judge: ${JUDGE}\n- System prompt ≈ ${sysTokens.toLocaleString()} tokens\n- Cost: $${spent.toFixed(2)}\n\n`
md += `## Summary\n\n| | |\n|---|---|\n| Questions passing every deterministic check | ${passRate}% (${results.filter(r => !r.failed.length).length}/${results.length}) |\n| Judge accuracy (1–5) | ${avg('accuracy')} |\n| Judge decisiveness (1–5) | ${avg('decisiveness')} |\n| Judge usefulness (1–5) | ${avg('usefulness')} |\n\n`
md += `## Per question\n\n| # | Question | Checks failed | Acc | Dec | Use | Worst problem |\n|---|---|---|---|---|---|---|\n`
for (const r of results) md += `| ${r.id} | ${head(r.q, 70)} | ${r.failed.join(', ') || '—'} | ${r.judge?.accuracy ?? '?'} | ${r.judge?.decisiveness ?? '?'} | ${r.judge?.usefulness ?? '?'} | ${(r.judge?.worst_problem || '').replace(/\|/g, '/')} |\n`
md += `\n## Answers\n\n`
for (const r of results) md += `### #${r.id} — ${r.q}\n\n${r.answer}\n\n---\n\n`

fs.writeFileSync(path.join(runDir, `${stamp}-${MODEL}.md`), md)
fs.writeFileSync(path.join(runDir, `${stamp}-${MODEL}.json`), JSON.stringify({ model: MODEL, judge: JUDGE, company: COMPANY_ID, cost: spent, results }, null, 2))
console.error(`\n${passRate}% pass deterministic checks · accuracy ${avg('accuracy')} · decisiveness ${avg('decisiveness')} · usefulness ${avg('usefulness')} · $${spent.toFixed(2)}`)
console.error(`report: scripts/frankie-eval/runs/${stamp}-${MODEL}.md`)
