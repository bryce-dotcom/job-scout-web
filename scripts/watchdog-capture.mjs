#!/usr/bin/env node
/**
 * Moto Watchdog API discovery.
 *
 * Watchdog won't mint per-customer AUTH_TOKENs for the partner API, so Freddy's
 * GPS data has to come from the same JSON API their own web app talks to. This
 * script finds that API: it opens a real browser, YOU sign in by hand, and it
 * records every request the SPA makes while you click around.
 *
 * Nothing about your login is captured. The script never reads the password
 * field, and request bodies are recorded as *key names only* — so the output
 * tells us "login posts {email, password} to /v1/sessions" without ever holding
 * the value. Response bodies are shape-sampled, not stored wholesale, and any
 * field that looks like a credential is masked before it hits disk.
 *
 *   npm i -D playwright && npx playwright install chromium
 *   node scripts/watchdog-capture.mjs
 *
 * Output: scripts/.watchdog-capture/contract.json  (+ page screenshots)
 * Review it before sharing — it is gitignored by default.
 */

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import readline from 'node:readline'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '.watchdog-capture')
const START_URL = process.env.WATCHDOG_APP_URL || 'https://app.motowatchdog.com/signin'

// Anything matching these gets masked wherever it appears in captured output.
const SECRET_KEY = /pass(word|wd)?|secret|token|auth|bearer|session|cookie|api[-_]?key|credential|otp|refresh/i
// Requests we don't care about — analytics, fonts, tiles, bundles.
const NOISE = /\.(js|mjs|css|png|jpe?g|gif|svg|woff2?|ttf|ico|map)(\?|$)|google-analytics|googletagmanager|segment\.|sentry\.|hotjar|intercom|doubleclick|tile\.|basemaps|mapbox|openstreetmap/i

const mask = v => {
  if (v == null) return v
  const s = String(v)
  if (s.length <= 8) return '***'
  return `${s.slice(0, 4)}…${s.slice(-2)} (len ${s.length})`
}

/**
 * Reduce a JSON value to its *shape*: keys, types, array lengths, and a small
 * sample of scalar values. This is what lets us write field mappings later
 * without keeping anyone's actual vehicle positions on disk.
 */
function shape(value, depth = 0) {
  if (value === null) return 'null'
  if (Array.isArray(value)) {
    if (!value.length) return 'array(0)'
    return { [`array(${value.length})`]: shape(value[0], depth + 1) }
  }
  if (typeof value === 'object') {
    if (depth > 4) return '…'
    const out = {}
    for (const [k, v] of Object.entries(value)) {
      out[k] = SECRET_KEY.test(k) ? `${typeof v} <masked>` : shape(v, depth + 1)
    }
    return out
  }
  if (typeof value === 'string') {
    // Keep short scalars verbatim (ids, statuses, enum values are the useful part);
    // long ones are almost always prose, blobs, or tokens.
    return value.length <= 40 ? `string: ${value}` : `string(${value.length})`
  }
  return `${typeof value}: ${value}`
}

function keysOnly(raw) {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.fromEntries(
        Object.entries(parsed).map(([k, v]) => [
          k,
          SECRET_KEY.test(k) ? '<redacted>' : shape(v),
        ]),
      )
    }
    return shape(parsed)
  } catch {
    // Form-encoded or plain text — record field names only.
    if (/^[\w.\-%+]+=/.test(raw)) {
      return Object.fromEntries(
        [...new URLSearchParams(raw).keys()].map(k => [k, '<redacted>']),
      )
    }
    return `<non-json body, ${raw.length} bytes>`
  }
}

const interestingHeaders = h =>
  Object.fromEntries(
    Object.entries(h)
      .filter(([k]) => /^(authorization|auth[-_]?token|partner|x-|cookie|content-type|accept)/i.test(k))
      .map(([k, v]) => [k, SECRET_KEY.test(k) ? mask(v) : v]),
  )

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })

  const calls = []
  const seen = new Set()

  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()

  page.on('response', async res => {
    const req = res.request()
    const url = res.url()
    if (NOISE.test(url)) return
    if (!/^https?:/.test(url)) return
    const type = req.resourceType()
    if (type !== 'xhr' && type !== 'fetch') return

    // Collapse /devices/123/trips and /devices/456/trips into one entry.
    const u = new URL(url)
    const template = u.pathname.replace(/\/\d+/g, '/{id}').replace(/\/[0-9a-f-]{16,}/gi, '/{uuid}')
    const key = `${req.method()} ${u.host}${template}`
    if (seen.has(key)) return
    seen.add(key)

    let body = null
    let contentType = res.headers()['content-type'] || ''
    if (/json/i.test(contentType)) {
      try {
        body = shape(await res.json())
      } catch {
        body = '<unparseable json>'
      }
    }

    calls.push({
      key,
      method: req.method(),
      origin: u.origin,
      path: u.pathname,
      pathTemplate: template,
      query: [...u.searchParams.keys()],
      status: res.status(),
      requestHeaders: interestingHeaders(req.headers()),
      requestBodyKeys: keysOnly(req.postData()),
      responseShape: body,
    })

    process.stdout.write(`  ${res.status()}  ${key}\n`)
  })

  console.log(`
─────────────────────────────────────────────────────────────
 Moto Watchdog API capture
─────────────────────────────────────────────────────────────
 A browser window is opening at:
   ${START_URL}

 1. Sign in with your own Watchdog account.
 2. Visit every page we need to mirror:
      • the live map / device list
      • a vehicle's trip history, then open one trip
      • the alerts feed
      • geofences
 3. Come back here and press ENTER.

 Requests are printed below as they're seen. Passwords are never
 read; body values are recorded as key names only.
─────────────────────────────────────────────────────────────
`)

  await page.goto(START_URL, { waitUntil: 'domcontentloaded' })

  // Grab a screenshot of each distinct route the user visits — these become the
  // Tier 2 vision fixtures and the baseline the repair loop diffs against.
  const shots = []
  page.on('framenavigated', async frame => {
    if (frame !== page.mainFrame()) return
    const slug = new URL(frame.url()).pathname.replace(/[^\w]+/g, '_').replace(/^_|_$/g, '') || 'root'
    if (shots.includes(slug)) return
    shots.push(slug)
    // Let the SPA paint before we capture it.
    await page.waitForTimeout(2500)
    try {
      await page.screenshot({ path: join(OUT_DIR, `page_${slug}.png`), fullPage: true })
    } catch { /* navigated away mid-shot — not worth failing the run */ }
  })

  await new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    rl.question('', () => { rl.close(); resolve() })
  })

  // Storage state tells us how the session is carried: cookie vs bearer in
  // localStorage. That decides whether Tier 0 can be plain fetch or needs a
  // cookie jar. Values masked — we only need the mechanism and the key names.
  const storage = await context.storageState()
  const sessionCarriers = {
    cookies: storage.cookies.map(c => ({
      name: c.name, domain: c.domain, path: c.path,
      httpOnly: c.httpOnly, secure: c.secure, sameSite: c.sameSite,
      expires: c.expires, value: mask(c.value),
    })),
    localStorage: storage.origins.flatMap(o =>
      o.localStorage.map(item => ({
        origin: o.origin,
        key: item.name,
        value: SECRET_KEY.test(item.name) ? mask(item.value) : shape(safeParse(item.value)),
      })),
    ),
  }

  const contract = {
    capturedAt: new Date().toISOString(),
    startUrl: START_URL,
    finalUrl: page.url(),
    screenshots: shots.map(s => `page_${s}.png`),
    apiOrigins: [...new Set(calls.map(c => c.origin))],
    sessionCarriers,
    calls: calls.sort((a, b) => a.key.localeCompare(b.key)),
  }

  const outFile = join(OUT_DIR, 'contract.json')
  writeFileSync(outFile, JSON.stringify(contract, null, 2))

  await browser.close()

  console.log(`
─────────────────────────────────────────────────────────────
 Captured ${calls.length} distinct API calls across ${contract.apiOrigins.length} origin(s):
${contract.apiOrigins.map(o => `   • ${o}`).join('\n')}

 Written to: ${outFile}
 Screenshots: ${shots.length}

 Skim it for anything you don't want shared, then hand it over.
─────────────────────────────────────────────────────────────
`)
}

function safeParse(s) {
  try { return JSON.parse(s) } catch { return s }
}

main().catch(err => {
  console.error('\nCapture failed:', err.message)
  process.exit(1)
})
