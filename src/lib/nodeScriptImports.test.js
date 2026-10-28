import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, statSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

// Vite resolves `./jobOwnership`; bare node ESM does not. A lib module that a
// scripts/*.mjs imports must therefore spell out the extension all the way
// down its chain, or the script dies on ERR_MODULE_NOT_FOUND before running a
// line of its own.
//
// This exists because repCommissions.js had three extensionless imports, which
// killed the three tools built to answer "why did this rep earn nothing?":
// resync-rep-commissions.mjs, _audit_mypay.mjs and _ground_truth.mjs. The app
// was fine and all 5,738 tests passed — only running a script showed it, and
// it was found while checking a real report that a rep was owed commission.
//
// Scope is deliberately the commission/pay ledger chain, not all of src/lib:
// 159 extensionless imports remain elsewhere and that is the house convention.
// Widening this test would mean rewriting chains that reach Layout.jsx, which
// is its own hazard. Those scripts are reported, not quietly refactored.

const ENTRY = 'src/lib/repCommissions.js'
const relImport = /^\s*(?:import|export)[^'"]*from\s*['"](\.[^'"]+)['"]/gm
const hasExt = (s) => /\.(js|jsx|ts|tsx|mjs|cjs|json)$/.test(s)
const slash = (p) => p.split(path.sep).join('/')

function resolveFrom(fromFile, spec) {
  const dir = path.dirname(fromFile)
  for (const cand of [spec, `${spec}.js`, `${spec}.jsx`, `${spec}.ts`]) {
    const p = path.resolve(dir, cand)
    if (existsSync(p) && statSync(p).isFile()) return p
  }
  return null
}

// Every src/ module reachable from the entry, plus the offenders found.
function walkChain(entry) {
  const seen = new Set()
  const bare = []
  const walk = (f) => {
    const abs = path.resolve(f)
    if (seen.has(abs) || !existsSync(abs)) return
    seen.add(abs)
    for (const m of readFileSync(abs, 'utf8').matchAll(relImport)) {
      const spec = m[1]
      if (!hasExt(spec)) bare.push(`${slash(path.relative(process.cwd(), abs))} -> ${spec}`)
      const next = resolveFrom(abs, spec)
      if (next && slash(next).includes('/src/')) walk(next)
    }
  }
  walk(entry)
  return { files: seen.size, bare }
}

describe('the commission ledger can be loaded by a node script', () => {
  it('walks a real chain, not an empty one', () => {
    // Guards the assertion below against silently passing on zero files.
    expect(walkChain(ENTRY).files).toBeGreaterThan(1)
  })

  it('has no extensionless relative import anywhere in its chain', () => {
    const { bare } = walkChain(ENTRY)
    expect(bare, `node ESM cannot resolve:\n  ${bare.join('\n  ')}`).toEqual([])
  })

  it('names the scripts this keeps alive, so the reason survives', () => {
    // If one of these stops importing the ledger the test is still true, but
    // the comment above would be stale — so assert the link is real.
    const users = ['resync-rep-commissions.mjs', '_audit_mypay.mjs', '_ground_truth.mjs']
    for (const u of users) {
      const p = path.join('scripts', u)
      expect(existsSync(p), `${u} is gone — update this test's rationale`).toBe(true)
      expect(readFileSync(p, 'utf8')).toMatch(/repCommissions/)
    }
  })
})
