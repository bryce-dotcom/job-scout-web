// Arnie → Routines. Standing work, with a screen at last.
//
// The table and the hourly cron have existed since 2026-10-10 and nothing in
// the app has ever shown them: a routine could only be created by asking Arnie
// and then never looked at again. Grok's team moved routines out of secondary
// settings into the main interface precisely so "their runs and results are
// reviewable", which is the whole problem here.
//
// Two of their behaviours copied deliberately because they are hard-won:
//
//   A test run does REAL WORK. It is not a dry run, and saying "Test" without
//   saying that is how somebody discovers it sent a customer an email.
//
//   Deleting is immediate and cannot be undone, so it asks first.

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { useStore } from '../../../lib/store'
import {
  Clock, Play, Pause, FlaskConical, Trash2, AlertTriangle, Check, X,
  MessageSquare, Mail, Smartphone, GraduationCap,
} from 'lucide-react'

const t = {
  bg: '#f7f5ef', card: '#ffffff', card2: '#f0ebdd', ink: '#2c3530', sub: '#4d5a52',
  muted: '#7d8a7f', line: '#d6cdb8', accent: '#5a6349', accentBg: 'rgba(90,99,73,0.10)',
  add: '#2f7d4e', addBg: 'rgba(47,125,78,0.10)', rm: '#b91c1c', rmBg: 'rgba(185,28,28,0.08)',
  amber: '#b45309', amberBg: 'rgba(180,83,9,0.10)',
}

const CHANNEL = {
  app: { icon: MessageSquare, label: 'in the app' },
  email: { icon: Mail, label: 'by email' },
  sms: { icon: Smartphone, label: 'by text' },
}

const hour12 = (h) => {
  const n = Number(h) || 0
  const ampm = n < 12 ? 'am' : 'pm'
  const twelve = n % 12 === 0 ? 12 : n % 12
  return `${twelve}${ampm}`
}

const when = (r) =>
  `${r.weekdays_only ? 'Weekdays' : 'Every day'} at ${hour12(r.hour_local)} ${r.timezone?.split('/')?.[1]?.replace('_', ' ') || r.timezone || ''}`.trim()

export default function ArnieRoutines() {
  const user = useStore((s) => s.user)
  const companyId = useStore((s) => s.companyId)
  const [rows, setRows] = useState([])
  const [skills, setSkills] = useState([])
  const [busy, setBusy] = useState(null)
  const [err, setErr] = useState('')
  const [runs, setRuns] = useState({})

  const load = useCallback(async () => {
    if (!companyId || !user?.id) return
    const [{ data: r, error: e1 }, { data: s }] = await Promise.all([
      supabase.from('arnie_routines')
        .select('id,name,prompt,enabled,channel,hour_local,timezone,weekdays_only,shared,skill_id,last_run_on,last_result,last_error,created_at')
        .eq('company_id', companyId).eq('employee_id', user.id).order('hour_local'),
      supabase.from('arnie_skills')
        .select('id,name,status').eq('company_id', companyId).eq('status', 'published'),
    ])
    if (e1) setErr(e1.message); else setErr('')
    setRows(r || []); setSkills(s || [])
  }, [companyId, user?.id])

  useEffect(() => { load() }, [load])

  const toggle = async (r) => {
    setBusy(r.id)
    const { error } = await supabase.from('arnie_routines').update({ enabled: !r.enabled }).eq('id', r.id)
    if (error) setErr(error.message)
    setBusy(null); load()
  }

  const testRun = async (r) => {
    // Real work. Said plainly, because it is.
    if (!window.confirm(
      `Run "${r.name}" now?\n\n`
      + 'This does the real thing, not a rehearsal — if it sends a message, the message goes. '
      + 'Anything it wants to CHANGE still comes back as a card for you to approve.'
    )) return
    setBusy(r.id); setErr('')
    try {
      const { data, error } = await supabase.functions.invoke('arnie-routines', { body: { routine_id: r.id } })
      if (error) throw error
      const out = data?.results?.[0]
      setRuns((p) => ({ ...p, [r.id]: out?.ok ? (out.summary || 'Ran.') : (out?.error || 'It did not finish.') }))
    } catch (e) {
      setRuns((p) => ({ ...p, [r.id]: String(e.message || e) }))
    } finally { setBusy(null); load() }
  }

  const remove = async (r) => {
    if (!window.confirm(`Delete "${r.name}"?\n\nThis happens straight away and cannot be undone.`)) return
    setBusy(r.id)
    const { error } = await supabase.from('arnie_routines').delete().eq('id', r.id)
    if (error) setErr(error.message)
    setBusy(null); load()
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 16px 40px' }}>
      <header style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: t.ink, display: 'flex', alignItems: 'center', gap: 9 }}>
          <Clock size={20} style={{ color: t.accent }} /> Standing work
        </h2>
        <p style={{ margin: '5px 0 0', fontSize: 13.5, color: t.sub, lineHeight: 1.55 }}>
          Things Arnie does on a schedule, as you, with your access. Ask him in a sentence —
          “every weekday at 7, text me which jobs are unscheduled” — and it appears here.
        </p>
      </header>

      {err && (
        <div style={{ background: t.rmBg, border: `1px solid ${t.rm}33`, color: t.rm, borderRadius: 10, padding: '10px 12px', fontSize: 13, marginBottom: 14 }}>{err}</div>
      )}

      {!rows.length && (
        <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 12, padding: 20, textAlign: 'center' }}>
          <p style={{ margin: 0, fontSize: 13.5, color: t.sub, lineHeight: 1.6 }}>
            Nothing standing yet. Tell Arnie what you want checking and when, and it will be listed here
            with its run history.
          </p>
        </div>
      )}

      {rows.map((r) => {
        const Ch = (CHANNEL[r.channel] || CHANNEL.app).icon
        const skill = skills.find((s) => s.id === r.skill_id)
        const working = busy === r.id
        return (
          <section key={r.id} style={{
            background: t.card, border: `1px solid ${t.line}`, borderRadius: 12,
            padding: 14, marginBottom: 11, opacity: r.enabled ? 1 : 0.72,
          }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 15, color: t.ink }}>{r.name}</strong>
                  {!r.enabled && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: t.muted, background: t.card2, borderRadius: 10, padding: '2px 7px' }}>Paused</span>
                  )}
                  {r.shared && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: t.accent, background: t.accentBg, borderRadius: 10, padding: '2px 7px' }}>Shared</span>
                  )}
                </div>
                <div style={{ fontSize: 12.5, color: t.muted, marginTop: 3, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <Ch size={13} /> {when(r)} · {(CHANNEL[r.channel] || CHANNEL.app).label}
                </div>
                <p style={{ margin: '7px 0 0', fontSize: 13, color: t.sub, lineHeight: 1.5 }}>{r.prompt}</p>
                {skill && (
                  <div style={{ fontSize: 12.5, color: t.accent, marginTop: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <GraduationCap size={13} /> runs the taught task “{skill.name}”
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
                <button onClick={() => toggle(r)} disabled={working} style={btn(t.card2, t.sub)}>
                  {r.enabled ? <><Pause size={13} /> Pause</> : <><Play size={13} /> Enable</>}
                </button>
                <button onClick={() => testRun(r)} disabled={working} style={btn(t.accentBg, t.accent)}>
                  <FlaskConical size={13} /> {working ? 'Running…' : 'Test run'}
                </button>
                <button onClick={() => remove(r)} disabled={working} style={btn(t.rmBg, t.rm)}>
                  <Trash2 size={13} /> Delete
                </button>
              </div>
            </div>

            {/* Run history: what happened last, and what just happened if it
                was tested from here. */}
            <div style={{ borderTop: `1px solid ${t.line}55`, marginTop: 11, paddingTop: 9 }}>
              {r.last_error ? (
                <div style={{ fontSize: 12.5, color: t.rm, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>Last run failed{r.last_run_on ? ` on ${r.last_run_on}` : ''} — {r.last_error}</span>
                </div>
              ) : r.last_run_on ? (
                <div style={{ fontSize: 12.5, color: t.muted, display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                  <Check size={13} style={{ flexShrink: 0, marginTop: 1, color: t.add }} />
                  <span>Last ran {r.last_run_on}{r.last_result ? ` — ${String(r.last_result).slice(0, 180)}` : ''}</span>
                </div>
              ) : (
                <div style={{ fontSize: 12.5, color: t.muted }}>Has not run yet.</div>
              )}
              {runs[r.id] && (
                <div style={{ fontSize: 12.5, color: t.sub, marginTop: 6, background: t.card2, borderRadius: 8, padding: '8px 10px', lineHeight: 1.5 }}>
                  <strong style={{ color: t.ink }}>Test run:</strong> {runs[r.id]}
                </div>
              )}
            </div>
          </section>
        )
      })}

      <p style={{ fontSize: 12, color: t.muted, marginTop: 14, lineHeight: 1.55 }}>
        A routine runs with your access and answers from what you are allowed to see. Anything it wants
        to change comes back as a card for you to approve — and an approval raised by standing work
        expires after ten minutes, because an action nobody answered at 7am should not be waved through
        at six in the evening.
      </p>
    </div>
  )
}

const btn = (bg, fg) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
  background: bg, color: fg, border: '1px solid transparent',
  borderRadius: 8, padding: '7px 10px', fontSize: 12.5, fontWeight: 600, minHeight: 36,
})
