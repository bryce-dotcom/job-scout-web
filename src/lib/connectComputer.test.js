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

describe('a look at an allowed Mac app brings it forward (London, 2026-10-14)', () => {
  const agent = read('../../scripts/jobscout-agent.mjs')
  const hands = read('../../scripts/agent/hands.mjs')
  it('screenshot only — clicks and typing still refuse when it is not in front', () => {
    expect(agent).toMatch(/if \(front && !isFront\(front\) && a\.kind === 'screenshot'\) \{\n\s+const opened = await launchApp\(a\.app\)/)
    expect(agent).toMatch(/if \(front && !isFront\(front\)\) \{/)
  })
  it('the Mac\'s own apps can be opened', () => {
    for (const app of ['messages', 'calendar', 'mail', 'notes']) expect(hands).toMatch(new RegExp(`${app}: \\[null, '`))
  })
})

describe('a click lands on what was seen', () => {
  const agent = read('../../scripts/jobscout-agent.mjs')
  const hands = read('../../scripts/agent/hands.mjs')
  it('pictures are fitted to a size the model reads as-is', async () => {
    const { fitShot } = await import('../../scripts/agent/hands.mjs')
    expect(fitShot(2880, 1750)).toEqual([1280, 778])     // a Retina window
    expect(fitShot(1000, 600)).toEqual([1000, 600])      // never enlarged
    const [w, h] = fitShot(1171, 1029)
    expect(w * h).toBeLessThanOrEqual(1_100_000)
  })
  it('the Mac captures the front window by its rectangle, not a window id it cannot find', () => {
    expect(hands).toMatch(/get \{position, size\} of front window/)
    expect(hands).toMatch(/\['-x', '-R', rect\.join\(','\), '-t', 'png', path\]/)
    expect(hands).toMatch(/run\('sips', \['-z'/)
  })
  it('every click is mapped from the picture back onto the screen', () => {
    expect(agent).toMatch(/lastShot\.ox \+ Number\(x\) \* lastShot\.sx, lastShot\.oy \+ Number\(y\) \* lastShot\.sy/)
    expect(agent).toMatch(/case 'click': return await clickAt\(\.\.\.toScreen\(t\.x, t\.y\), 'left'\)/)
  })
})

describe('the Mac says which switch is off, before anyone tries', () => {
  const hands = read('../../scripts/agent/hands.mjs')
  const server = read('../../supabase/functions/arnie-computer/index.ts')
  const chat = read('../../supabase/functions/arnie-chat/index.ts')
  it('asks macOS itself, never blocking', async () => {
    expect(hands).toMatch(/\$\.AXIsProcessTrusted\(\)/)
    expect(hands).toMatch(/\$\.CGPreflightScreenCaptureAccess\(\)/)
    const { permissionNotes } = await import('../../scripts/agent/hands.mjs')
    expect(permissionNotes({ screen: false, accessibility: true })[0]).toMatch(/Screen & System Audio Recording → turn on Terminal/)
    expect(permissionNotes({ screen: true, accessibility: true })).toEqual([])
    expect(permissionNotes({ screen: null, accessibility: null })).toEqual([])   // unknown is not "off"
  })
  it('the server keeps it shape-checked, and the assistant is told', () => {
    expect(server).toMatch(/return \{ screen: tri\(p\.screen\), accessibility: tri\(p\.accessibility\) \}/)
    expect(chat).toMatch(/macOS has NOT yet allowed/)
  })
})

describe('a running agent picks up a fix by itself', () => {
  const agent = read('../../scripts/jobscout-agent.mjs')
  const cmd = read('../../scripts/agent/launch/jobscout-agent.cmd')
  const mac = read('../../scripts/agent/launch/jobscout-agent.command')
  it('only where the launcher can loop, only when idle and not recording', () => {
    expect(agent).toMatch(/process\.env\.JOBSCOUT_LAUNCHER_LOOP !== '1'/)
    expect(agent).toMatch(/if \(!rec && await newerBuildOut\(\)\) await stop\('a newer version is out — updating', 75\)/)
  })
  it('both launchers loop back on 75', () => {
    expect(cmd).toMatch(/set "JOBSCOUT_LAUNCHER_LOOP=1"/)
    expect(cmd).toMatch(/if errorlevel 75 if not errorlevel 76 \(/)
    expect(cmd).toMatch(/:fetch/)
    expect(mac).toMatch(/export JOBSCOUT_LAUNCHER_LOOP=1/)
    expect(mac).toMatch(/if \[ "\$CODE" -eq 75 \]; then/)
  })
})

describe('no coworker SSN, bank or home address kept on a device', () => {
  const store = read('../lib/store.js')
  it('the startup employee list drops identity fields from every row but your own, before keeping or caching it', () => {
    expect(store).toMatch(/const IDENTITY = \['ssn_last4', 'ssn_encrypted', 'date_of_birth', 'home_address'/)
    expect(store).toMatch(/if \(!e \|\| e\.id === me\) return e/)
    expect(store).toMatch(/const cached = scrub\(await offlineDb\.getAll\('employees'\)\)/)
    expect(store).toMatch(/await offlineDb\.putAll\('employees', clean\)/)
  })
})

describe('small things from London\'s evening', () => {
  const panel = read('../pages/agents/arnie/MachinePanel.jsx')
  const send = read('../../supabase/functions/_shared/arnieSend.ts')
  const chat = read('../../supabase/functions/arnie-chat/index.ts')
  it('an old launcher is asked for one re-download', () => {
    expect(panel).toMatch(/session\?\.capabilities\?\.self_update === false/)
  })
  it('emails go out in the person\'s own assistant\'s name', () => {
    expect(send).toMatch(/from: `\$\{fromName\} <arnie@appsannex\.com>`/)
    expect(send).toMatch(/`Put \$\{firstName\(who\)\} on it`/)
    expect(send).not.toMatch(/'Ask Arnie'/)
  })
  it('a website is never the app', () => {
    expect(chat).toMatch(/A WEBSITE is never the app/)
  })
})
