// What your team has taught the assistant — company rules (Teach Jenny).
//
// Rules are taught in chat ("Jenny, new rule: …"), approved by an admin on
// the card, and followed by every assistant in the company
// (_shared/arnieCompanyRules.ts). This is the list in plain sight: everyone
// sees what their assistant was told, and an admin can retire a rule. There
// is no add box on purpose — a rule is taught to the assistant, in words.

import { useEffect, useState } from 'react'
import { BookOpen, X, AlertTriangle, Check } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useStore } from '../../../lib/store'

const t = {
  ink: '#2c3530', sub: '#4d5a52', muted: '#7d8a7f', line: '#d6cdb8', card: '#ffffff',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.10)', amber: '#b45309',
}
const day = (iso) => { try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) } catch { return '' } }
const who = (email) => String(email || '').split('@')[0] || 'an admin'

export default function ArnieTeamRules({ isAdmin, name = 'your assistant' }) {
  const companyId = useStore((s) => s.companyId)
  const [rows, setRows] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(null)
  // Suggestions from teammates who are not admins, waiting for an admin.
  const [waiting, setWaiting] = useState([])

  useEffect(() => {
    if (!companyId) return
    let live = true
    ;(async () => {
      const { data, error: e } = await supabase.from('company_rules')
        .select('id,rule,topic,taught_by,created_at').eq('company_id', companyId).eq('active', true).order('created_at')
      if (!live) return
      if (e) setError(e.message); else setRows(data || [])
      const { data: props } = await supabase.from('arnie_proposals')
        .select('id,created_by,created_at,payload').eq('company_id', companyId).eq('target', 'company_rule').eq('status', 'pending').order('created_at')
      if (live) setWaiting((props || []).filter((p) => p?.payload?.columns?.suggested === true))
    })()
    return () => { live = false }
  }, [companyId])

  const retire = async (id) => {
    setBusy(id); setError(null)
    const { data: auth } = await supabase.auth.getUser()
    const { error: e } = await supabase.from('company_rules')
      .update({ active: false, retired_at: new Date().toISOString(), retired_by: auth?.user?.email || null })
      .eq('id', id).eq('company_id', companyId)
    setBusy(null)
    if (e) { setError(e.message); return }
    setRows((prev) => (prev || []).filter((r) => r.id !== id))
  }

  // Approve or reject a suggestion — the same arnie-config call the card makes.
  const decide = async (p, action) => {
    setBusy('p' + p.id); setError(null)
    const { data, error: e } = await supabase.functions.invoke('arnie-config', { body: { action, proposal_id: p.id } })
    setBusy(null)
    if (e || data?.error) { setError(data?.error || e.message); return }
    setWaiting((prev) => prev.filter((x) => x.id !== p.id))
    if (action === 'apply') {
      const { data: fresh } = await supabase.from('company_rules').select('id,rule,topic,taught_by,created_at').eq('company_id', companyId).eq('active', true).order('created_at')
      setRows(fresh || [])
    }
  }

  return (
    <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 12, padding: 16, marginBottom: 18, textAlign: 'left' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, background: t.accentBg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: t.accent, flex: 'none' }}><BookOpen size={18} /></span>
        <div>
          <div style={{ fontWeight: 700, color: t.ink }}>What your team has taught {name}</div>
          <div style={{ fontSize: 12.5, color: t.muted }}>Rules an admin approved for everyone. Every assistant in the company follows them. To add one, tell {name}: "new rule: …"</div>
        </div>
      </div>

      {rows === null && !error && <div style={{ fontSize: 13, color: t.muted, padding: '8px 0' }}>Loading…</div>}
      {rows && rows.length === 0 && (
        <div style={{ fontSize: 13, color: t.sub, padding: '8px 0' }}>
          Nothing taught yet. An admin can say "new rule: every exterior SRP light uses the 12/7 schedule", or paste a list of rules, and approve the card.
        </div>
      )}
      {rows && rows.length > 0 && (
        <ol style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map((r) => (
            <li key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, border: `1px solid ${t.line}`, minHeight: 44 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: t.accent, flex: 'none', minWidth: 34, fontVariantNumeric: 'tabular-nums' }}>#{r.id}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13.5, color: t.ink }}>{r.rule}</span>
                <span style={{ display: 'block', fontSize: 11.5, color: t.muted }}>Taught by {who(r.taught_by)}, {day(r.created_at)}{r.topic ? ` · ${r.topic}` : ''}</span>
              </span>
              {isAdmin && (
                <button type="button" onClick={() => retire(r.id)} disabled={busy === r.id} title="Retire this rule" aria-label={`Retire rule ${r.id}: ${r.rule}`}
                  style={{ minWidth: 44, minHeight: 36, padding: '0 10px', borderRadius: 8, border: `1px solid ${t.line}`, background: 'transparent', color: t.sub, fontSize: 12.5, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, opacity: busy === r.id ? 0.6 : 1, flex: 'none' }}>
                  <X size={13} /> Retire
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
      {waiting.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: t.accent, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 }}>Suggested — waiting for an admin</div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {waiting.map((p) => (
              <li key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, border: `1px dashed ${t.line}`, minHeight: 44 }}>
                <span style={{ flex: 1, minWidth: 0 }}>
                  {(p.payload?.columns?.rules || []).map((r, i) => <span key={i} style={{ display: 'block', fontSize: 13.5, color: t.ink }}>{r}</span>)}
                  <span style={{ display: 'block', fontSize: 11.5, color: t.muted }}>Suggested by {who(p.created_by)}, {day(p.created_at)}</span>
                </span>
                {isAdmin && (
                  <span style={{ display: 'flex', gap: 6, flex: 'none' }}>
                    <button type="button" onClick={() => decide(p, 'apply')} disabled={busy === 'p' + p.id} aria-label={`Approve suggestion from ${who(p.created_by)}`}
                      style={{ minHeight: 36, padding: '0 10px', borderRadius: 8, border: 'none', background: t.accent, color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <Check size={13} /> Approve
                    </button>
                    <button type="button" onClick={() => decide(p, 'reject')} disabled={busy === 'p' + p.id} aria-label={`Reject suggestion from ${who(p.created_by)}`}
                      style={{ minHeight: 36, padding: '0 10px', borderRadius: 8, border: `1px solid ${t.line}`, background: 'transparent', color: t.sub, fontSize: 12.5, cursor: 'pointer' }}>
                      Reject
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && <div style={{ fontSize: 12.5, color: t.amber, marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={14} /> {error}</div>}
    </div>
  )
}
