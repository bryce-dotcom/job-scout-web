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
    const lines = src.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      // Skip comments — the rule is discussed in prose in several headers.
      const trimmed = line.trim()
      if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue
      if (rule.pattern.test(line)) {
        violations.push({ rule, file: rel, line: i + 1, text: trimmed })
      }
    }
  }
}

if (violations.length === 0) {
  console.log(`guard: ok — ${files.length} files, ${RULES.length} rule${RULES.length === 1 ? '' : 's'}, 0 violations`)
  process.exit(0)
}

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
