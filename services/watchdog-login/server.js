/**
 * Headless login service for provider mirroring.
 *
 * Supabase Edge Functions run on Deno with no Chromium, so the one part of
 * the mirror that genuinely needs a browser — signing in — lives here.
 *
 * Scope it narrowly and this stays almost free: a browser is only needed to
 * TRADE A PASSWORD FOR A SESSION. Once we have the session, every subsequent
 * data pull is a plain fetch from an edge function. Sessions last hours to
 * days, so this runs on the order of once per company per day (~20s of
 * Chromium), not once per poll.
 *
 * Two endpoints:
 *   POST /login    email+password -> session credentials + observed API calls
 *   POST /capture  session -> screenshot + trimmed DOM, for the vision tier
 *
 * Everything about HOW to log in comes from the request body, not from code
 * here — it's stored in fleet_extractor_config.login. That's what lets the
 * vision repair loop fix a broken login by writing a row, without a redeploy.
 *
 * Security notes:
 *   - Requires LOGIN_SERVICE_SECRET on every request. Deploy behind TLS only;
 *     a customer's third-party password crosses this boundary.
 *   - Passwords are never logged, never written to disk, and the browser
 *     context is destroyed at the end of every request.
 */

import express from 'express'
import { chromium } from 'playwright'

const PORT = process.env.PORT || 8080
const SECRET = process.env.LOGIN_SERVICE_SECRET || ''
const NAV_TIMEOUT = Number(process.env.NAV_TIMEOUT_MS || 45000)

if (!SECRET) {
  console.error('LOGIN_SERVICE_SECRET is required — refusing to start without it.')
  process.exit(1)
}

const app = express()
app.use(express.json({ limit: '2mb' }))

// Chromium is expensive to start (~1-2s), so keep one browser warm and give
// each request its own isolated context. Contexts are cheap and share nothing.
let browserPromise = null
function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    })
    browserPromise.catch(() => { browserPromise = null })
  }
  return browserPromise
}

const TOKENISH = /token|jwt|auth|session|bearer|credential/i

function authorize(req, res) {
  const provided = req.get('x-service-secret') || ''
  // Length-then-content compare; these are fixed-length shared secrets so a
  // constant-time compare isn't buying much, but don't leak via early return.
  if (provided.length !== SECRET.length || provided !== SECRET) {
    res.status(401).json({ ok: false, error: 'unauthorized' })
    return false
  }
  return true
}

app.get('/health', (_req, res) => res.json({ ok: true }))

/**
 * POST /login
 * body: {
 *   email, password,
 *   config: {
 *     url, emailSelector, passwordSelector, submitSelector,
 *     successUrlPattern?   regex string the URL must match once signed in
 *     successSelector?     or a selector that only exists when signed in
 *     apiHostPattern?      regex naming the API host, to pick the right calls
 *     warmupPaths?         extra routes to visit so more endpoints get observed
 *   }
 * }
 */
app.post('/login', async (req, res) => {
  if (!authorize(req, res)) return

  const { email, password, config } = req.body || {}
  if (!email || !password || !config?.url) {
    return res.status(400).json({ ok: false, error: 'email, password and config.url are required' })
  }

  const started = Date.now()
  let context
  try {
    const browser = await getBrowser()
    context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      userAgent: config.userAgent || undefined,
    })
    const page = await context.newPage()
    page.setDefaultTimeout(NAV_TIMEOUT)

    // Watch the traffic while we sign in. The first authenticated XHR tells us
    // exactly how to replay the session — which header carries it, against
    // which host — which beats guessing from cookies.
    const apiHost = config.apiHostPattern ? new RegExp(config.apiHostPattern, 'i') : null
    const observed = new Map()
    let authHeader = null
    let authHeaderName = null

    page.on('request', r => {
      const type = r.resourceType()
      if (type !== 'xhr' && type !== 'fetch') return
      let u
      try { u = new URL(r.url()) } catch { return }
      if (apiHost && !apiHost.test(u.host)) return

      const headers = r.headers()
      for (const [k, v] of Object.entries(headers)) {
        if (!v) continue
        // Skip the ordinary ones; we want the bearer/custom auth header.
        if (/^(accept|content-type|origin|referer|user-agent|sec-|accept-)/i.test(k)) continue
        if (TOKENISH.test(k) || /^bearer\s/i.test(v)) {
          if (!authHeader) { authHeaderName = k; authHeader = v }
        }
      }

      const template = u.pathname.replace(/\/\d+/g, '/{id}').replace(/\/[0-9a-f-]{16,}/gi, '/{uuid}')
      const key = `${r.method()} ${template}`
      if (!observed.has(key)) {
        observed.set(key, { method: r.method(), origin: u.origin, pathTemplate: template, query: [...u.searchParams.keys()] })
      }
    })

    await page.goto(config.url, { waitUntil: 'domcontentloaded' })

    await page.fill(config.emailSelector || 'input[type="email"]', email)
    await page.fill(config.passwordSelector || 'input[type="password"]', password)

    await Promise.all([
      page.waitForLoadState('networkidle').catch(() => {}),
      page.click(config.submitSelector || 'button[type="submit"]'),
    ])

    // Confirm we actually got in. Without this we'd happily hand back an
    // anonymous session and the failure would surface much later as empty
    // vehicle lists, which is a miserable thing to debug.
    const ok = await confirmSignedIn(page, config)
    if (!ok) {
      const problem = await readVisibleError(page)
      return res.status(422).json({
        ok: false,
        error: problem || 'sign-in did not reach an authenticated page',
        needsReauth: true,
      })
    }

    // Give the app a moment to fire its initial data calls so `observed` is
    // populated, then optionally walk extra routes to widen coverage.
    await page.waitForTimeout(2500)
    for (const path of config.warmupPaths || []) {
      try {
        await page.goto(new URL(path, config.url).toString(), { waitUntil: 'domcontentloaded' })
        await page.waitForTimeout(1500)
      } catch { /* a route that 404s shouldn't sink the whole login */ }
    }

    const state = await context.storageState()
    const tokens = {}
    for (const origin of state.origins || []) {
      for (const item of origin.localStorage || []) {
        if (TOKENISH.test(item.name)) tokens[item.name] = item.value
      }
    }

    const carrier = authHeader ? 'header' : (state.cookies?.length ? 'cookie' : null)
    if (!carrier) {
      return res.status(422).json({ ok: false, error: 'signed in but no session credential was observed' })
    }

    res.json({
      ok: true,
      carrier,
      authHeaderName,
      authHeaderValue: authHeader,
      cookies: state.cookies,
      localStorageTokens: tokens,
      apiBase: pickApiBase(observed, config),
      observedEndpoints: [...observed.values()],
      finalUrl: page.url(),
      elapsedMs: Date.now() - started,
    })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  } finally {
    // Always tear the context down — it holds the customer's live session.
    await context?.close().catch(() => {})
  }
})

/**
 * POST /capture — Tier 2 input.
 * body: { url, cookies?, authHeaderName?, authHeaderValue?, localStorageTokens?, waitMs? }
 *
 * Restores a session, loads a page, and hands back a screenshot plus a
 * stripped-down DOM. Used only when the cheap tiers break, so the vision
 * pass has something to read.
 */
app.post('/capture', async (req, res) => {
  if (!authorize(req, res)) return

  const { url, cookies, authHeaderName, authHeaderValue, localStorageTokens, waitMs } = req.body || {}
  if (!url) return res.status(400).json({ ok: false, error: 'url is required' })

  let context
  try {
    const browser = await getBrowser()
    context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    if (cookies?.length) await context.addCookies(cookies)
    if (authHeaderName && authHeaderValue) {
      await context.setExtraHTTPHeaders({ [authHeaderName]: authHeaderValue })
    }

    const page = await context.newPage()
    page.setDefaultTimeout(NAV_TIMEOUT)

    if (localStorageTokens && Object.keys(localStorageTokens).length) {
      // Seed storage on the target origin before the app boots, or the SPA
      // will bounce us to the sign-in screen before we can set anything.
      await page.addInitScript(entries => {
        for (const [k, v] of Object.entries(entries)) {
          try { window.localStorage.setItem(k, v) } catch { /* storage blocked */ }
        }
      }, localStorageTokens)
    }

    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(waitMs ?? 3000)

    const screenshot = await page.screenshot({ fullPage: true, type: 'png' })

    // Scripts and styles are pure noise for the vision pass and would eat the
    // token budget, so strip them before returning the markup.
    const html = await page.evaluate(() => {
      const clone = document.documentElement.cloneNode(true)
      clone.querySelectorAll('script,style,link,noscript,svg').forEach(n => n.remove())
      return clone.outerHTML
    })

    res.json({
      ok: true,
      url: page.url(),
      screenshotBase64: screenshot.toString('base64'),
      html: html.slice(0, 200000),
    })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  } finally {
    await context?.close().catch(() => {})
  }
})

async function confirmSignedIn(page, config) {
  if (config.successSelector) {
    return page.waitForSelector(config.successSelector, { timeout: 20000 })
      .then(() => true).catch(() => false)
  }
  if (config.successUrlPattern) {
    const re = new RegExp(config.successUrlPattern, 'i')
    return page.waitForURL(u => re.test(u.toString()), { timeout: 20000 })
      .then(() => true).catch(() => false)
  }
  // No explicit signal configured — fall back to "we left the login page",
  // which is weak but better than assuming success.
  await page.waitForTimeout(4000)
  return !page.url().includes(new URL(config.url).pathname)
}

async function readVisibleError(page) {
  return page.evaluate(() => {
    const candidates = document.querySelectorAll(
      '[role="alert"],.error,.alert,.invalid-feedback,[class*="error" i],[class*="Error"]',
    )
    for (const el of candidates) {
      const text = (el.textContent || '').trim()
      if (text && text.length < 200) return text
    }
    return null
  }).catch(() => null)
}

function pickApiBase(observed, config) {
  if (config.apiBase) return config.apiBase
  // Most-used origin among the observed calls wins.
  const counts = {}
  for (const c of observed.values()) counts[c.origin] = (counts[c.origin] || 0) + 1
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null
}

app.listen(PORT, () => console.log(`watchdog-login listening on :${PORT}`))

// Don't leave a zombie Chromium behind when the platform recycles the instance.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, async () => {
    try { (await browserPromise)?.close() } catch { /* already gone */ }
    process.exit(0)
  })
}
