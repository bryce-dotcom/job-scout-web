// Web Push subscription, client side.
//
// Only ever touches the PUBLIC VAPID key (VITE_VAPID_PUBLIC_KEY). The private
// half lives in Supabase secrets and is used exclusively by the send function
// — it must never reach the browser bundle, where anything VITE_-prefixed is
// readable by every visitor.
//
// Everything degrades to a no-op: no key configured, no service worker, no
// permission, permission denied. A rep who has not opted in simply never sees
// a push, and nothing about the app changes for them.

import { supabase } from './supabase'

export const PUSH_UNSUPPORTED = 'unsupported'
export const PUSH_UNCONFIGURED = 'unconfigured'
export const PUSH_DENIED = 'denied'
export const PUSH_GRANTED = 'granted'
export const PUSH_DEFAULT = 'default'

const publicKey = () => import.meta.env?.VITE_VAPID_PUBLIC_KEY || ''

/** Where this browser stands right now — drives what the settings UI offers. */
export function pushStatus() {
  if (typeof window === 'undefined') return PUSH_UNSUPPORTED
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return PUSH_UNSUPPORTED
  }
  if (!publicKey()) return PUSH_UNCONFIGURED
  if (Notification.permission === 'denied') return PUSH_DENIED
  if (Notification.permission === 'granted') return PUSH_GRANTED
  return PUSH_DEFAULT
}

/** VAPID keys are base64url; PushManager wants a Uint8Array. */
export function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i)
  return out
}

/** Turn a PushSubscription into the row we store. */
export function subscriptionToRow(sub, { companyId, employeeId }) {
  if (!sub || !companyId || !employeeId) return null
  const json = typeof sub.toJSON === 'function' ? sub.toJSON() : sub
  const keys = json?.keys || {}
  if (!json?.endpoint || !keys.p256dh || !keys.auth) return null
  return {
    company_id: companyId,
    employee_id: employeeId,
    endpoint: json.endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent?.slice(0, 300) : null,
    updated_at: new Date().toISOString(),
  }
}

/**
 * Ask permission and register this device.
 * Returns { ok, status, reason } — never throws, because a notification
 * opt-in failing must not break whatever page offered it.
 */
export async function enablePush({ companyId, employeeId }) {
  const status = pushStatus()
  if (status === PUSH_UNSUPPORTED) return { ok: false, status, reason: 'This browser cannot receive push notifications' }
  if (status === PUSH_UNCONFIGURED) return { ok: false, status, reason: 'Push is not configured for this workspace yet' }
  if (status === PUSH_DENIED) return { ok: false, status, reason: 'Notifications are blocked in your browser settings' }
  if (!companyId || !employeeId) return { ok: false, status, reason: 'No employee record for this login' }

  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return { ok: false, status: permission, reason: 'Permission not granted' }

    const reg = await navigator.serviceWorker.ready
    // Reuse an existing subscription rather than churning the endpoint —
    // re-subscribing every load would leave dead rows behind on every device.
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey()),
      })
    }

    const row = subscriptionToRow(sub, { companyId, employeeId })
    if (!row) return { ok: false, status: PUSH_GRANTED, reason: 'Could not read the subscription' }

    // Endpoint is unique — upsert so a device that re-subscribes updates its
    // row instead of creating a duplicate that gets pushed to twice.
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(row, { onConflict: 'endpoint' })
    if (error) return { ok: false, status: PUSH_GRANTED, reason: error.message }

    return { ok: true, status: PUSH_GRANTED }
  } catch (e) {
    return { ok: false, status: pushStatus(), reason: e?.message || 'Could not enable notifications' }
  }
}

/** Stop pushing to this device. Removes the row and the browser subscription. */
export async function disablePush() {
  try {
    if (!('serviceWorker' in navigator)) return { ok: true }
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (!sub) return { ok: true }
    const endpoint = sub.endpoint
    await sub.unsubscribe()
    await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: e?.message }
  }
}
