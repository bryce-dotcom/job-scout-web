import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

// Every path that bills a job must pass `summaryFor`, or a job priced by hand
// invoices with no lines at all.
//
// jobs.job_total_source 'manual' means a person set the price and there are no
// job_lines behind it. That is not an edge case here: in a 1,000-job sample of
// HHH's priced jobs, 842 were manual with zero lines. writeInvoiceLines already
// handles it — `summaryFor` makes it write one line for the job's total — but
// the flag only works if the caller passes it, and two of the five callers did
// not: Invoices.jsx and PMJobSetter.jsx. Through either, the invoice carried the
// right amount with an empty line table.
//
// Doug reported it from the job board on 2026-10-29: "This Job shows $625 but
// when you go into the job the price is not on the job and is not getting
// carried through to invoicing."
//
// This reads the page sources rather than calling them, because these two live
// inside large submit handlers that need a Supabase client, a form and a store.
// The same approach guards JobDetail's selects and the utility-scope rules.

const SRC = 'src'
const CALLEE = 'writeInvoiceLines('

function sourceFiles(dir) {
  const out = []
  const walk = (d) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name)
      if (entry.isDirectory()) { walk(p); continue }
      if (!/\.(jsx?|ts|tsx)$/.test(entry.name)) continue
      if (/\.test\.[jt]sx?$/.test(entry.name)) continue
      out.push(p)
    }
  }
  walk(dir)
  return out
}

// Each call, sliced from the callee to its matching close paren, so a
// `summaryFor` belonging to a different call cannot satisfy this.
function callsIn(text) {
  const calls = []
  let i = 0
  while ((i = text.indexOf(CALLEE, i)) !== -1) {
    const open = i + CALLEE.length - 1
    let depth = 0
    let j = open
    for (; j < text.length; j++) {
      if (text[j] === '(') depth++
      else if (text[j] === ')') { depth--; if (depth === 0) break }
    }
    calls.push(text.slice(i, j + 1))
    i = j + 1
  }
  return calls
}

describe('every billing path tells writeInvoiceLines the job total', () => {
  const files = sourceFiles(SRC).filter(f => readFileSync(f, 'utf8').includes(CALLEE))

  it('finds the callers, so this cannot pass by matching nothing', () => {
    expect(files.length).toBeGreaterThanOrEqual(3)
    const names = files.map(f => path.basename(f)).sort()
    // If a caller is renamed or removed, fail loudly rather than quietly
    // shrinking the set this test protects.
    expect(names).toContain('Invoices.jsx')
    expect(names).toContain('PMJobSetter.jsx')
    expect(names).toContain('JobDetail.jsx')
    expect(names).toContain('FieldScout.jsx')
  })

  it('passes summaryFor at every call site', () => {
    const missing = []
    for (const f of files) {
      const text = readFileSync(f, 'utf8')
      callsIn(text).forEach((call, idx) => {
        if (!call.includes('summaryFor')) {
          const line = text.slice(0, text.indexOf(call)).split('\n').length
          missing.push(`${f.split(path.sep).join('/')}:${line} (call ${idx + 1})`)
        }
      })
    }
    expect(
      missing,
      `a job priced by hand would invoice with no lines from:\n  ${missing.join('\n  ')}`,
    ).toEqual([])
  })

  it('reads job_total_source for the manual flag, not a guess at it', () => {
    // `manual` drives the partial-coverage branch: lines that cover less than
    // a hand-set price get a scope line for the remainder. Deriving it from
    // "are there lines" would silently skip that.
    for (const f of files) {
      const text = readFileSync(f, 'utf8')
      for (const call of callsIn(text)) {
        if (!/\bmanual\s*:/.test(call)) continue
        expect(call, `${f}: manual should come from job_total_source`).toMatch(/job_total_source/)
      }
    }
  })
})
