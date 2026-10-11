// What Arnie has been taught, and the review that makes a draft usable.
//
// The review is the point. A demonstration shows WHAT was clicked and never
// WHY, so what comes back is a draft: Arnie says what he saw and, separately,
// what one run could not tell him. The person who did the job is the only one
// who can answer those — which is also why they are the one who publishes it,
// not an admin. An admin reviewing a step list they did not record would be
// rubber-stamping, and only the person who was there can spot that step 4 has
// their own customer's meter number baked into it.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { useStore } from '../../../lib/store'
import {
  GraduationCap, Circle, FileText, CheckCircle2, Archive, Share2, Loader2, AlertTriangle, Trash2,
} from 'lucide-react'

const t = {
  card: '#ffffff', card2: '#f0ebdd', ink: '#2c3530', sub: '#4d5a52', muted: '#7d8a7f',
  line: '#d6cdb8', accent: '#5a6349', accentBg: 'rgba(90,99,73,0.10)',
  add: '#2f7d4e', addBg: 'rgba(47,125,78,0.10)', rm: '#b91c1c', rmBg: 'rgba(185,28,28,0.08)',
  amber: '#b45309', amberBg: 'rgba(180,83,9,0.10)', info: '#1d4ed8', infoBg: 'rgba(59,130,246,0.10)',
}

const STATUS = {
  recording: { label: 'Recording now', c: t.rm, bg: t.rmBg, icon: Circle },
  draft: { label: 'Draft — needs your read', c: t.amber, bg: t.amberBg, icon: FileText },
  published: { label: 'In use', c: t.add, bg: t.addBg, icon: CheckCircle2 },
  archived: { label: 'Archived', c: t.muted, bg: 'rgba(125,138,127,0.10)', icon: Archive },
}

export default function ArnieSkills() {
  const user = useStore((s) => s.user)
  const companyId = useStore((s) => s.companyId)
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState(null)
  const [err, setErr] = useState('')
  const [edit, setEdit] = useState({})

  const load = useCallback(async () => {
    if (!companyId) return
    const { data, error } = await supabase.from('arnie_skills')
      .select('id,name,outcome,status,steps,rules,draft_notes,shared,employee_id,recording_started_at,published_at,created_at')
      .eq('company_id', companyId)
      .order('id', { ascending: false })
    if (error) setErr(error.message); else setErr('')
    setRows(data || [])
  }, [companyId])

  useEffect(() => { load() }, [load])
  // A recording in progress is a moving thing.
  useEffect(() => {
    if (!rows.some((r) => r.status === 'recording')) return
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [rows, load])

  const mine = (r) => r.employee_id === user?.id

  const stopRecording = async (r) => {
    setBusy(r.id); setErr('')
    try {
      const { error } = await supabase.functions.invoke('arnie-computer', { body: { action: 'teach_stop', skill_id: r.id } })
      if (error) throw error
      await writeUp(r, true)
    } catch (e) { setErr(String(e.message || e)) } finally { setBusy(null); load() }
  }

  const writeUp = async (r, quiet) => {
    if (!quiet) setBusy(r.id)
    setErr('')
    try {
      const { data, error } = await supabase.functions.invoke('arnie-teach', { body: { skill_id: r.id } })
      if (error) {
        let detail = ''
        try { detail = (await error.context?.json())?.error || '' } catch { /* not json */ }
        throw new Error(detail || error.message)
      }
      if (data?.ok) setErr('')
    } catch (e) { setErr(String(e.message || e)) } finally { if (!quiet) setBusy(null); load() }
  }

  const save = async (r) => {
    setBusy(r.id)
    const patch = {
      steps: { ...(r.steps || {}), written: edit[r.id]?.written ?? r.steps?.written ?? '' },
      rules: edit[r.id]?.rules ?? r.rules ?? '',
      updated_at: new Date().toISOString(),
    }
    const { error } = await supabase.from('arnie_skills').update(patch).eq('id', r.id)
    if (error) setErr(error.message)
    setBusy(null); load()
  }

  const publish = async (r) => {
    if (!window.confirm(
      `Put "${r.name}" to work?\n\n`
      + 'Only do this once the steps read right to you. Arnie still asks before anything that '
      + 'cannot be taken back, and he still never types a password — but the steps themselves '
      + 'are what he will follow.'
    )) return
    setBusy(r.id)
    const { error } = await supabase.from('arnie_skills').update({
      status: 'published', published_at: new Date().toISOString(), published_by: user?.id || null,
    }).eq('id', r.id)
    if (error) setErr(error.message)
    setBusy(null); load()
  }

  const setShared = async (r, shared) => {
    setBusy(r.id)
    const { error } = await supabase.from('arnie_skills').update({ shared }).eq('id', r.id)
    if (error) setErr(error.message)
    setBusy(null); load()
  }

  const archive = async (r) => {
    if (!window.confirm(`Archive "${r.name}"? Any routine using it stops running it.`)) return
    setBusy(r.id)
    const { error } = await supabase.from('arnie_skills').update({ status: 'archived', shared: false }).eq('id', r.id)
    if (error) setErr(error.message)
    setBusy(null); load()
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px 40px' }}>
      <header style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: t.ink, display: 'flex', alignItems: 'center', gap: 9 }}>
          <GraduationCap size={20} style={{ color: t.accent }} /> What Arnie has been taught
        </h2>
        <p style={{ margin: '5px 0 0', fontSize: 13.5, color: t.sub, lineHeight: 1.55 }}>
          A job you showed him once. He writes down what he saw; you fix what he misunderstood before
          it is ever used on a real customer. Start one from the Computer tab.
        </p>
      </header>

      {err && <div style={{ background: t.rmBg, border: `1px solid ${t.rm}33`, color: t.rm, borderRadius: 10, padding: '10px 12px', fontSize: 13, marginBottom: 14 }}>{err}</div>}

      {!rows.length && (
        <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 12, padding: 20, textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 13.5, color: t.sub, lineHeight: 1.6 }}>
            Nothing taught yet. Go to the Computer tab, connect a computer, and show him a job once.
          </p>
        </div>
      )}

      {rows.map((r) => {
        const st = STATUS[r.status] || STATUS.draft
        const Icon = st.icon
        const working = busy === r.id
        const written = edit[r.id]?.written ?? r.steps?.written ?? ''
        const rules = edit[r.id]?.rules ?? r.rules ?? ''
        const dirty = written !== (r.steps?.written ?? '') || rules !== (r.rules ?? '')

        return (
          <section key={r.id} style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 12, padding: 15, marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 15, color: t.ink }}>{r.name}</strong>
                  <span style={{ fontSize: 11, fontWeight: 700, color: st.c, background: st.bg, borderRadius: 11, padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <Icon size={11} /> {st.label}
                  </span>
                  {r.shared && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: t.accent, background: t.accentBg, borderRadius: 11, padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                      <Share2 size={11} /> everyone
                    </span>
                  )}
                  {!mine(r) && <span style={{ fontSize: 11.5, color: t.muted }}>taught by someone else</span>}
                </div>
                {r.outcome && <p style={{ margin: '6px 0 0', fontSize: 13, color: t.sub, lineHeight: 1.5 }}>{r.outcome}</p>}
              </div>
              {r.status === 'recording' && mine(r) && (
                <button onClick={() => stopRecording(r)} disabled={working} style={btn(t.rm, '#fff')}>
                  {working ? <Loader2 size={13} /> : <Circle size={13} />} Stop recording
                </button>
              )}
            </div>

            {r.status === 'recording' && (
              <p style={{ margin: '10px 0 0', fontSize: 13, color: t.sub, background: t.card2, borderRadius: 9, padding: '9px 11px', lineHeight: 1.5 }}>
                Go and do the job once on your computer. Nothing is recorded while Arnie is waiting on you
                to sign in, so a password cannot end up in the steps.
              </p>
            )}

            {r.status !== 'recording' && !r.steps?.written && (
              <div style={{ marginTop: 11 }}>
                <button onClick={() => writeUp(r, false)} disabled={working || !mine(r)} style={btn(t.accent, '#fff')}>
                  {working ? 'Reading it…' : 'Have Arnie write it up'}
                </button>
              </div>
            )}

            {r.steps?.written && (
              <div style={{ marginTop: 12 }}>
                {/* What one run could not tell him. Above the steps, because it
                    is the part a person is actually needed for. */}
                {r.draft_notes && r.status === 'draft' && (
                  <div style={{ background: t.amberBg, border: `1px solid ${t.amber}44`, borderRadius: 10, padding: '10px 12px', marginBottom: 11 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: t.amber, display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <AlertTriangle size={13} /> What Arnie is not sure about
                    </div>
                    <div style={{ fontSize: 13, color: t.ink, whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{r.draft_notes}</div>
                  </div>
                )}

                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: t.sub, marginBottom: 5 }}>
                  The steps {mine(r) && r.status !== 'archived' ? '— correct anything he got wrong' : ''}
                </label>
                <textarea
                  value={written}
                  readOnly={!mine(r) || r.status === 'archived'}
                  onChange={(e) => setEdit({ ...edit, [r.id]: { ...(edit[r.id] || {}), written: e.target.value } })}
                  rows={Math.min(22, Math.max(6, written.split('\n').length + 1))}
                  style={area}
                />

                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: t.sub, margin: '11px 0 5px' }}>
                  Your own rules — what to do when it goes wrong, and what must never be automatic
                </label>
                <textarea
                  value={rules}
                  readOnly={!mine(r) || r.status === 'archived'}
                  placeholder="If the rebate comes back more than 10% under the estimate, stop and tell me."
                  onChange={(e) => setEdit({ ...edit, [r.id]: { ...(edit[r.id] || {}), rules: e.target.value } })}
                  rows={3}
                  style={area}
                />

                <div style={{ display: 'flex', gap: 8, marginTop: 11, flexWrap: 'wrap' }}>
                  {mine(r) && dirty && (
                    <button onClick={() => save(r)} disabled={working} style={btn(t.accent, '#fff')}>Save my changes</button>
                  )}
                  {mine(r) && r.status === 'draft' && !dirty && (
                    <button onClick={() => publish(r)} disabled={working} style={btn(t.add, '#fff')}>
                      <CheckCircle2 size={13} /> It reads right — put it to work
                    </button>
                  )}
                  {mine(r) && r.status === 'published' && (
                    <button onClick={() => setShared(r, !r.shared)} disabled={working} style={btn(t.card2, t.sub)}>
                      <Share2 size={13} /> {r.shared ? 'Keep it to myself' : 'Share with the company'}
                    </button>
                  )}
                  {mine(r) && r.status !== 'archived' && (
                    <button onClick={() => archive(r)} disabled={working} style={btn(t.rmBg, t.rm)}>
                      <Trash2 size={13} /> Archive
                    </button>
                  )}
                  {mine(r) && r.status === 'draft' && dirty && (
                    <span style={{ fontSize: 12, color: t.muted, alignSelf: 'center' }}>Save first, then put it to work.</span>
                  )}
                </div>

                {r.steps?.from_observations && (
                  <div style={{ fontSize: 11.5, color: t.muted, marginTop: 9 }}>
                    Written from {r.steps.from_observations} things he watched you do.
                    {' '}What you typed was never recorded — only how much.
                  </div>
                )}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}

const btn = (bg, fg) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
  background: bg, color: fg, border: '1px solid transparent',
  borderRadius: 8, padding: '7px 11px', fontSize: 12.5, fontWeight: 600, minHeight: 36,
})

const area = {
  width: '100%', background: '#fff', border: `1px solid ${t.line}`, borderRadius: 9,
  padding: '10px 12px', fontSize: 13.5, color: t.ink, lineHeight: 1.6,
  fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box',
}
