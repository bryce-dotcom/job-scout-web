// Arnie → Settings → "Check with me first".
//
// Rules a person writes on top of the leash. The leash
// (_shared/computerGrants.ts) is the FLOOR and nothing here can lower it: a
// password stays refused, an ungranted program stays refused, a Submit button
// still belongs to a human. These only ever add friction.
//
// Grok's model, adopted because the shape is right:
//
//   Ask first          stop and check, even though the grant allows it
//   Allow automatically  let it through (which a grant already does)
//   ASK FIRST WINS when both match.
//
// And their team/personal split: an Admin's rules apply to everyone and a
// person's own may only make things STRICTER. That falls out of ask-first-wins
// rather than needing a separate check — the only way a personal rule can
// change a company "allow automatically" is by adding an "ask first", and the
// only way it could loosen a company "ask first" would be an "allow
// automatically", which loses.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { useStore } from '../../../lib/store'
import { ShieldQuestion, Plus, Trash2, Lock, Building2, User } from 'lucide-react'

const t = {
  card: '#ffffff', card2: '#f0ebdd', ink: '#2c3530', sub: '#4d5a52',
  muted: '#7d8a7f', line: '#d6cdb8', accent: '#5a6349', accentBg: 'rgba(90,99,73,0.10)',
  amber: '#b45309', amberBg: 'rgba(180,83,9,0.10)', rm: '#b91c1c', rmBg: 'rgba(185,28,28,0.08)',
  add: '#2f7d4e', addBg: 'rgba(47,125,78,0.10)',
}

const KINDS = {
  ask_first: { label: 'Ask me first', c: t.amber, bg: t.amberBg },
  allow_auto: { label: 'Allow automatically', c: t.add, bg: t.addBg },
}

const ACTION_KINDS = ['', 'click', 'type', 'key', 'screenshot', 'scroll', 'launch']

export default function ArnieRules({ isAdmin = false }) {
  const user = useStore((s) => s.user)
  const companyId = useStore((s) => s.companyId)
  const [rows, setRows] = useState([])
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ kind: 'ask_first', app: '', host: '', action_kind: '', note: '', forCompany: false })

  const load = useCallback(async () => {
    if (!companyId) return
    const { data, error } = await supabase.from('arnie_computer_rules')
      .select('id,kind,employee_id,app,host,action_kind,note,created_at')
      .eq('company_id', companyId)
      .or(`employee_id.is.null,employee_id.eq.${user?.id || 0}`)
      .order('kind')
    if (error) setErr(error.message); else setErr('')
    setRows(data || [])
  }, [companyId, user?.id])

  useEffect(() => { load() }, [load])

  const save = async () => {
    setBusy(true); setErr('')
    const row = {
      company_id: companyId,
      // A company rule needs Admin. Without it the rule is the person's own,
      // which is the safe default — it can only make their own Arnie stricter.
      employee_id: (draft.forCompany && isAdmin) ? null : user?.id,
      kind: draft.kind,
      app: draft.app.trim().toLowerCase() || null,
      host: draft.host.trim().toLowerCase() || null,
      action_kind: draft.action_kind || null,
      note: draft.note.trim() || null,
      created_by: user?.id || null,
    }
    const { error } = await supabase.from('arnie_computer_rules').insert(row)
    if (error) setErr(error.message)
    else { setAdding(false); setDraft({ kind: 'ask_first', app: '', host: '', action_kind: '', note: '', forCompany: false }); load() }
    setBusy(false)
  }

  const remove = async (r) => {
    if (r.employee_id === null && !isAdmin) return
    setBusy(true)
    const { error } = await supabase.from('arnie_computer_rules').delete().eq('id', r.id)
    if (error) setErr(error.message)
    setBusy(false); load()
  }

  const describe = (r) => {
    const parts = []
    if (r.action_kind) parts.push(`${r.action_kind}s`)
    else parts.push('anything')
    if (r.app) parts.push(`in ${r.app}`)
    if (r.host && r.host !== '*') parts.push(`on ${r.host}`)
    return parts.join(' ')
  }

  return (
    <section style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 12, padding: 16, marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: t.ink, display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShieldQuestion size={17} style={{ color: t.accent }} /> Check with me first
        </h3>
        <button onClick={() => setAdding((v) => !v)} style={btn(t.card2, t.sub)}><Plus size={14} /> Add a rule</button>
      </div>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: t.sub, lineHeight: 1.55 }}>
        Extra care on top of what you have already allowed. These can only ever make Arnie more
        cautious — a password, an unallowed program and a Submit button are refused whatever is in here.
      </p>

      {err && <div style={{ background: t.rmBg, color: t.rm, borderRadius: 9, padding: '9px 11px', fontSize: 13, marginBottom: 11 }}>{err}</div>}

      {!rows.length && !adding && (
        <p style={{ margin: 0, fontSize: 13, color: t.muted }}>No extra rules. The programs you allowed are enough on their own.</p>
      )}

      {rows.map((r) => {
        const k = KINDS[r.kind] || KINDS.ask_first
        const locked = r.employee_id === null && !isAdmin
        return (
          <div key={r.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '9px 0', borderTop: `1px solid ${t.line}55` }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: k.c, background: k.bg, borderRadius: 11, padding: '2px 8px', flexShrink: 0, marginTop: 1, whiteSpace: 'nowrap' }}>
              {k.label}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, color: t.ink }}>{describe(r)}</div>
              {r.note && <div style={{ fontSize: 12.5, color: t.sub, marginTop: 2 }}>{r.note}</div>}
              <div style={{ fontSize: 11.5, color: t.muted, marginTop: 3, display: 'flex', alignItems: 'center', gap: 5 }}>
                {r.employee_id === null
                  ? <><Building2 size={12} /> set for the whole company</>
                  : <><User size={12} /> yours</>}
              </div>
            </div>
            {locked
              ? <span title="Set by an admin" style={{ color: t.muted, marginTop: 2 }}><Lock size={14} /></span>
              : <button onClick={() => remove(r)} disabled={busy} style={btn(t.rmBg, t.rm)}><Trash2 size={13} /></button>}
          </div>
        )
      })}

      {adding && (
        <div style={{ borderTop: `1px solid ${t.line}`, marginTop: 11, paddingTop: 12 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 9, flexWrap: 'wrap' }}>
            {Object.entries(KINDS).map(([id, k]) => (
              <label key={id} style={{
                display: 'inline-flex', gap: 7, alignItems: 'center', cursor: 'pointer',
                background: draft.kind === id ? k.bg : t.card2,
                border: `1px solid ${draft.kind === id ? k.c : t.line}`,
                borderRadius: 9, padding: '7px 11px', fontSize: 13, fontWeight: 600, color: draft.kind === id ? k.c : t.sub,
              }}>
                <input type="radio" name="rulekind" checked={draft.kind === id} onChange={() => setDraft({ ...draft, kind: id })} />
                {k.label}
              </label>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 9 }}>
            <select value={draft.action_kind} onChange={(e) => setDraft({ ...draft, action_kind: e.target.value })} style={input}>
              {ACTION_KINDS.map((k) => <option key={k || 'any'} value={k}>{k ? k : 'anything he does'}</option>)}
            </select>
            <input value={draft.app} onChange={(e) => setDraft({ ...draft, app: e.target.value })} placeholder="in which program (any)" style={input} />
            <input value={draft.host} onChange={(e) => setDraft({ ...draft, host: e.target.value })} placeholder="on which site (any)" style={input} />
          </div>
          <input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })}
            placeholder="Why — shown to you when he asks" style={{ ...input, width: '100%', marginBottom: 9 }} />
          {isAdmin && (
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, color: t.sub, marginBottom: 10, cursor: 'pointer' }}>
              <input type="checkbox" checked={draft.forCompany} onChange={(e) => setDraft({ ...draft, forCompany: e.target.checked })} />
              Apply to everyone in the company — they will not be able to remove it
            </label>
          )}
          <div style={{ fontSize: 12, color: t.muted, marginBottom: 10, lineHeight: 1.5 }}>
            If two rules both match, “Ask me first” wins.
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={save} disabled={busy} style={btn(t.accent, '#fff')}>Save the rule</button>
            <button onClick={() => setAdding(false)} style={btn(t.card2, t.sub)}>Cancel</button>
          </div>
        </div>
      )}
    </section>
  )
}

const btn = (bg, fg) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
  background: bg, color: fg, border: '1px solid transparent',
  borderRadius: 8, padding: '7px 10px', fontSize: 12.5, fontWeight: 600, minHeight: 36,
})

const input = {
  flex: 1, minWidth: 150, background: '#fff', border: `1px solid ${t.line}`,
  borderRadius: 8, padding: '8px 10px', fontSize: 13, color: t.ink, minHeight: 38,
}
