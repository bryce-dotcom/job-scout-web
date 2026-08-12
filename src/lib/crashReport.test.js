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
