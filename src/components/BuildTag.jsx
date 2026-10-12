// Which build this is — as a whisper, not a widget.
//
// The first version of this put a bordered row, a tick icon and a filled
// olive button into the menu footer, directly under Sign Out. It solved the
// problem and looked like a developer tool bolted to the side of a product:
// two controls competing in a place that should have one, and a loud button
// for a thing that is almost never actionable.
//
// The honest shape of this is one line of small print. Nearly every time
// somebody opens that menu they are up to date and there is nothing to do, so
// the up-to-date state has to cost no attention at all — the version is there
// if you go looking, the way it is in the footer of any settings screen.
//
// When there IS a new build, the same line changes colour and says so, and
// the whole line is the control. No button, no box: a sentence you can tap.
//
// WHY IT EXISTS AT ALL is the Computer tab nobody could find. The feature had
// shipped and been verified live days earlier; two people were looking at
// cached builds, and working that out took a dozen checks because nothing on
// screen said what build anyone was on. The automatic check handles this when
// it runs; this is what you reach for when it has not.

import { useState, useEffect, useCallback } from 'react'

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

  // Everything a stuck client can do, in order. The service worker is
  // unregistered because it is the thing holding the old build — leaving it
  // in place is how somebody "updates" three times and sees the same screen.
  const update = async () => {
    if (busy) return
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
      window.location.replace(`${window.location.pathname}?u=${Date.now()}`)
    }
  }

  const muted = theme?.textMuted || '#7d8a7f'
  const amber = '#b45309'

  const line = {
    margin: '14px 0 2px',
    fontSize: 10.5,
    letterSpacing: '0.04em',
    color: behind ? amber : muted,
    opacity: behind ? 1 : 0.65,
    textAlign: 'center',
    fontVariantNumeric: 'tabular-nums',
  }

  if (!behind) {
    return (
      <div style={line}>
        {RUNNING ? RUNNING.slice(0, 7) : 'unknown build'}
      </div>
    )
  }

  // The whole line is the control. A sentence you can tap beats a button
  // somebody has to notice is a button.
  return (
    <button
      onClick={update}
      style={{
        ...line,
        display: 'block', width: '100%',
        background: 'none', border: 'none', padding: '8px 0 2px',
        cursor: 'pointer', font: 'inherit', fontSize: 10.5,
        letterSpacing: '0.04em', color: amber, minHeight: 34,
      }}
    >
      {busy ? 'Updating…' : 'New version available — tap to update'}
    </button>
  )
}
