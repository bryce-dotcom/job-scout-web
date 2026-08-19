// Arnie Setup — Tier A config customization (ARCHITECTURE.md §9).
// Admin types what they want in plain English; Arnie drafts a structured
// change; the admin reviews the before→after, approves, and it's applied +
// audited + rollbackable. Arnie never touches config until you approve.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { useStore } from '../../../lib/store'
import { Wrench, Check, X, RotateCcw, Send, Sparkles, ShieldAlert, MessageCircle } from 'lucide-react'

const t = {
  bg: '#f7f5ef', card: '#ffffff', card2: '#f0ebdd', ink: '#2c3530', sub: '#4d5a52',
  muted: '#7d8a7f', line: '#d6cdb8', accent: '#5a6349', accentHover: '#4a5239',
  accentBg: 'rgba(90,99,73,0.10)', add: '#2f7d4e', addBg: 'rgba(47,125,78,0.10)',
  rm: '#b91c1c', rmBg: 'rgba(185,28,28,0.08)', amber: '#b45309',
}
const EXAMPLES = [
  'Add a business unit called Government',
  'Add a lead source called Trade Show',
  'Rename the service type "Audit" to "Energy Audit"',
]
const STATUS = {
  pending: { c: t.amber, label: 'Awaiting approval' },
  applied: { c: t.add, label: 'Applied' },
  rejected: { c: t.muted, label: 'Rejected' },
  rolled_back: { c: t.muted, label: 'Rolled back' },
  failed: { c: t.rm, label: 'Failed' },
}

export default function ArnieSetup() {
  const user = useStore((s) => s.user)
  const level = (() => {
    if (!user) return 0
    if (user.is_developer) return 5
    const map = { 'User': 0, 'Team Lead': 1, 'Manager': 2, 'Admin': 3, 'Super Admin': 4, 'Developer': 5, 'Owner': 4 }
    return map[user.user_role] ?? map[user.role] ?? 0
  })()
  // Proposing a settings change is admin-only, as it always was. Seeing the
  // history is not: Tier B lets a manager change a job or lead through Arnie,
  // and the chat card tells them they can roll it back from here. Locking
  // managers out of this page would make that promise a lie. Every button is
  // re-checked server-side against the proposal's own rule, so what a manager
  // sees here is not what they can necessarily undo.
  const isAdmin = level >= 3
  const canSeeHistory = level >= 2

  const [request, setRequest] = useState('')
  const [busy, setBusy] = useState(false)
  const [proposal, setProposal] = useState(null)   // { proposal, preview }
  const [error, setError] = useState(null)
  const [history, setHistory] = useState([])

  const loadHistory = useCallback(async () => {
    const { data } = await supabase.from('arnie_proposals').select('*').order('created_at', { ascending: false }).limit(25)
    setHistory(data || [])
  }, [])
  useEffect(() => { if (canSeeHistory) loadHistory() }, [canSeeHistory, loadHistory])

  const invoke = async (body) => {
    const { data, error: fnErr } = await supabase.functions.invoke('arnie-config', { body })
    if (fnErr) {
      // functions.invoke surfaces non-2xx as an error; try to read its message
      let msg = fnErr.message
      try { msg = (await fnErr.context?.json())?.error || msg } catch { /* keep */ }
      return { error: msg }
    }
    return data
  }

  const ask = async () => {
    if (!request.trim() || busy) return
    setBusy(true); setError(null); setProposal(null)
    const res = await invoke({ action: 'propose', request: request.trim() })
    if (res?.error) setError(res.error)
    else setProposal(res)
    setBusy(false)
  }

  const decide = async (action, proposal_id) => {
    setBusy(true); setError(null)
    const res = await invoke({ action, proposal_id })
    if (res?.error) setError(res.error)
    else { setProposal(null); setRequest(''); await loadHistory() }
    setBusy(false)
  }

  if (!canSeeHistory) {
    return (
      <div style={{ maxWidth: 620, margin: '48px auto', padding: 24, textAlign: 'center', color: t.sub }}>
        <ShieldAlert size={28} color={t.muted} />
        <h2 style={{ color: t.ink, margin: '12px 0 6px' }}>Manager access or above</h2>
        <p>Changes Arnie makes are reviewed and rolled back from here, which is limited to managers, admins and owners.</p>
      </div>
    )
  }

  const diff = proposal?.preview
  const beforeSet = new Set((diff?.before || []).map((x) => x.toLowerCase()))
  const afterSet = new Set((diff?.after || []).map((x) => x.toLowerCase()))

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '20px 20px 60px', color: t.ink, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <Wrench size={20} color={t.accent} />
        <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>System settings with Arnie</h1>
      </div>
      <p style={{ color: t.sub, margin: '0 0 14px', fontSize: 14 }}>
        {isAdmin
          ? 'Tell Arnie what to change in plain English. He drafts it, you review the before-and-after, and nothing changes until you approve. Every change is logged and can be rolled back.'
          : 'Every change Arnie makes for you lands here — what it was, what it became, and a way to put it back.'}
      </p>

      {/* Arnie lives in the corner guy — you can also just talk to him there. */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: t.accentBg, border: `1px solid ${t.line}`, borderRadius: 12, padding: '12px 14px', margin: '0 0 18px' }}>
        <MessageCircle size={18} color={t.accent} style={{ flex: 'none', marginTop: 1 }} />
        <div style={{ fontSize: 13.5, color: t.sub, lineHeight: 1.5 }}>
          <b style={{ color: t.ink }}>Prefer to just talk? Arnie also lives in the “Ask Arnie” button in the bottom-right corner.</b> Open him from anywhere and ask him to set something up — whenever he's about to change your system, he'll bring the proposed change here for your approval first.
        </div>
      </div>

      {/* ask box — proposing a settings change stays admin-only */}
      {isAdmin && (
      <div style={{ background: t.card, border: `1.5px solid ${t.line}`, borderRadius: 14, padding: 16 }}>
        <textarea
          value={request} onChange={(e) => setRequest(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) ask() }}
          placeholder="e.g. Add a business unit called Government"
          rows={2}
          style={{ width: '100%', border: `1px solid ${t.line}`, borderRadius: 10, padding: '11px 13px', fontSize: 14, resize: 'vertical', fontFamily: 'inherit', color: t.ink, background: t.bg, boxSizing: 'border-box' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {EXAMPLES.map((ex) => (
              <button key={ex} onClick={() => setRequest(ex)} style={{ fontSize: 12, color: t.accent, background: t.accentBg, border: `1px solid ${t.line}`, borderRadius: 20, padding: '4px 10px', cursor: 'pointer' }}>{ex}</button>
            ))}
          </div>
          <button onClick={ask} disabled={busy || !request.trim()} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: busy || !request.trim() ? t.muted : t.accent, color: '#fff', border: 0, borderRadius: 10, padding: '10px 16px', fontWeight: 650, fontSize: 14, cursor: busy || !request.trim() ? 'not-allowed' : 'pointer', minHeight: 42 }}>
            <Send size={15} /> {busy ? 'Thinking…' : 'Ask Arnie'}
          </button>
        </div>
      </div>
      )}

      {error && (
        <div style={{ marginTop: 14, background: t.rmBg, border: `1px solid ${t.rm}33`, color: t.rm, borderRadius: 10, padding: '11px 14px', fontSize: 13.5 }}>{error}</div>
      )}

      {/* proposal preview */}
      {diff && (
        <div style={{ marginTop: 16, background: t.card, border: `2px solid ${t.accent}`, borderRadius: 14, padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <Sparkles size={16} color={t.accent} />
            <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.accent, fontWeight: 600 }}>Arnie proposes</span>
          </div>
          <div style={{ fontWeight: 700, fontSize: 15.5, marginBottom: 12 }}>{proposal.proposal.summary}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: t.muted, marginBottom: 6 }}>Now — {diff.label}s</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(diff.before || []).map((x) => <Chip key={x} label={x} tone={afterSet.has(x.toLowerCase()) ? 'plain' : 'rm'} />)}
                {!(diff.before || []).length && <span style={{ color: t.muted, fontSize: 13 }}>(none yet)</span>}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', color: t.muted, marginBottom: 6 }}>After</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(diff.after || []).map((x) => <Chip key={x} label={x} tone={beforeSet.has(x.toLowerCase()) ? 'plain' : 'add'} />)}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button onClick={() => decide('apply', proposal.proposal.id)} disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: t.accent, color: '#fff', border: 0, borderRadius: 10, padding: '10px 18px', fontWeight: 650, fontSize: 14, cursor: busy ? 'wait' : 'pointer', minHeight: 42 }}><Check size={16} /> Approve & apply</button>
            <button onClick={() => decide('reject', proposal.proposal.id)} disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'transparent', color: t.ink, border: `1.5px solid ${t.line}`, borderRadius: 10, padding: '10px 16px', fontWeight: 600, fontSize: 14, cursor: busy ? 'wait' : 'pointer', minHeight: 42 }}><X size={16} /> Discard</button>
          </div>
        </div>
      )}

      {/* history */}
      <h2 style={{ fontSize: 15, fontWeight: 700, margin: '28px 0 10px', color: t.ink }}>Change history</h2>
      {!history.length && <p style={{ color: t.muted, fontSize: 13.5 }}>No changes yet. Ask Arnie to set something up above.</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {history.map((h) => {
          const st = STATUS[h.status] || { c: t.muted, label: h.status }
          return (
            <div key={h.id} style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 10, padding: '11px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: st.c, flex: 'none' }} />
              <span style={{ flex: 1, minWidth: 180, fontSize: 13.5 }}>{h.summary}</span>
              <span style={{ fontSize: 11.5, color: st.c, fontWeight: 600 }}>{st.label}</span>
              {h.status === 'applied' && (
                <button onClick={() => decide('rollback', h.id)} disabled={busy} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'transparent', color: t.sub, border: `1px solid ${t.line}`, borderRadius: 8, padding: '5px 10px', fontSize: 12.5, cursor: busy ? 'wait' : 'pointer' }}><RotateCcw size={13} /> Roll back</button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Chip({ label, tone }) {
  const s = tone === 'add' ? { bg: t.addBg, c: t.add, b: `${t.add}44`, deco: 'none' }
    : tone === 'rm' ? { bg: t.rmBg, c: t.rm, b: `${t.rm}44`, deco: 'line-through' }
    : { bg: t.card2, c: t.sub, b: t.line, deco: 'none' }
  return <span style={{ background: s.bg, color: s.c, border: `1px solid ${s.b}`, borderRadius: 20, padding: '4px 11px', fontSize: 13, textDecoration: s.deco }}>{label}</span>
}
