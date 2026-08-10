import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import './index.css'
import App from './App.jsx'
import { reportCrash, installGlobalCrashHandlers, installBreadcrumbs } from './lib/crashReport'
import { useStore } from './lib/store'

// Initialize Sentry
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration()
    ],
    tracesSampleRate: 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0
  })
}

// Error Boundary Fallback
function ErrorFallback({ error }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="text-center p-8">
        <h1 className="text-2xl font-bold text-red-600 mb-4">Something went wrong</h1>
        <p className="text-gray-600 mb-4">{error.message}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Reload Page
        </button>
      </div>
    </div>
  )
}

// Stale-deploy self-heal: we ship several times a day, and a tab opened
// before a deploy holds an index.html whose hashed chunk URLs no longer
// exist — every lazy route / dynamic import() then rejects ("Failed to
// fetch dynamically imported module"). That's how Tracy's Generate
// Statement died silently for days (the jspdf dynamic import failed
// before any PDF code ran). Vite fires vite:preloadError for exactly
// this; reload once to pick up the fresh build (guarded against loops).
window.addEventListener('vite:preloadError', (event) => {
  const key = 'chunk_reload_at'
  const last = sessionStorage.getItem(key)
  if (!last || Date.now() - Number(last) > 30000) {
    event.preventDefault()
    sessionStorage.setItem(key, String(Date.now()))
    window.location.reload()
  }
})

// Service worker management
if ('serviceWorker' in navigator) {
  // Clean up conflicting sw-lenard.js registrations (now handled by main Vite PWA sw.js)
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(r => {
      const url = (r.active || r.installing || r.waiting)?.scriptURL || ''
      if (url.includes('sw-lenard')) {
        r.unregister()
      } else {
        r.update()
      }
    })
  })
  // Listen for new SW and reload when it takes over (guarded to prevent loops)
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    const key = 'sw_reloaded_at'
    const last = sessionStorage.getItem(key)
    if (!last || Date.now() - Number(last) > 30000) {
      sessionStorage.setItem(key, String(Date.now()))
      window.location.reload()
    }
  })
}

// Record every crash in our OWN table as well as Sentry.
//
// Sentry.init only runs when VITE_SENTRY_DSN is set, and it never has been —
// the production bundle contains no reference to sentry.io. So until that DSN
// exists, Sentry.ErrorBoundary catches crashes and reports them nowhere, which
// is why the Products page could be broken for all 189 products with specs and
// the only signal was Damien photographing his screen.
//
// onError fires for the same crashes Sentry would take. It is deliberately not
// awaited: the fallback screen must render immediately whether or not the
// report lands.
const crashContext = () => {
  try {
    const store = useStore.getState?.()
    return {
      companyId: store?.companyId ?? null,
      employeeId: store?.employees?.find?.(e => e.email && e.email === store?.user?.email)?.id ?? null,
    }
  } catch { return {} }
}

const handleCrash = (error, componentStack) => {
  try {
    reportCrash(error, { componentStack, ...crashContext() })
  } catch { /* a failed report must never replace the error screen */ }
}

// Errors that never reach the boundary — a throw inside an onClick, a rejected
// promise from a fetch. The app keeps running, the user sees a dead button,
// and previously nothing was recorded at all. Installed before render so a
// failure during startup is still caught. Works signed-out too, which is what
// makes a crash on the customer portal visible.
// Record the trail BEFORE anything else, so the crumbs leading to an early
// failure are there too.
installBreadcrumbs()
installGlobalCrashHandlers(crashContext)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={ErrorFallback} onError={handleCrash}>
      <App />
    </Sentry.ErrorBoundary>
  </StrictMode>
)
