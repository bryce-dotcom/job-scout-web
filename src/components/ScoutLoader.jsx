// The hiking scout from the storefront, as the app's "working on it".
//
// Bryce: "all indicators should be the little scout hiking, the animated
// version on the storefront." One component so every wait looks the same:
// a photo going up, a caption being written, a post being sent, a library
// opening. Pass `pct` for a progress bar under him when the work has a
// measurable length; otherwise he just walks.
//
//   <ScoutLoader label="Sending…" pct={43} />            inline, in flow
//   <ScoutLoader label="Writing…" size={44} />           smaller, inline
//   <ScoutLoader overlay label="Posting to Facebook…" />  blocks the screen

import { useEffect } from 'react'

export default function ScoutLoader({ label = 'Working on it…', sub = null, pct = null, size = 64, overlay = false, theme = null, style = {} }) {
  const text = theme?.text || '#2c3530'
  const muted = theme?.textMuted || '#7d8a7f'
  const border = theme?.border || '#d6cdb8'
  const card = theme?.bgCard || '#ffffff'
  useEffect(() => {
    if (!overlay) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [overlay])

  const body = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: overlay ? '22px 26px' : '10px 0', ...style }}>
      <img src="/scout-walk.gif" alt="" width={size} height={size} style={{ width: size, height: size, borderRadius: Math.round(size * 0.22), display: 'block', boxShadow: '0 6px 18px rgba(31,26,15,.14), inset 0 0 0 1px rgba(0,0,0,.06)' }} />
      {label && <div style={{ fontSize: size >= 56 ? 14 : 12, fontWeight: 700, color: text, textAlign: 'center' }}>{label}{pct != null && pct < 100 ? ` ${Math.round(pct)}%` : ''}</div>}
      {sub && <div style={{ fontSize: 12, color: muted, textAlign: 'center', maxWidth: 320 }}>{sub}</div>}
      {pct != null && (
        <div style={{ width: Math.max(160, size * 3), height: 6, borderRadius: 3, background: border, overflow: 'hidden' }}>
          <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: '100%', background: '#e11d48', transition: 'width 0.3s' }} />
        </div>
      )}
    </div>
  )
  if (!overlay) return body
  return (
    <div role="status" aria-live="polite" style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(44,53,48,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: card, borderRadius: 16, boxShadow: '0 20px 50px rgba(0,0,0,0.25)' }}>{body}</div>
    </div>
  )
}
