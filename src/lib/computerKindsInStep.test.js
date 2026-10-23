// Every kind of action Arnie can ask for must be one the actions log will
// accept. navigate/show/hide were offered to him (2026-10-19) and allowed by
// the leash, but the table's check was never widened, so each one failed on
// the insert — "a database error" — and Bryce's Gmail was never opened
// (2026-10-23). This reads all three lists from source and keeps them in step.
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'

const root = new URL('../../', import.meta.url)
const read = (p) => readFileSync(new URL(p, root), 'utf8')

function tableKinds() {
  const dir = 'supabase/migrations/'
  const files = readdirSync(new URL(dir, root)).filter((f) => f.endsWith('.sql')).sort()
  let last = null
  for (const f of files) {
    const s = read(dir + f)
    const m = [...s.matchAll(/arnie_computer_actions_kind_check\s+check\s*\(\s*kind\s*=\s*any\s*\(\s*array\s*\[([^\]]+)\]/gi)].pop()
      || [...s.matchAll(/kind\s+text\s+not\s+null\s+check\s*\(\s*kind\s+in\s*\(([^)]+)\)/gi)].filter(() => /arnie_computer_actions/.test(s)).pop()
    if (m) last = m[1]
  }
  return new Set([...String(last).matchAll(/'([a-z_]+)'/g)].map((x) => x[1]))
}

describe('what Arnie can ask a computer to do, the log can record', () => {
  const allowed = tableKinds()

  it('the table accepts navigate, show and hide', () => {
    for (const k of ['navigate', 'show', 'hide']) expect(allowed.has(k)).toBe(true)
  })

  it('every kind in the use_my_computer tool is one the table accepts', () => {
    const chat = read('supabase/functions/arnie-chat/index.ts')
    const at = chat.indexOf("name: 'use_my_computer'")
    const m = chat.slice(at, at + 4000).match(/enum:\s*\[([^\]]+)\]/)
    const offered = [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1])
    expect(offered.length).toBeGreaterThan(8)
    expect(offered.filter((k) => !allowed.has(k))).toEqual([])
  })

  it('every kind a permission tier grants is one the table accepts', () => {
    const grants = read('supabase/functions/_shared/computerGrants.ts')
    const kinds = new Set()
    for (const tier of ['watch', 'click', 'full']) {
      const m = grants.match(new RegExp(`\\b${tier}:\\s*\\[([^\\]]+)\\]`))
      for (const x of m[1].matchAll(/'([a-z_]+)'/g)) kinds.add(x[1])
    }
    expect([...kinds].filter((k) => !allowed.has(k))).toEqual([])
  })
})
