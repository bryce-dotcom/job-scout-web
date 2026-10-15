import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')

// A tiny sessionStorage for node.
const store = new Map()
globalThis.sessionStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) }
const { rememberAfterLogin, takeAfterLogin, forgetAfterLogin } = await import('./afterLogin.js')

describe('signing in takes you back to where you were going', () => {
  beforeEach(() => store.clear())
  it('the Connect page survives a sign-in (London, 2026-10-14)', () => {
    rememberAfterLogin('/connect?code=AB12CD')
    expect(takeAfterLogin()).toBe('/connect?code=AB12CD')
    expect(takeAfterLogin()).toBeNull()   // once
  })
  it('never anywhere off the app', () => {
    for (const p of ['https://evil.example', '//evil.example', 'javascript:alert(1)', '/', '/login']) {
      rememberAfterLogin(p)
      expect(takeAfterLogin(), p).toBeNull()
    }
  })
  it('the demo forgets it', () => {
    rememberAfterLogin('/connect?code=X')
    forgetAfterLogin()
    expect(takeAfterLogin()).toBeNull()
  })
  it('wired: ProtectedRoute remembers, Login and the OAuth callback return there, the demo does not', () => {
    expect(read('../App.jsx')).toMatch(/rememberAfterLogin\(location\.pathname \+ location\.search\)/)
    const login = read('../pages/Login.jsx')
    expect(login).toMatch(/takeAfterLogin\(\) \|\| '\/'/)
    expect(login).toMatch(/forgetAfterLogin\(\)\n\s+navigate\('\/'\)/)
    expect(read('../pages/AuthCallback.jsx')).toMatch(/takeAfterLogin\(\) \|\| '\/'/)
  })
})

describe('a real computer never pairs to the public demo', () => {
  const page = read('../pages/ConnectComputer.jsx')
  const server = read('../../supabase/functions/arnie-computer/index.ts')
  const agent = read('../../scripts/jobscout-agent.mjs')
  it('the page says whose account, and will not connect the demo', () => {
    expect(page).toMatch(/Connecting to/)
    expect(page).toMatch(/disabled=\{busy \|\| isDemo\}/)
    expect(page).toMatch(/rememberAfterLogin\(`\/connect\?code=\$\{encodeURIComponent\(code\)\}`\)/)
  })
  it('the server refuses pairing and sessions for it, and says repair', () => {
    expect(server).toMatch(/=== 'demo@jobscout\.app' && \['hello', 'pair_claim'\]\.includes\(action\)/)
    expect(server).toMatch(/repair: true \}, 403\)/)
    // After the body is read — `action` must exist when it runs.
    expect(server.indexOf("const action = String(body.action || '')")).toBeLessThan(server.indexOf("['hello', 'pair_claim'].includes(action)"))
  })
  it('the agent throws that sign-in away and pairs afresh', () => {
    expect(agent).toMatch(/if \(!hello\.ok && hello\.repair\) \{/)
    expect(agent).toMatch(/rmSync\(TOKEN_FILE, \{ force: true \}\)[\s\S]{0,80}TOKEN = await pair\(\)/)
  })
  it('a Mac names itself', () => {
    expect(agent).toMatch(/hostname\(\)\.replace\(\/\\\.local\$\/i, ''\)/)
  })
})
