// Short answers, or the play-by-play — per person.
//
// Bryce, 2026-10-20: "most people just want her to haul ass and give the most
// concise answer to the question ... can this be her default mode with a
// toggle that allows for the details?" Brief is the default (no row, or
// detail = 'brief'); this switch turns on 'detailed' for the people who like
// hearing what she is checking. The server reads it every message
// (arnie-chat answerStyleBlock), so it takes effect on the next one.

import { useEffect, useState } from 'react'
import { MessageSquareText } from 'lucide-react'
import { useStore } from '../../../lib/store'
import { loadPersona, savePersona } from '../../../lib/arniePersonaClient'

const t = {
  ink: '#2c3530', sub: '#4d5a52', muted: '#7d8a7f', line: '#d6cdb8', card: '#ffffff',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.10)', amber: '#b45309',
}

export default function ArnieDetailToggle({ name = 'your assistant' }) {
  const user = useStore((s) => s.user)
  const companyId = useStore((s) => s.companyId)
  const [detailed, setDetailed] = useState(null) // null while loading
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!user?.id) return
    let live = true
    loadPersona(user.id).then((r) => { if (live) setDetailed(r?.detail === 'detailed') }).catch(() => { if (live) setDetailed(false) })
    return () => { live = false }
  }, [user?.id])

  const flip = async () => {
    const next = !detailed
    setBusy(true); setErr('')
    const { error } = await savePersona(user?.id, companyId, { detail: next ? 'detailed' : 'brief' })
    setBusy(false)
    if (error) { setErr(typeof error === 'string' ? error : error.message || 'Could not save that.'); return }
    setDetailed(next)
  }

  return (
    <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 12, padding: 16, marginBottom: 18, textAlign: 'left' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, background: t.accentBg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: t.accent, flex: 'none' }}><MessageSquareText size={18} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, color: t.ink }}>Show what {name} is doing</div>
          <div style={{ fontSize: 12.5, color: t.muted }}>
            {detailed
              ? `On: ${name} says what she is checking as she goes, then answers.`
              : `Off: ${name} just answers, as short as the question allows. Ask "explain" or "walk me through it" any time for more.`}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={!!detailed}
          aria-label={`Show what ${name} is doing`}
          onClick={flip}
          disabled={busy || detailed === null}
          style={{
            width: 52, height: 30, borderRadius: 999, border: `1px solid ${detailed ? t.accent : t.line}`,
            background: detailed ? t.accent : '#ece8dd', position: 'relative', cursor: 'pointer', flex: 'none',
            opacity: busy || detailed === null ? 0.6 : 1, padding: 0,
          }}
        >
          <span style={{
            position: 'absolute', top: 2, left: detailed ? 24 : 2, width: 24, height: 24, borderRadius: '50%',
            background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.2)', transition: 'left 120ms ease',
          }} />
        </button>
      </div>
      {err && <div style={{ fontSize: 12.5, color: t.amber, marginTop: 8 }}>{err}</div>}
    </div>
  )
}
