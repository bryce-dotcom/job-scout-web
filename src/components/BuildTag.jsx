// Which build this is — as a whisper, not a widget.
//
// It lives under Refresh and Sign Out, which is where you look when something
// is wrong, and it answers the one question nobody could answer: what build am
// I actually on. The Computer tab had shipped and been verified live days
// earlier while two people stared at cached builds; working that out took a
// dozen checks because nothing on screen said.
//
// Two states, one shape. Nearly every time somebody opens that menu they are
// up to date and there is nothing to do, so that state is small print that
// costs no attention. When there IS a new build the same line turns amber and
// becomes the control — tap the line, no button, no box.
//
// WHAT KEEPS IT CLEAN AT EVERY WIDTH, which is the thing that went wrong:
//   - The strings are SHORT. "New version available — tap to update" wrapped
//     to three ragged lines in a 280px drawer and read as an error. Every
//     string here fits one line at 240px.
//   - A dot carries the state as well as the colour, so it still reads on a
//     bad screen, in sunlight, or to someone who cannot separate amber from
//     grey.
//   - Nothing is absolutely sized. No min-width, no fixed height: it is a
//     centred flex row that shrinks with its container.

import { useState, useEffect, useCallback } from 'react'
import { applyUpdate } from '../lib/appUpdate'

const RUNNING = import.meta.env.VITE_APP_BUILD || ''

/** Seven characters is a git short hash — long enough to tell builds apart. */
const short = (b) => (b ? String(b).slice(0, 7) : null)

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

  // Everything a stuck client can do, in order — now lib/appUpdate's
  // applyUpdate, because this was the ONLY copy that did it properly. The
  // banner everyone actually sees called plain reload(), which the worker
  // answers from precache, so that button changed nothing and people pressed
  // it again and again. One rule, one place; the comment that used to live
  // here ("leaving it in place is how somebody updates three times and sees
  // the same screen") moved with it.
  const update = async () => {
    if (busy) return
    setBusy(true)
    await applyUpdate()
  }

  const muted = theme?.textMuted || '#7d8a7f'
  // Amber, not red. Being a build behind is not an error — it is a thing you
  // can fix in one tap, and red is the colour this app uses when money or data
  // is wrong.
  const amber = '#b45309'
  const tone = behind ? amber : muted

  const row = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    margin: '12px 0 2px',
    padding: '6px 8px',
    fontSize: 11,
    lineHeight: 1.3,
    letterSpacing: '0.02em',
    color: tone,
    fontVariantNumeric: 'tabular-nums',
    // It must shrink, never push its container wider.
    maxWidth: '100%',
    minWidth: 0,
  }

  const dot = {
    width: 6,
    height: 6,
    borderRadius: '50%',
    flexShrink: 0,
    backgroundColor: tone,
    opacity: behind ? 1 : 0.5,
  }

  // The version itself can be ellipsised; the status word never is, because
  // "up to date" is the part you actually came to read.
  const build = {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
    opacity: behind ? 0.9 : 0.75,
  }

  const status = { whiteSpace: 'nowrap', flexShrink: 0, fontWeight: behind ? 600 : 400 }

  const label = short(RUNNING) || 'unknown'

  if (!behind) {
    return (
      <div style={row} title={RUNNING ? `Build ${RUNNING}` : 'Build unknown'}>
        <span style={dot} />
        <span style={build}>v{label}</span>
        <span aria-hidden="true" style={{ opacity: 0.4, flexShrink: 0 }}>·</span>
        <span style={status}>Up to date</span>
      </div>
    )
  }

  return (
    <button
      onClick={update}
      title={`On ${RUNNING}, latest is ${served}`}
      style={{
        ...row,
        width: '100%',
        background: 'none',
        border: 'none',
        font: 'inherit',
        fontSize: 11,
        color: amber,
        cursor: 'pointer',
        borderRadius: 8,
      }}
    >
      <span style={dot} />
      <span style={build}>v{label}</span>
      <span aria-hidden="true" style={{ opacity: 0.4, flexShrink: 0 }}>·</span>
      <span style={status}>{busy ? 'Updating…' : 'Tap to update'}</span>
    </button>
  )
}
