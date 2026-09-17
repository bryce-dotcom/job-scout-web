// What Arnie remembers about you — and the one tap that makes him forget.
//
// The rows come from arnie_memories, written only through Arnie's own
// card ("I'll keep that — approve it"). This is the other half of that
// consent: the list, in plain sight, with a Forget on every line. There is
// no add here on purpose; a memory is something you told Arnie, in
// Arnie's words, not a settings field.

import { useEffect, useState } from 'react'
import { Brain, X, AlertTriangle } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useStore } from '../../../lib/store'

const t = {
  ink: '#2c3530', sub: '#4d5a52', muted: '#7d8a7f', line: '#d6cdb8', card: '#ffffff',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.10)', amber: '#b45309',
}
const KIND = { alias: 'nickname', preference: 'preference', fact: 'about you' }

export default function ArnieMemories() {
  const user = useStore((s) => s.user)
  const companyId = useStore((s) => s.companyId)
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null)

  useEffect(() => {
    if (!user?.id || !companyId) return
    let live = true
    ;(async () => {
      const { data, error: e } = await supabase.from('arnie_memories').select('id,kind,text,created_at').eq('company_id', companyId).eq('employee_id', user.id).order('created_at')
      if (!live) return
      if (e) setError(e.message); else setRows(data || [])
    })()
    return () => { live = false }
  }, [user?.id, companyId])

  const forget = async (id) => {
    setBusy(id); setError(null)
    const { error: e } = await supabase.from('arnie_memories').delete().eq('id', id)
    setBusy(null)
    if (e) { setError(e.message); return }
    setRows((prev) => (prev || []).filter((r) => r.id !== id))
  }

  return (
    <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 12, padding: 16, marginBottom: 18, textAlign: 'left' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, background: t.accentBg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: t.accent }}><Brain size={18} /></span>
        <div>
          <div style={{ fontWeight: 700, color: t.ink }}>What Arnie remembers</div>
          <div style={{ fontSize: 12.5, color: t.muted }}>Things you told him to keep — a nickname for a job, how you like the brief. He carries them into every conversation. Only you see this list.</div>
        </div>
      </div>

      {rows === null && !error && <div style={{ fontSize: 13, color: t.muted, padding: '8px 0' }}>Loading…</div>}
      {rows && rows.length === 0 && (
        <div style={{ fontSize: 13, color: t.sub, padding: '8px 0' }}>
          Nothing yet. Tell Arnie "remember that I…" or "call the Riverside job the gym" and approve the card he draws.
        </div>
      )}
      {rows && rows.length > 0 && (
        <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map((r) => (
            <li key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, border: `1px solid ${t.line}`, minHeight: 44 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: t.accent, textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0, width: 78 }}>{KIND[r.kind] || r.kind}</span>
              <span style={{ flex: 1, fontSize: 13.5, color: t.ink, minWidth: 0 }}>{r.text}</span>
              <button type="button" onClick={() => forget(r.id)} disabled={busy === r.id} title="Forget this" aria-label={`Forget: ${r.text}`}
                style={{ minWidth: 44, minHeight: 36, padding: '0 10px', borderRadius: 8, border: `1px solid ${t.line}`, background: 'transparent', color: t.sub, fontSize: 12.5, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, opacity: busy === r.id ? 0.6 : 1 }}>
                <X size={13} /> Forget
              </button>
            </li>
          ))}
        </ul>
      )}
      {error && <div style={{ fontSize: 12.5, color: t.amber, marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={14} /> {error}</div>}
    </div>
  )
}
