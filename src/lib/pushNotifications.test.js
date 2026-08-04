import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  pushStatus, urlBase64ToUint8Array, subscriptionToRow,
  PUSH_UNSUPPORTED, PUSH_UNCONFIGURED, PUSH_DENIED, PUSH_GRANTED, PUSH_DEFAULT,
} from './pushNotifications'

// Push must degrade to nothing when it cannot work. A rep who never opts in
// should not be able to tell the feature exists.

beforeEach(() => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

const supportBrowser = (permission = 'default') => {
  vi.stubGlobal('navigator', { serviceWorker: {}, userAgent: 'test-agent' })
  vi.stubGlobal('window', { PushManager: function () {}, Notification: function () {} })
  vi.stubGlobal('PushManager', function () {})
  vi.stubGlobal('Notification', { permission })
}

describe('knowing when push cannot work', () => {
  it('reports unsupported without a service worker', () => {
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('window', {})
    expect(pushStatus()).toBe(PUSH_UNSUPPORTED)
  })

  it('reports unconfigured when no public key is set', () => {
    supportBrowser()
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', '')
    expect(pushStatus()).toBe(PUSH_UNCONFIGURED)
  })

  it('reports denied when the user has blocked notifications', () => {
    supportBrowser('denied')
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'k')
    expect(pushStatus()).toBe(PUSH_DENIED)
  })

  it('reports granted and default correctly', () => {
    vi.stubEnv('VITE_VAPID_PUBLIC_KEY', 'k')
    supportBrowser('granted')
    expect(pushStatus()).toBe(PUSH_GRANTED)
    supportBrowser('default')
    expect(pushStatus()).toBe(PUSH_DEFAULT)
  })
})

describe('the VAPID key conversion', () => {
  it('decodes base64url, including - and _', () => {
    // '-' and '_' are the url-safe stand-ins for '+' and '/'; getting this
    // wrong makes subscribe() throw with a very unhelpful message.
    const out = urlBase64ToUint8Array('a-b_')
    expect(out).toBeInstanceOf(Uint8Array)
    expect(out.length).toBeGreaterThan(0)
  })

  it('handles missing padding', () => {
    expect(() => urlBase64ToUint8Array('QQ')).not.toThrow()
  })
})

describe('building the stored row', () => {
  const sub = {
    toJSON: () => ({ endpoint: 'https://push.example/abc', keys: { p256dh: 'P', auth: 'A' } }),
  }

  it('captures endpoint and both keys', () => {
    const row = subscriptionToRow(sub, { companyId: 3, employeeId: 16 })
    expect(row.endpoint).toBe('https://push.example/abc')
    expect(row.p256dh).toBe('P')
    expect(row.auth).toBe('A')
    expect(row.company_id).toBe(3)
    expect(row.employee_id).toBe(16)
  })

  it('refuses to build a row with no tenant or employee', () => {
    // A subscription with no company would be un-scopeable by RLS.
    expect(subscriptionToRow(sub, { companyId: 3 })).toBeNull()
    expect(subscriptionToRow(sub, { employeeId: 16 })).toBeNull()
  })

  it('refuses a subscription missing its keys', () => {
    const broken = { toJSON: () => ({ endpoint: 'https://push.example/x', keys: {} }) }
    expect(subscriptionToRow(broken, { companyId: 3, employeeId: 16 })).toBeNull()
  })

  it('accepts a plain object as well as a PushSubscription', () => {
    const plain = { endpoint: 'https://push.example/y', keys: { p256dh: 'P', auth: 'A' } }
    expect(subscriptionToRow(plain, { companyId: 3, employeeId: 16 })?.endpoint).toBe('https://push.example/y')
  })

  it('survives junk', () => {
    expect(subscriptionToRow(null, { companyId: 3, employeeId: 16 })).toBeNull()
  })
})
