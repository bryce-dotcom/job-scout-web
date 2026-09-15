#!/usr/bin/env node
// Grade answers captured from the running app (runs/<name>.json, written by
// runs/capture.ps1 while driving the Ask Frankie page) with the same
// deterministic checks the API runner uses, and lay the answers out for a
// human read. No model calls.
//
//   node scripts/frankie-eval/grade-captured.mjs demo-run
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { deterministicChecks, head } from './checks.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const name = process.argv[2] || 'demo-run'
// One file per answer, runs/<name>/NN.json, written by runs/capture.ps1.
const dir = path.join(here, 'runs', name)
const captured = fs.readdirSync(dir).filter(f => /^\d+\.json$/.test(f)).sort()
  .map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8').replace(/^﻿/, '')))   // PowerShell writes a BOM
const questions = JSON.parse(fs.readFileSync(path.join(here, 'questions.json'), 'utf8'))
const tagsOf = new Map(questions.map(q => [q.id, q.tags]))

const rows = captured.map(r => {
  // An early capture stored [question, answer]; the answer is the last string.
  if (Array.isArray(r.answer)) r.answer = r.answer[r.answer.length - 1]
  const checks = deterministicChecks(r.answer, tagsOf.get(r.id) || [])
  const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([k]) => k)
  return { ...r, checks, failed }
})
const pass = rows.filter(r => !r.failed.length).length

let md = `# Frankie eval — captured from the app (${name})\n\n`
md += `${rows.length} answers · ${pass} pass every deterministic check (${Math.round(pass / rows.length * 100)}%)\n\n`
md += `| # | Question | Failed checks | Opens with |\n|---|---|---|---|\n`
for (const r of rows) md += `| ${r.id} | ${head(r.q, 60)} | ${r.failed.join(', ') || '—'} | ${head(r.answer, 110).replace(/\|/g, '/')} |\n`
md += `\n## Answers\n\n`
for (const r of rows) md += `### #${r.id} — ${r.q}\n\n${r.answer}\n\n---\n\n`
const out = path.join(here, 'runs', `${name}-graded.md`)
fs.writeFileSync(out, md)
console.log(md.split('\n## Answers')[0])
console.log(`full report: ${path.relative(process.cwd(), out)}`)
