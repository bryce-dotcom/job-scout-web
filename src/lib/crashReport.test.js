import { describe, it, expect, beforeEach, vi } from 'vitest'
import { crashKey, installGlobalCrashHandlers } from './crashReport'

// Four of the five open crash reports were AbortErrors — one of them from
// simply going Lead Setter -> Leads, which aborts the in-flight request. An
// abort is an AbortController working correctly. Reporting it as a crash buries
// the real ones and files feedback tickets saying the app showed someone an
// error screen, which it did not.

const listeners = {}
const captured = []

beforeEach(() => {
  for (const k of Object.keys(listeners)) delete listeners[k]
  captured.length = 0
  vi.stubGlobal('window', {
    addEventListener: (name, fn) => { listeners[name] = fn },
    location: { pathname: '/leads' },
  })
  // Stand in for the network call the reporter makes.
  vi.stubGlobal('fetch', async (...args) => { captured.push(args); return { ok: true, json: async () => ({}) } })
})

/** Fire an unhandled rejection the way the browser would. */
const reject = (reason) => {
  installGlobalCrashHandlers(() => ({ companyId: 3, employeeId: 1 }))
  listeners.unhandledrejection?.({ reason })
  return captured.length
}

const abortError = () => {
  const e = new Error('signal is aborted without reason')
  e.name = 'AbortError'
  return e
}

describe('an aborted request is not a crash', () => {
  it('ignores an AbortError by name, even with an empty message', () => {
    const e = new Error('')
    e.name = 'AbortError'
    expect(reject(e)).toBe(0)
  })

  it('ignores the wording the browsers actually produce', () => {
    expect(reject(abortError())).toBe(0)
  })

  it('ignores a bare "AbortError" string, which is how one arrived', () => {
    expect(reject('AbortError')).toBe(0)
  })

  it('ignores DOMException-style aborts carrying only a code', () => {
    expect(reject({ name: 'AbortError', code: 20, message: '' })).toBe(0)
  })
})

describe('a service worker that could not be re-fetched is not a crash', () => {
  // Six alerts from one iPhone on job-site signal: register()/update()
  // re-fetch sw.js, the fetch fails, the installed worker keeps serving the
  // app, and nobody sees anything. main.jsx catches its own registration;
  // the reporter must ignore the wording whichever path it arrives by.
  it("ignores Safari's wording", () => {
    expect(reject(new TypeError('Script https://jobscout.appsannex.com/sw.js load failed'))).toBe(0)
  })

  it("ignores Chrome's wording", () => {
    expect(reject(new TypeError("Failed to register a ServiceWorker for scope ('https://jobscout.appsannex.com/') with script ('https://jobscout.appsannex.com/sw.js'): An unknown error occurred when fetching the script."))).toBe(0)
  })

  it('still reports a script that failed for a reason worth knowing', () => {
    expect(reject(new TypeError('Script https://maps.googleapis.com/maps/api/js load failed'))).toBe(1)
  })
})

describe('real failures still get through', () => {
  it('reports a genuine bug', () => {
    // The FieldScout bonus crash — this one WAS real and must not be filtered.
    expect(reject(new TypeError("undefined is not an object (evaluating 'ut.bonusAmount.toFixed')"))).toBe(1)
  })

  it('does not swallow an error merely because it mentions aborting', () => {
    // A real bug in code that happens to talk about aborts is still a bug.
    expect(reject(new TypeError('Cannot read properties of undefined (reading abortController)'))).toBe(1)
  })
})

describe('crashKey', () => {
  it('groups the same failure on the same route', () => {
    expect(crashKey('boom', '/leads')).toBe(crashKey('boom', '/leads'))
  })

  it('separates the same failure on different routes', () => {
    expect(crashKey('boom', '/leads')).not.toBe(crashKey('boom', '/estimates'))
  })
})

describe('a dev server is not a customer', () => {
  // The only crash that ever reached 8 occurrences came from localhost:5176
  // with a dev React build in the stack — one of our own dev servers, alerted
  // on as though a rep had hit it. Noise in this table is worse than an empty
  // one: it teaches whoever reads the alert to stop reading them.
  const rejectFrom = (hostname, reason) => {
    for (const k of Object.keys(listeners)) delete listeners[k]
    captured.length = 0
    vi.stubGlobal('window', {
      addEventListener: (name, fn) => { listeners[name] = fn },
      location: { pathname: '/', hostname },
    })
    installGlobalCrashHandlers(() => ({ companyId: 3, employeeId: 1 }))
    listeners.unhandledrejection?.({ reason })
    return captured.length
  }

  // seenThisSession is module-level and intentionally persists for the life of
  // a page load, so each case needs its own message or the second one is
  // deduped away rather than gated.
  const realBug = (n) => new TypeError(`Failed to execute 'removeChild' on 'Node' #${n}`)

  it('drops a crash reported from localhost', () => {
    expect(rejectFrom('localhost', realBug(1))).toBe(0)
  })

  it('drops one from a loopback address or a .local host', () => {
    expect(rejectFrom('127.0.0.1', realBug(2))).toBe(0)
    expect(rejectFrom('macbook.local', realBug(3))).toBe(0)
  })

  it('still reports the same crash from production', () => {
    expect(rejectFrom('jobscout.appsannex.com', realBug(4))).toBe(1)
  })
})

describe('a stale-deploy self-heal is not a crash', () => {
  // Doug, 2026-09-17: an estimate's portal link opened on a build a deploy had
  // just replaced. The tab reloaded itself correctly — and still flashed the
  // error screen and filed "Cannot read properties of undefined (reading
  // 'default')" for the moment before the reload landed.
  const storage = new Map()
  beforeEach(() => {
    storage.clear()
    vi.stubGlobal('sessionStorage', {
      getItem: (k) => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => storage.set(k, String(v)),
      removeItem: (k) => storage.delete(k),
    })
  })

  it('the first stale chunk reloads the tab once, and the reload window is open', async () => {
    const { chunkReloadDecision, chunkReloadPending, CHUNK_RELOAD_KEY } = await import('./crashReport')
    expect(chunkReloadDecision(1000)).toBe('reload')
    expect(storage.get(CHUNK_RELOAD_KEY)).toBe('1000')
    expect(chunkReloadPending(1200)).toBe(true)
    expect(chunkReloadPending(1000 + 15000)).toBe(false)
  })

  it('a second failure within 30s gives up, and the window closes so the real error shows', async () => {
    const { chunkReloadDecision, chunkReloadPending } = await import('./crashReport')
    chunkReloadDecision(1000)
    expect(chunkReloadDecision(5000)).toBe('give_up')
    expect(chunkReloadPending(5100)).toBe(false)
    // Much later it is allowed to try again.
    expect(chunkReloadDecision(5000 + 31000)).toBe('reload')
    expect(chunkReloadPending(5000 + 31500)).toBe(true)
  })

  it('nothing is reported while the reload is in flight; the same error is reported once it is over', async () => {
    const { chunkReloadDecision, reportCrash } = await import('./crashReport')
    captured.length = 0
    vi.stubGlobal('window', { addEventListener: () => {}, location: { pathname: '/portal/abc', hostname: 'jobscout.appsannex.com' } })
    chunkReloadDecision(Date.now())
    await reportCrash(new TypeError("Cannot read properties of undefined (reading 'default')"), { companyId: 3 })
    expect(captured.length).toBe(0)
    storage.clear()
    await reportCrash(new TypeError("Cannot read properties of undefined (reading 'default')"), { companyId: 3 })
    expect(captured.length).toBe(1)
  })

  it('with no storage at all it still reloads once and never claims a pending reload', async () => {
    vi.stubGlobal('sessionStorage', undefined)
    const { chunkReloadDecision, chunkReloadPending } = await import('./crashReport')
    expect(chunkReloadDecision()).toBe('reload')
    expect(chunkReloadPending()).toBe(false)
  })
})
