#!/usr/bin/env node
// npm run guard — fails the build on patterns that have provably caused
// customer-visible bugs in this app.
//
// This is not style policing. Every rule below exists because the thing it
// catches actually shipped and someone got a wrong number. A rule only earns a
// place here if it is (a) high-confidence — near-zero false positives, so the
// guard never gets disabled out of annoyance, and (b) backed by a real
// incident.
//
// Add a rule when a bug class repeats. Delete one if it stops being real.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

const ROOT = join(import.meta.dirname, '..')
const SCAN_DIRS = ['src', 'supabase/functions']
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'build', 'coverage'])
const EXTS = /\.(js|jsx|ts|tsx)$/

const RULES = [
  {
    id: 'legacy-net-rederived',
    // Matches: disc >= gross, discountApplied >= grossAmount, pdfDiscount >= pdfGross ...
    pattern: /\b(disc|discount|discountApplied|discApplied|pdfDiscount|invoiceDiscount)\w*\s*>=\s*(gross|grossAmt|grossAmount|pdfGross|amount|invoiceAmount|invAmount)\w*/,
    // The ONE definition lives in these two files (JS for the app, TS for edge fns).
    allow: [
      join('src', 'lib', 'arHelpers.js'),
      join('supabase', 'functions', '_shared', 'money.ts'),
    ],
    why: [
      'Re-derived the legacy-net invoice rule instead of importing it.',
      '',
      '  Use:  isLegacyNetShape(gross, disc)      from src/lib/arHelpers.js',
      '        invoiceCustomerTotal(amt, disc)    from supabase/functions/_shared/money.ts',
      '',
      'It must be `>` and not `>=`. When an incentive + discount FULLY cover a',
      'project, discount === amount and the customer owes $0; `>=` reads that as a',
      'legacy invoice and bills the entire project.',
      '',
      'This rule had drifted into FOURTEEN open-coded copies — screens, the PDF, the',
      'customer portal, reports, revenue, collections, the Stripe webhook. Fixing',
      'some left the others wrong, so one invoice showed different balances on',
      'different screens. A customer-facing PDF billed $32,143.06 on an invoice',
      'owing $0 because one copy was missed.',
    ],
  },
  {
    id: 'clipped-table-grid',
    // Not a pattern match — the decision needs the track list counted.
    test: (line) => {
      const m = /gridTemplateColumns:\s*(['`])([^'`]*)\1/.exec(line)
      if (!m) return false
      // Split on whitespace outside parens so minmax(0, 1fr) stays one track.
      const tracks = m[2].trim().split(/\s+(?![^()]*\))/)
      const bareFr = tracks.some(t => /^[0-9.]*fr$/.test(t))
      const fixed = tracks.filter(t => /^[0-9.]+px$/.test(t)).length
      // The data-table shape: a flexible column beside fixed ones. Narrow
      // equal-column grids ('1fr 1fr' in a modal) cannot hide a control and
      // are deliberately not flagged — a guard that cries wolf gets disabled.
      return bareFr && tracks.length >= 4 && fixed >= 2
    },
    allow: [],
    why: [
      'A bare fr track in a data-table grid. Use minmax(0, 1fr).',
      '',
      'A bare `fr` track has a minimum of AUTO, not zero. Long content in that',
      'column refuses to shrink, the row grows wider than the page, and because',
      'html/body carry overflow-x: hidden (src/index.css) the excess is CLIPPED',
      'rather than scrolled. No scrollbar appears. The fixed columns on the right',
      'simply are not reachable.',
      '',
      'Christopher had to zoom his browser to about 25% to edit a price on an',
      'estimate — "I can\'t even see the numbers I\'m trying to change" — because',
      'the Price column sat past the clipped edge. It read as a mystery rather',
      'than a layout bug precisely because nothing visibly overflows.',
      '',
      'Only flags 4+ tracks mixing a bare fr with 2+ fixed px columns: the shape',
      'where a column can be pushed out of reach. Narrow equal-column grids are',
      'fine and are not flagged.',
    ],
  },
  {
    id: 'jsx-component-not-imported',
    // eslint's no-undef does NOT see this. Verified with a probe: a file using
    // <NotImportedAnywhere /> produces ZERO eslint findings, and the build is
    // clean too — it fails at runtime as a white screen. It nearly shipped
    // today: the Info icon was used in Books.jsx without an import and the
    // guard said ok.
    fileTest: (src, rel) => {
      if (!rel.endsWith('.jsx')) return []
      const lines = src.split(/\r?\n/)

      // Everything this file could legitimately be referring to.
      const known = new Set(['React', 'Fragment', 'Suspense', 'StrictMode', 'Profiler'])
      // import X, { A as B, C } from '...'   and   import * as NS from '...'
      // [^'"] so a side-effect import (import './index.css') cannot span forward
      // to the next `from` and swallow that import's names.
      for (const m of src.matchAll(/import\s+([^'"]*?)\s+from\s+['"][^'"]+['"]/g)) {
        for (const part of m[1].replace(/[{}]/g, ' ').split(',')) {
          const name = part.trim().split(/\s+as\s+/).pop().trim().replace(/^\*\s*/, '')
          if (name) known.add(name)
        }
      }
      // Declared in this file: function Foo, class Foo, const Foo = ...
      for (const m of src.matchAll(/(?:function|class)\s+([A-Z][A-Za-z0-9_]*)/g)) known.add(m[1])
      for (const m of src.matchAll(/(?:const|let|var)\s+([A-Z][A-Za-z0-9_]*)/g)) known.add(m[1])
      // Function parameters, including callbacks: .map((Icon, i) => <Icon/>)
      for (const m of src.matchAll(/\(([^()]*)\)\s*=>/g)) {
        for (const part of m[1].split(',')) {
          const name = part.trim().replace(/=.*$/, '').replace(/^[^A-Za-z_$]+/, '').trim()
          if (/^[A-Z][A-Za-z0-9_]*$/.test(name)) known.add(name)
        }
      }
      // Destructured or assigned anywhere: { Foo }, Foo: Bar, Foo = ...
      for (const m of src.matchAll(/([A-Z][A-Za-z0-9_]*)\s*[:=]/g)) known.add(m[1])
      for (const m of src.matchAll(/\{([^}]*)\}/g)) {
        for (const part of m[1].split(',')) {
          const name = part.split(':').pop().trim().replace(/=.*$/, '').trim()
          if (/^[A-Z][A-Za-z0-9_]*$/.test(name)) known.add(name)
        }
      }

      const out = []
      const seen = new Set()
      for (let n = 0; n < lines.length; n++) {
        const trimmed = lines[n].trim()
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue
        for (const m of lines[n].matchAll(/<([A-Z][A-Za-z0-9_]*)/g)) {
          const root = m[1]
          if (known.has(root) || seen.has(root)) continue
          seen.add(root)
          out.push({ line: n + 1, text: trimmed.slice(0, 120) })
        }
      }
      return out
    },
    allow: [],
    why: [
      'A JSX component used without importing or defining it.',
      '',
      'This compiles, builds clean, and white-screens the page at runtime with',
      '"X is not defined". eslint no-undef does NOT catch it — a probe file using',
      'an undefined component produces zero findings — so the undefined-reference',
      'check below is blind to the most common React version of exactly the bug',
      'it exists to stop.',
      '',
      'It nearly shipped on the Books transaction modal: the Info icon was used',
      'without being imported and the guard passed.',
    ],
  },

]

function walk(dir, out = []) {
  let entries
  try { entries = readdirSync(dir) } catch { return out }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue
    const full = join(dir, name)
    let st
    try { st = statSync(full) } catch { continue }
    if (st.isDirectory()) walk(full, out)
    else if (EXTS.test(name)) out.push(full)
  }
  return out
}

const files = SCAN_DIRS.flatMap(d => walk(join(ROOT, d)))
const violations = []

for (const rule of RULES) {
  const allow = new Set(rule.allow.map(a => a.split('/').join(sep)))
  for (const file of files) {
    const rel = relative(ROOT, file)
    if (allow.has(rel)) continue
    let src
    try { src = readFileSync(file, 'utf8') } catch { continue }
    // A rule may inspect the WHOLE file when a line cannot decide on its own —
    // knowing whether a component was imported means reading the imports.
    if (rule.fileTest) {
      for (const hit of rule.fileTest(src, rel) || []) {
        violations.push({ rule, file: rel, line: hit.line, text: hit.text })
      }
      continue
    }
    const lines = src.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      // Skip comments — the rule is discussed in prose in several headers.
      const trimmed = line.trim()
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue
      // A rule is either a regex or, when the decision needs more than pattern
      // matching (counting grid tracks, say), a predicate.
      if (rule.test ? rule.test(line) : rule.pattern.test(line)) {
        violations.push({ rule, file: rel, line: i + 1, text: trimmed })
      }
    }
  }
}

// ── Undefined references ────────────────────────────────────────────────
// Vite compiles a file that references a variable which does not exist; the
// page then dies at runtime with "X is not defined". The build stays green
// and the break reaches a user. This has happened repeatedly:
//   Target (whole nav crashed), handlePrint, useMemo, businessUnits, toast,
//   and customDateTo sat undefined in SalesPipeline for months, one click
//   from taking the board down.
// eslint's no-undef finds all of them in about a second, so the build now
// refuses to proceed. Scoped to ONLY this rule — the repo has unrelated
// style/hook warnings we deliberately don't block on, because a guard that
// cries wolf is a guard someone disables.
// Parsed as JSON, not a text format: --format compact was removed in ESLint 9
// and the guard silently reported "0 undefined refs" while a real one sat in
// the file. A check that can quietly pass is worse than no check, so an
// unparseable result is now treated as a failure to run, not as success.
let undefFailed = false
{
  const { execSync } = await import('node:child_process')
  let raw = ''
  try {
    // no-undef is already enabled by the project's eslint config, so no
    // --rule flag is needed (and its shell quoting breaks on Windows).
    // Other rules' findings are ignored below; only no-undef blocks.
    // Only `src`: supabase/functions is excluded by the eslint config, and
    // naming an ignored path makes eslint exit fatally (2) rather than lint.
    raw = execSync('npx eslint src --format json',
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 })
  } catch (e) {
    raw = `${e.stdout || ''}`   // eslint exits non-zero when it finds errors
  }
  let hits = null
  let hookCounts = null
  try {
    const start = raw.indexOf('[')
    if (start >= 0) {
      hits = []
      hookCounts = {}
      for (const f of JSON.parse(raw.slice(start))) {
        const rel = relative(ROOT, f.filePath).replace(/\\/g, '/')
        for (const m of f.messages || []) {
          if (m.ruleId === 'no-undef') hits.push(`${rel}:${m.line}  ${m.message}`)
          if (m.ruleId === 'react-hooks/rules-of-hooks') hookCounts[rel] = (hookCounts[rel] || 0) + 1
        }
      }
    }
  } catch { hits = null; hookCounts = null }

  // A hook called after an early return changes the hook count between renders.
  // React throws #310 and the error boundary paints a white screen over the
  // whole page. That took Books down in production, and guard + 845 tests +
  // vite build ALL passed on the broken commit — a misplaced hook is invisible
  // until it renders.
  //
  // 28 of these already exist (Payroll has 8, Inventory 3), so this cannot be
  // a hard fail without a rewrite nobody asked for. It is a ratchet instead:
  // the existing ones are recorded, and the build fails the moment a NEW one
  // appears or a recorded file grows another. Regenerate deliberately with
  // `node scripts/guard.mjs --update-hooks-baseline` after genuinely fixing
  // some — never to make a failure go away.
  if (hookCounts) {
    const { readFileSync, writeFileSync, existsSync } = await import('node:fs')
    const BASELINE = join(ROOT, 'scripts', 'hooks-baseline.json')
    if (process.argv.includes('--update-hooks-baseline')) {
      writeFileSync(BASELINE, JSON.stringify(hookCounts, null, 2) + '\n')
      console.log(`guard: hooks baseline rewritten — ${Object.values(hookCounts).reduce((a, b) => a + b, 0)} known violation(s) in ${Object.keys(hookCounts).length} file(s)`)
    } else {
      let base = {}
      if (existsSync(BASELINE)) { try { base = JSON.parse(readFileSync(BASELINE, 'utf8')) } catch { base = {} } }
      const worse = []
      for (const [file, n] of Object.entries(hookCounts)) {
        const allowed = base[file] || 0
        if (n > allowed) worse.push(`${file}  ${n} violation(s), baseline allows ${allowed}`)
      }
      if (worse.length) {
        undefFailed = true
        console.error('\nguard: FAILED — new conditional React hook(s). These build clean and white-screen the page:\n')
        worse.forEach(w => console.error('    ' + w))
        console.error('\n  A hook must not sit after an early return. Move it up with the other hooks.')
        console.error('  npx eslint <file> shows the exact line.\n')
      }
    }
  }

  if (hits === null) {
    undefFailed = true
    console.error('\nguard: FAILED — could not run the undefined-reference check (eslint output unreadable).')
    console.error('  Not treating this as a pass: a silent skip is how a runtime crash reaches production.\n')
  } else if (hits.length) {
    undefFailed = true
    console.error(`\nguard: FAILED — ${hits.length} undefined reference(s). These compile fine and crash at runtime:\n`)
    hits.forEach((h) => console.error('    ' + h))
    console.error('')
  }
}

if (violations.length === 0 && !undefFailed) {
  console.log(`guard: ok — ${files.length} files, ${RULES.length} rule${RULES.length === 1 ? '' : 's'}, 0 violations, 0 undefined refs`)
  process.exit(0)
}
if (violations.length === 0) process.exit(1)

const byRule = new Map()
for (const v of violations) {
  if (!byRule.has(v.rule.id)) byRule.set(v.rule.id, { rule: v.rule, hits: [] })
  byRule.get(v.rule.id).hits.push(v)
}

console.error(`\nguard: FAILED — ${violations.length} violation${violations.length === 1 ? '' : 's'}\n`)
for (const { rule, hits } of byRule.values()) {
  console.error(`  [${rule.id}]`)
  for (const l of rule.why) console.error(`  ${l}`)
  console.error('')
  for (const h of hits) console.error(`    ${h.file}:${h.line}\n      ${h.text}`)
  console.error('')
}
process.exit(1)
