// What build am I actually running, and give me the new one.
//
// WHY THIS EXISTS. London could not find the Computer tab and Bryce could not
// find the persona picker, days after both shipped and were verified live.
// Working out why took a dozen checks — the deploy was current, the server's
// cache headers were right, the agent's company had Arnie, nothing had
// crashed — because NOBODY COULD SEE WHAT BUILD THEY WERE ON. Not them, not
// me. Every answer was a guess, and "we hard refreshed and still nothing" is
// not something a person should have to say twice.
//
// A service worker serves the last build it cached. On iOS, an installed app
// has no address bar and no reload; a "hard refresh" is not a thing a person
// can do. The automatic check (lib/appUpdate) handles this when it runs — but
// when it does not, the only escape hatch was reinstalling the app.
//
// So: the build is on screen, and there is a button. It says Up to date when
// it is, which is itself the answer to "is it me or is it broken".

import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Check } from 'lucide-react'

const RUNNING = import.meta.env.VITE_APP_BUILD || ''

export default function BuildTag({ theme }) {
  const [served, setServed] = useState(null)
  const [busy, setBusy] = useState(false)

  const look = useCallback(async () => {
    try {
      const r = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
      const j = r.ok ? await r.json() : null
      setServed(j?.build || null)
    } catch { /* offline: say nothing rather than guess */ }
  }, [])

  useEffect(() => { look() }, [look])

  const behind = !!served && !!RUNNING && served !== RUNNING

  // Everything a stuck client can do, in order of politeness. The service
  // worker is unregistered because it is the thing holding the old build —
  // leaving it in place is how somebody "updates" three times and still sees
  // the same screen.
  const update = async () => {
    setBusy(true)
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations().catch(() => [])
        await Promise.all(regs.map((r) => r.unregister().catch(() => false)))
      }
      if (typeof caches !== 'undefined') {
        const keys = await caches.keys().catch(() => [])
        await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)))
      }
    } finally {
      // Cache-busted so no layer in between can answer from memory.
      window.location.replace(`${window.location.pathname}?u=${Date.now()}`)
    }
  }

  const muted = theme?.textMuted || '#7d8a7f'
  const line = theme?.border || '#d6cdb8'

  return (
    <div style={{ padding: '10px 4px 2px', borderTop: `1px solid ${line}`, marginTop: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: muted, fontVariantNumeric: 'tabular-nums' }}>
          Version {RUNNING ? RUNNING.slice(0, 7) : 'unknown'}
        </span>
        {behind ? (
          <button
            onClick={update}
            disabled={busy}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 5, cursor: 'pointer',
              background: '#5a6349', color: '#fff', border: 'none', borderRadius: 7,
              padding: '5px 9px', fontSize: 11.5, fontWeight: 700, minHeight: 30,
            }}
          >
            <RefreshCw size={12} /> {busy ? 'Updating…' : 'Update now'}
          </button>
        ) : served ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: muted }}>
            <Check size={12} /> Up to date
          </span>
        ) : null}
      </div>
      {behind && (
        <div style={{ fontSize: 10.5, color: muted, marginTop: 4, lineHeight: 1.4 }}>
          A newer version is out. This one is {served.slice(0, 7)}.
        </div>
      )}
    </div>
  )
}
