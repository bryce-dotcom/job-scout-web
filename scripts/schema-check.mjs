#!/usr/bin/env node
// npm run schema:check — validate every column this codebase asks Supabase for
// against the columns the database ACTUALLY has.
//
// Why: JOBSCOUT_PROJECT_RULES.md says "verify column names against
// DATABASE_SCHEMA.md before writing any query. If a column is not listed in
// that file, it does not exist." Both halves of that rule failed in practice:
// people didn't check, AND the doc was stale (it omits real columns), so
// checking it could give you the wrong answer either way.
//
// A bad column name is not a small thing here. PostgREST 400s the WHOLE query,
// and the app's usual `const { data } = await ...; data || []` swallows it into
// an empty array — so the screen renders zero instead of throwing. That's how
// every commission on the Payroll page silently became $0, and how a report
// that existed to find problems confidently announced it had found none while
// 38 sat in the database.
//
// This reads the live schema and fails on any `.from('t').select('a, b')` that
// names a column table `t` doesn't have.
//
//   npm run schema:check     validate (exit 1 on drift)
//   npm run schema:dump      rewrite DATABASE_SCHEMA.md from the live database
//
// Limits, stated plainly: it only understands `.from('literal')` chained to
// `.select('literal')`. Dynamic selects (QUERIES.jobs) and computed table names
// are skipped and reported as such — it is a net, not a proof.

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { config } from 'dotenv'

const ROOT = join(import.meta.dirname, '..')
config({ path: join(ROOT, '.env') })

const DUMP = process.argv.includes('--dump')
const URL = process.env.VITE_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('schema:check — need VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env')
  process.exit(2)
}
const sb = createClient(URL, KEY, { auth: { persistSession: false } })

const SCAN_DIRS = ['src', 'supabase/functions']
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'build', 'coverage'])
const EXTS = /\.(js|jsx|ts|tsx)$/

function walk(dir, out = []) {
  let entries
  try { entries = readdirSync(dir) } catch { return out }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue
    const full = join(dir, name)
    let st; try { st = statSync(full) } catch { continue }
    if (st.isDirectory()) walk(full, out)
    else if (EXTS.test(name)) out.push(full)
  }
  return out
}

// Pull the real column list for a table by asking for one row. Cheap, needs no
// information_schema access, and reflects exactly what PostgREST will accept.
const colCache = new Map()
async function columnsOf(table) {
  if (colCache.has(table)) return colCache.get(table)
  let cols = null
  const { data, error } = await sb.from(table).select('*').limit(1)
  if (error) {
    cols = error.message.includes('does not exist') ? 'NO_TABLE' : null
  } else if (data && data.length) {
    cols = new Set(Object.keys(data[0]))
  } else {
    // Empty table — fall back to a deliberately bogus column so PostgREST
    // replies with the real column list in its error hint.
    const probe = await sb.from(table).select('__schema_check_bogus__').limit(1)
    const hint = probe.error?.message || ''
    cols = 'EMPTY'
    void hint
  }
  colCache.set(table, cols)
  return cols
}

// Parse the column names out of a PostgREST select string.
//
// The subtlety that matters: `customer:customers(business_name)` is an EMBEDDED
// RESOURCE (a join to another table), not a column on this one. Any top-level
// piece carrying a `(` is a join and belongs to a different table, so it must be
// dropped — treating those as columns is what made the first version of this
// script report 72 failures, nearly all of them wrong. A checker that cries wolf
// gets switched off, which is worse than not having it.
function parseSelect(sel) {
  // Split on commas at paren-depth 0, keeping the parens so we can spot joins.
  const pieces = []
  let depth = 0, cur = ''
  for (const ch of sel) {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    if (ch === ',' && depth === 0) { pieces.push(cur); cur = ''; continue }
    cur += ch
  }
  pieces.push(cur)

  return pieces
    .map(s => s.trim())
    .filter(Boolean)
    .filter(s => !s.includes('('))          // embedded resource -> another table's problem
    .map(s => s.split(':').pop().trim())    // alias:col -> col
    .map(s => s.split('::')[0].trim())      // col::cast -> col
    .filter(s => s && !s.includes('*') && /^[a-z_][a-z0-9_]*$/i.test(s))
}

const files = SCAN_DIRS.flatMap(d => walk(join(ROOT, d)))
// .from('table') ... .select('cols')  — allow whitespace/newlines between.
const RE = /\.from\(\s*['"]([a-z_][a-z0-9_]*)['"]\s*\)[\s\S]{0,200}?\.select\(\s*['"]([^'"]+)['"]/g

const refs = []
for (const file of files) {
  const src = readFileSync(file, 'utf8')
  let m
  while ((m = RE.exec(src)) !== null) {
    const line = src.slice(0, m.index).split('\n').length
    refs.push({ file: relative(ROOT, file), line, table: m[1], select: m[2] })
  }
}

if (DUMP) {
  const tables = [...new Set(refs.map(r => r.table))].sort()
  const lines = [
    '# Database Schema (generated)',
    '',
    '**Do not hand-edit.** Regenerate with `npm run schema:dump`.',
    '',
    'This file is written from the LIVE database. The previous hand-maintained',
    'version drifted out of date and omitted real columns, which made the rule',
    '"if a column is not listed here, it does not exist" actively misleading.',
    '',
    `Generated from ${URL}`,
    '',
  ]
  for (const t of tables) {
    const cols = await columnsOf(t)
    if (cols === 'NO_TABLE') { lines.push(`## ${t}\n\n_table not found_\n`); continue }
    if (cols === 'EMPTY' || !cols) { lines.push(`## ${t}\n\n_empty table — columns unavailable_\n`); continue }
    lines.push(`## ${t}\n`)
    lines.push([...cols].sort().map(c => `- \`${c}\``).join('\n'))
    lines.push('')
  }
  writeFileSync(join(ROOT, 'DATABASE_SCHEMA.md'), lines.join('\n'))
  console.log(`schema:dump — wrote DATABASE_SCHEMA.md for ${tables.length} tables`)
  process.exit(0)
}

const bad = []
let checked = 0, skippedEmpty = 0
const tables = [...new Set(refs.map(r => r.table))]
for (const t of tables) await columnsOf(t)

for (const r of refs) {
  const cols = await columnsOf(r.table)
  if (cols === 'NO_TABLE') { bad.push({ ...r, missing: [`(table "${r.table}" does not exist)`] }); continue }
  if (cols === 'EMPTY' || !cols) { skippedEmpty++; continue }
  const wanted = parseSelect(r.select)
  const missing = wanted.filter(c => !cols.has(c))
  checked += wanted.length
  if (missing.length) bad.push({ ...r, missing })
}

// ── Baseline ratchet ────────────────────────────────────────────────────────
// This check went in on a codebase that already had drift. Failing on all of it
// from day one would just get the check deleted, so known drift is recorded in
// schema-baseline.json and only NEW drift fails the build. The baseline is a
// debt list, not an amnesty: fix an entry, drop it from the file, and it can
// never come back. `--update-baseline` re-records (use deliberately).
//
// Keyed without line numbers so moving code around doesn't spuriously re-fail.
const BASELINE_PATH = join(import.meta.dirname, 'schema-baseline.json')
const keyOf = (b) => `${b.file.split('\\').join('/')}|${b.table}|${b.missing.join(',')}`
let baseline = new Set()
try { baseline = new Set(JSON.parse(readFileSync(BASELINE_PATH, 'utf8')).known) } catch { /* none yet */ }

if (process.argv.includes('--update-baseline')) {
  const known = bad.map(keyOf).sort()
  writeFileSync(BASELINE_PATH, JSON.stringify({
    note: 'Known column drift, recorded so schema:check can fail on NEW drift only. Fix an entry then delete it from this list — do not add to it without a reason.',
    generated_from: URL,
    known,
  }, null, 2) + '\n')
  console.log(`schema:check — baseline updated with ${known.length} known issue(s)`)
  process.exit(0)
}

const fresh = bad.filter(b => !baseline.has(keyOf(b)))
const stillKnown = bad.length - fresh.length
const fixed = [...baseline].filter(k => !bad.some(b => keyOf(b) === k))

if (!fresh.length) {
  console.log(`schema:check: ok — ${refs.length} queries, ${checked} column refs, ${tables.length} tables${skippedEmpty ? `, ${skippedEmpty} skipped (empty table)` : ''}`)
  if (stillKnown) console.log(`  ${stillKnown} known issue(s) in schema-baseline.json — pre-existing debt, not new.`)
  if (fixed.length) {
    console.log(`\n  ${fixed.length} baselined issue(s) look FIXED — remove them from scripts/schema-baseline.json:`)
    for (const f of fixed) console.log(`    ${f}`)
  }
  process.exit(0)
}

console.error(`\nschema:check: FAILED — ${fresh.length} NEW quer${fresh.length === 1 ? 'y references a' : 'ies reference'} column(s) the database does not have.\n`)
console.error('A bad column 400s the ENTIRE query. With `data || []` that becomes an')
console.error('empty result, not an error — the screen shows zero and nobody is told.')
console.error('This is how every Payroll commission silently became $0.\n')
for (const b of fresh) {
  console.error(`  ${b.file}:${b.line}  .from('${b.table}')`)
  console.error(`      missing: ${b.missing.join(', ')}`)
}
console.error(`\nRun 'npm run schema:dump' to see the real columns.`)
if (stillKnown) console.error(`(${stillKnown} other known issue(s) are baselined and not counted here.)`)
console.error('')
process.exit(1)
