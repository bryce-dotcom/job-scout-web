/* Web Push handlers, pulled into the generated service worker via
 * workbox.importScripts in vite.config.js.
 *
 * Deliberately a separate file rather than switching the PWA to
 * injectManifest: that would mean hand-owning the whole service worker and
 * the offline/precache behaviour the field app depends on. importScripts adds
 * push handling without touching any of that.
 */

self.addEventListener('push', (event) => {
  let payload = {}
  try {
    payload = event.data ? event.data.json() : {}
  } catch {
    // A malformed push must not kill the handler — show something useful.
    payload = { title: 'JobScout', body: event.data ? event.data.text() : '' }
  }

  const title = payload.title || 'JobScout'
  const options = {
    body: payload.body || '',
    icon: '/favicon.png',
    badge: '/favicon.png',
    // Same tag replaces an unread digest instead of stacking three days of
    // them in the tray.
    tag: payload.tag || 'jobscout-followups',
    renotify: true,
    data: { url: payload.url || '/pipeline' },
    requireInteraction: false,
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url) || '/pipeline'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus an existing tab if the app is already open rather than opening
      // a second copy — a rep on their phone should land back in the app they
      // already have.
      for (const client of clients) {
        if ('focus' in client) {
          client.navigate(target)
          return client.focus()
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target)
      return undefined
    }),
  )
})
