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

describe('on a scaled screen the picture and the click agree (Bryce, 150%, 2026-10-15)', () => {
  const hands = read('../../scripts/agent/hands.mjs')
  it('every Windows script runs DPI-aware, so rectangle, capture and cursor are all real pixels', () => {
    expect(hands).toMatch(/SetProcessDPIAware\(\);' -ErrorAction SilentlyContinue; \[void\]\[JsDpi\.P\]::SetProcessDPIAware\(\)/)
    expect(hands).toMatch(/const ps = \(script\) => run\('powershell\.exe', \[[^\]]*withDpiAware\(script\)\]\)/)
  })
})

describe('a browser step happens in a browser window, never in the JobScout app (Bryce, 2026-10-16)', () => {
  const hands = read('../../scripts/agent/hands.mjs')
  const agent = read('../../scripts/jobscout-agent.mjs')
  const chat = read('../../supabase/functions/arnie-chat/index.ts')
  it('a browser window is told from an app window by its title', async () => {
    const { isBrowserWindowTitle } = await import('../../scripts/agent/hands.mjs')
    expect(isBrowserWindowTitle('chrome', 'Inbox (12) - bryce@hhh.services - HHH Services Mail - Google Chrome')).toBe(true)
    expect(isBrowserWindowTitle('chrome', 'Job Scout')).toBe(false)          // the installed JobScout app
    expect(isBrowserWindowTitle('edge', 'Gmail - Work - Microsoft​ Edge')).toBe(true)
    expect(isBrowserWindowTitle('excel', 'Book1 - Excel')).toBe(false)
  })
  it('before acting, the agent brings a real browser window forward — or refuses — never types into an app window', () => {
    expect(agent).toMatch(/if \(a\.app && browserKind\(a\.app\) && a\.kind !== 'launch'\) \{/)
    expect(agent).toMatch(/if \(title != null && !isBrowserWindowTitle\(a\.app, title\)\) \{\n\s+const f = await focusBrowserWindow\(a\.app\)/)
    expect(agent.indexOf('2b. A BROWSER means a browser window')).toBeLessThan(agent.indexOf('// 3. Do it, and say so.'))
    expect(hands).toMatch(/\[void\]\$w\.AppActivate\(/)
    expect(hands).toMatch(/'start', '', kind\.exe, '--new-window'/)
  })
  it('Jenny is told a step the picture does not show did not happen', () => {
    expect(chat).toMatch(/never say something is "loading", "opening" or "in the background" unless this picture shows it/)
  })
})

describe('the computer gets its OWN sign-in, never the browser\'s (Bryce, died at 59 min twice, 2026-10-15)', () => {
  const server = read('../../supabase/functions/arnie-computer/index.ts')
  const page = read('../pages/ConnectComputer.jsx')
  const claim = server.slice(server.indexOf("if (action === 'pair_claim') {"), server.indexOf("if (action === 'observe')"))
  it('pair_claim mints a session for the caller and ignores any token the browser sends', () => {
    expect(claim).toMatch(/const minted = await mintSessionFor\(String\(caller\.email \|\| ''\)\)/)
    expect(claim).toMatch(/const refresh = minted\.refresh/)
    expect(claim).not.toMatch(/body\.refresh_token/)
  })
  it('the mint is one-time link → redeemed server-side as `email`, and must come back for the same person', () => {
    expect(server).toMatch(/auth\/v1\/admin\/generate_link[\s\S]{0,200}type: 'magiclink', email/)
    expect(server).toMatch(/JSON\.stringify\(\{ type: 'email', token_hash: hashed \}\)/)
    expect(server).toMatch(/String\(vj\?\.user\?\.email \|\| ''\)\.toLowerCase\(\) !== email\.toLowerCase\(\)/)
  })
  it('the Connect page no longer sends the browser\'s refresh token at all', () => {
    expect(page).toMatch(/body: \{ action: 'pair_claim', code \}/)
    expect(page).not.toMatch(/refresh_token: refresh/)
  })
})

describe('the agent keeps its connection through a blip (Bryce, 2026-10-15)', () => {
  const agent = read('../../scripts/jobscout-agent.mjs')
  const fa = agent.slice(agent.indexOf('const freshAccess = async'), agent.indexOf('const call = async'))
  it('keeps the ROTATED refresh token, in memory and on disk', () => {
    expect(fa).toMatch(/if \(j\.access_token && j\.refresh_token && j\.refresh_token !== TOKEN\) \{\n\s+TOKEN = j\.refresh_token\n\s+saveToken\(TOKEN\)/)
  })
  it('a network failure or a bad answer is retried — never "connect again", never deletes the token', () => {
    expect(fa).toMatch(/\} catch \(e\) \{\n\s+throw new Error\(`could not reach JobScout to sign in/)
    expect(fa).toMatch(/if \(!j\.access_token && !refused\) \{\n\s+throw new Error/)
    // the token is deleted ONLY after the refusal test
    expect(fa.indexOf('rmSync(TOKEN_FILE')).toBeGreaterThan(fa.indexOf('const refused ='))
    expect(fa).toMatch(/const refused = \(res\.status === 400 \|\| res\.status === 401\)/)
  })
  it('saying hello waits out a blip; reports retry so an action can never run twice', () => {
    expect(agent.match(/await helloOnce\(\)/g).length).toBe(3)
    expect(agent.match(/await call\('hello', handshake\)/g).length).toBe(1)   // only inside helloOnce
    expect(agent).toMatch(/async function helloOnce\(\) \{\n\s+for \(let i = 0; ; i\+\+\) \{\n\s+try \{ return await call\('hello', handshake\) \}/)
    expect(agent).not.toMatch(/await call\('report', \{/)
    expect(agent.match(/await report\(\{/g).length).toBe(5)   // incl. the browser-window refusal
    expect(agent).not.toMatch(/await call\('report', \{/)
    expect(agent).toMatch(/if \(r\.ok \|\| r\.status === 409\) return r/)
  })
  it('an upload that cannot sign in fails soft', () => {
    for (const fn of ['uploadActionShot', 'uploadShot']) {
      const body = agent.slice(agent.indexOf(`const ${fn} = async`), agent.indexOf(`const ${fn} = async`) + 300)
      expect(body.indexOf('try {')).toBeLessThan(body.indexOf('await freshAccess()'))
    }
  })
  it('anything unforeseen restarts through the launcher, after a pause, instead of a window that looks alive', () => {
    expect(agent).toMatch(/process\.on\('uncaughtException', crashed\)/)
    expect(agent).toMatch(/process\.on\('unhandledRejection', crashed\)/)
    expect(agent).toMatch(/setTimeout\(\(\) => process\.exit\(process\.env\.JOBSCOUT_LAUNCHER_LOOP === '1' \? 75 : 1\), 15_000\)/)
  })
})

describe('typed text reaches the agent — once — and never the audit log (Bryce, 2026-10-15)', () => {
  const server = read('../../supabase/functions/arnie-computer/index.ts')
  const hands = read('../../scripts/agent/hands.mjs')
  const sql = read('../../supabase/migrations/20261015200000_arnie_computer_pending_text.sql')
  it('the log still keeps only the length', () => {
    expect(server).toMatch(/\{ \.\.\.want\.target, value: undefined, text_length: opts\.valueLength \}/)
  })
  it('the text is held apart when asked for, and survives an offer being accepted', () => {
    expect(server).toMatch(/value: typeof body\.value === 'string' \? body\.value : undefined,/)
    expect(server).toMatch(/want\.kind === 'type' && typeof opts\.value === 'string'[\s\S]{0,200}\['queued', 'needs_grant', 'needs_approval'\]\.includes\(row\.decision\)/)
    expect(server).toMatch(/value: held\?\.value, valueLength: held\?\.value\?\.length/)
  })
  it('handed to the agent with the action and deleted in the same breath; a failure never breaks the poll', () => {
    const next = server.slice(server.indexOf("if (action === 'next') {"), server.indexOf("if (action === 'report') {"))
    expect(next).toMatch(/next\.target = \{ \.\.\.\(next\.target \|\| \{\}\), value: held\.value \}\n\s+await rest\(`arnie_computer_pending_text\?action_id=eq\.\$\{next\.id\}`, \{ method: 'DELETE' \}\)/)
    expect(next).toMatch(/try \{[\s\S]{0,400}\} catch \(e\)/)
    expect(next).toMatch(/created_at=lt\./)   // swept
  })
  it('nobody but the service role can read it', () => {
    expect(sql).toMatch(/enable row level security/)
    expect(sql).toMatch(/revoke all on public\.arnie_computer_pending_text from anon, authenticated/)
    expect(sql).not.toMatch(/create policy/i)
  })
  it('an empty type is a failure, not a silent success', () => {
    expect(hands).toMatch(/if \(!s\) return \{ error: 'there was no text to type' \}/)
  })
})

describe('a key press reaches the keyboard (Bryce, 2026-10-15)', () => {
  const agent = read('../../scripts/jobscout-agent.mjs')
  const hands = read('../../scripts/agent/hands.mjs')
  const chat = read('../../supabase/functions/arnie-chat/index.ts')
  it('the key name Arnie puts in value is moved to target.key, and not logged as typed text', () => {
    expect(chat).toMatch(/kind === 'key' && !input\?\.target\?\.key && typeof input\?\.value === 'string' \? \{ key: input\.value\.trim\(\)\.slice\(0, 24\) \}/)
    expect(chat).toMatch(/value: kind === 'key' \? undefined :/)
  })
  it('the agent reads either, so an older server cannot strand it', () => {
    expect(agent).toMatch(/case 'key': return await pressKey\(t\.key \?\? t\.value\)/)
  })
  it('ctrl+l goes to the address bar instead of typing a web address into the page', () => {
    expect(hands).toMatch(/const ADDRESS_BAR = new Set\(\['ctrl\+l', 'cmd\+l', 'address_bar', 'addressbar'\]\)/)
    expect(hands).toMatch(/SendWait\('\^l'\)/)
    expect(hands).toMatch(/keystroke "l" using command down/)
    expect(chat).toMatch(/or ctrl\+l \(puts the cursor in a browser\\'s address bar/)
  })
  it('anything else off the fixed list still never reaches a shell', async () => {
    const { pressKey } = await import('../../scripts/agent/hands.mjs')
    expect(await pressKey("'); Remove-Item C:\\ -Recurse; ('")).toMatchObject({ error: expect.stringMatching(/not a key this agent will press/) })
    expect(await pressKey(undefined)).toMatchObject({ error: expect.stringMatching(/not a key/) })
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
  it('without Accessibility, CoreGraphics finds the front window (no python3 on a stock Mac)', async () => {
    expect(hands).toMatch(/\(await frontWindowRectMac\(\)\) \|\| \(await frontWindowRectCG\(\)\)/)
    expect(hands).not.toMatch(/run\('python3'/)
    const { CG_FRONT_RECT_JXA } = await import('../../scripts/agent/hands.mjs')
    // Run the JXA against a window list shaped like CoreGraphics returns it.
    const list = [
      { kCGWindowOwnerPID: 9, kCGWindowLayer: 25, kCGWindowBounds: { X: 0, Y: 0, Width: 1440, Height: 24 } },     // menu bar
      { kCGWindowOwnerPID: 42, kCGWindowLayer: 0, kCGWindowBounds: { X: 3, Y: 3, Width: 20, Height: 20 } },       // a sliver
      { kCGWindowOwnerPID: 42, kCGWindowLayer: 0, kCGWindowBounds: { X: 120, Y: 60, Width: 900, Height: 700 } },  // Messages
      { kCGWindowOwnerPID: 7, kCGWindowLayer: 0, kCGWindowBounds: { X: 0, Y: 0, Width: 1440, Height: 900 } },     // Safari behind
    ]
    const $ = { NSWorkspace: { sharedWorkspace: { frontmostApplication: { processIdentifier: 42 } } }, CGWindowListCopyWindowInfo: (o, w) => (o === 17 && w === 0 ? list : null) }
    const ObjC = { import() {}, deepUnwrap: (x) => x, castRefToObject: (x) => x }
    expect(new Function('$', 'ObjC', `return eval(${JSON.stringify(CG_FRONT_RECT_JXA)})`)($, ObjC)).toBe('120,60,900,700')
  })
  it('a click by name alone is turned back before it reaches the computer (Christopher, 2026-10-13)', () => {
    const chat = read('../../supabase/functions/arnie-chat/index.ts')
    expect(chat).toMatch(/A click, double_click or right_click NEEDS \{ x, y \}/)
    expect(chat).not.toMatch(/\{ label \} or \{ text \} for something you can see/)
    const guard = chat.indexOf("if (['click', 'double_click', 'right_click'].includes(kind)) {")
    expect(guard).toBeGreaterThan(-1)
    // before the machine is even looked up, let alone queued
    expect(guard).toBeLessThan(chat.indexOf("arnie_computer_sessions?select=id,device_label"))
    expect(chat.slice(guard, guard + 600)).toMatch(/needs_position: true/)
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
  // The CDN served a half-hour-old release.json beside a new agent.mjs: an
  // agent could "update" itself backwards. Every fetch of these files is busted.
  it('never trusts a cached release.json or agent.mjs', () => {
    expect(agent).toMatch(/\$\{base\}\/release\.json\?t=\$\{Date\.now\(\)\}/)
    expect(cmd).toMatch(/"%BASE%\/agent\.mjs\?t=%RANDOM%%RANDOM%"/)
    expect(cmd).toMatch(/"%BASE%\/recorder\.ps1\?t=%RANDOM%%RANDOM%"/)
    expect(mac).toMatch(/"\$BASE\/agent\.mjs\?t=\$\(date \+%s\)"/)
    expect(mac).toMatch(/"\$BASE\/recorder\.jxa\.js\?t=\$\(date \+%s\)"/)
  })
})

describe('no coworker SSN, bank or home address kept on a device', () => {
  const store = read('../lib/store.js')
  it('the startup employee list drops identity fields from every row but your own, before keeping or caching it', () => {
    // The list is the shared one (lib/employeeIdentity.js; its test pins the fields).
    expect(store).toMatch(/import \{ IDENTITY_FIELDS \} from '\.\/employeeIdentity'/)
    expect(store).toMatch(/const IDENTITY = IDENTITY_FIELDS/)
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
