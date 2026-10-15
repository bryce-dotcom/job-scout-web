// Circular imports, which the production bundle turns into a crash.
//
// Vite serves native ES modules in development, where a cycle usually
// resolves itself lazily and nothing looks wrong. The build hoists the same
// modules into chunks and then whichever binding is reached first can be read
// before it is initialised:
//
//   ReferenceError: Cannot access 'Ka' before initialization
//
// which is what /payroll threw five times on 2026-10-15 — on a build that was
// perfectly fine in dev. The cycle ran through Layout.jsx, which every page
// renders inside: Layout -> ArnieFloatingPanel -> ArnieChat -> Layout, for
// useTheme. Which page trips it depends on the order its lazily-loaded chunk
// pulls the cycle in, so it moves between builds and hits some pages and not
// others — the worst kind of bug to chase from a stack trace.
//
// Exits non-zero if any cycle exists. Run by npm run guard.
import fs from 'node:fs'
import path from 'node:path'

const root = process.argv[2] || 'src'
const files = []
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (/\.(jsx?|tsx?)$/.test(e.name) && !/\.test\./.test(e.name)) files.push(p)
  }
}
walk(root)

const norm = (f) => f.split(path.sep).join('/')
const resolve = (from, spec) => {
  if (!spec.startsWith('.')) return null
  const base = path.join(path.dirname(from), spec)
  for (const c of [base, base + '.js', base + '.jsx', base + '.ts', base + '.tsx',
                   path.join(base, 'index.js'), path.join(base, 'index.jsx')]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return norm(c)
  }
  return null
}

const graph = new Map()
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  const deps = new Set()
  const re = /^\s*import\s+[^'"]*from\s+['"]([^'"]+)['"]/gm
  let m
  while ((m = re.exec(src))) {
    const r = resolve(f, m[1])
    if (r) deps.add(r)
  }
  graph.set(norm(f), deps)
}

const state = new Map()
const stack = []
const cycles = []
const dfs = (n) => {
  state.set(n, 1)
  stack.push(n)
  for (const d of graph.get(n) || []) {
    if (state.get(d) === 1) {
      const i = stack.indexOf(d)
      cycles.push(stack.slice(i).concat(d))
    } else if (!state.get(d)) dfs(d)
  }
  stack.pop()
  state.set(n, 2)
}
for (const n of graph.keys()) if (!state.get(n)) dfs(n)

console.log('check-cycles: ' + graph.size + ' modules, ' + new Set(cycles.map(c => [...c].sort().join('|'))).size + ' circular chain(s)')

const seen = new Set()
for (const c of cycles) {
  const key = [...c].sort().join('|')
  if (seen.has(key)) continue
  seen.add(key)
  console.log('  ' + c.map((x) => x.replace(/^src\//, '')).join('  ->  '))
}

if (cycles.length) process.exit(1)
