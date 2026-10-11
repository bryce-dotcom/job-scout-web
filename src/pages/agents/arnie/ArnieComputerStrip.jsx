// What Arnie's computer is doing, inside the conversation.
//
// Three things, in priority order, and only ever one of them at a time:
//
//   1. THE HANDOFF. He has stopped at a sign-in page or an irreversible
//      button. This is the moment the entire credential design rests on — the
//      reason JobScout holds no utility passwords — and until now it was a
//      line of chat text that scrolls away. It is a banner.
//
//   2. AN ASK-FIRST. A rule said check with me. Three buttons, Grok's:
//      Allow once / Always allow / Deny, where Always allow writes a grant
//      for THAT app and host and tier and nothing wider. Their own docs warn
//      against broad rules ("allow everything in the browser"), so the button
//      cannot write one.
//
//   3. THE RECORD. The last few things he did, newest first.
//
// Deliberately NOT a mirror of the screen. Grok streams their agent's cloud
// desktop because the person cannot see it; ours is the person's own machine,
// sitting in front of them. Mirroring their own screen back at them is noise,
// and their own principle — "delegation over operation", a coworker rather
// than a remote machine — argues against it even when it is possible.

import { useState, useEffect, useCallback } from 'react'
import { useStore } from '../../../lib/store'
import { Link } from 'react-router-dom'
import { HandHelping, ShieldQuestion, Monitor, Check, X, Infinity as InfinityIcon } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { myComputer, grant as addGrant } from '../../../lib/arnieComputer'
import { describeAction } from '../../../lib/agentStatus'

const t = {
  card: '#ffffff', card2: '#f0ebdd', ink: '#2c3530', sub: '#4d5a52', muted: '#7d8a7f',
  line: '#d6cdb8', accent: '#5a6349', accentBg: 'rgba(90,99,73,0.10)',
  amber: '#b45309', amberBg: 'rgba(180,83,9,0.12)', add: '#2f7d4e', addBg: 'rgba(47,125,78,0.10)',
  rm: '#b91c1c', rmBg: 'rgba(185,28,28,0.08)',
}

const call = async (action, body) => {
  const { data, error } = await supabase.functions.invoke('arnie-computer', { body: { action, ...body } })
  if (error) {
    let detail = ''
    try { detail = (await error.context?.json())?.error || '' } catch { /* not json */ }
    throw new Error(detail || error.message)
  }
  return data
}

export default function ArnieComputerStrip() {
  const user = useStore((s) => s.user)
  const [c, setC] = useState({ session: null, latest: null, actions: [] })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    if (!user?.id) return
    try { setC(await myComputer(user.id)) } catch { /* the strip is not worth an error */ }
  }, [user?.id])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const live = c.session?.status === 'live'
    if (!live) return
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [load, c.session?.status])

  if (!c.session || c.session.status !== 'live') return null

  const waiting = c.actions.find((a) => a.decision === 'awaiting_human')
  const asking = c.actions.find((a) => a.decision === 'needs_approval')
  const recent = c.actions.filter((a) => ['allowed', 'refused', 'failed', 'expired'].includes(a.decision)).slice(0, 4)

  const answer = async (which, a, always) => {
    setBusy(true); setErr('')
    try {
      if (always && a.app) {
        // Scoped to exactly what was asked for. Never the whole app when a
        // host was named, and never a wider tier than the action needed.
        await addGrant({ app: a.app, host: a.host || '*', tier: a.kind === 'type' || a.kind === 'key' ? 'full' : 'click' })
      }
      await call(which, { action_id: a.id, session_id: c.session.id })
      await load()
    } catch (e) { setErr(String(e.message || e)) } finally { setBusy(false) }
  }

  return (
    <div style={{ margin: '0 0 12px' }}>
      {/* 1. The handoff */}
      {waiting && (
        <div style={{
          background: t.amberBg, border: `1px solid ${t.amber}55`, borderRadius: 12,
          padding: '12px 14px', marginBottom: 9, display: 'flex', gap: 11, alignItems: 'flex-start',
        }}>
          <HandHelping size={19} style={{ color: t.amber, flexShrink: 0, marginTop: 1 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: t.ink }}>
              Arnie is waiting on you{waiting.host && waiting.host !== '*' ? ` — ${waiting.host}` : waiting.app ? ` — ${waiting.app}` : ''}
            </div>
            <div style={{ fontSize: 13, color: t.sub, marginTop: 3, lineHeight: 1.5 }}>{waiting.reason}</div>
            {/* Two different handoffs, and the footnote has to tell the truth
                about which. A sign-in is "he never sees what you typed"; an
                irreversible button is nothing of the sort — nothing is typed,
                and saying so on a Submit card would be reassurance about a
                thing that did not happen. */}
            <div style={{ fontSize: 12.5, color: t.muted, marginTop: 6 }}>
              {/credential|sign in/i.test(waiting.reason || '')
                ? 'Do that bit yourself on your computer. He carries on from there — he never sees what you typed.'
                : 'He has filled everything in. Read it over and click it yourself on your computer.'}
            </div>
          </div>
        </div>
      )}

      {/* 2. An ask-first */}
      {asking && (
        <div style={{
          background: t.card, border: `1px solid ${t.amber}55`, borderRadius: 12,
          padding: '12px 14px', marginBottom: 9,
        }}>
          <div style={{ display: 'flex', gap: 11, alignItems: 'flex-start' }}>
            <ShieldQuestion size={19} style={{ color: t.amber, flexShrink: 0, marginTop: 1 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: t.ink }}>May he do this?</div>
              <div style={{ fontSize: 13.5, color: t.ink, marginTop: 4 }}>{describeAction(asking)}</div>
              {asking.reason && <div style={{ fontSize: 12.5, color: t.sub, marginTop: 3 }}>{asking.reason}</div>}
              {asking.expires_at && (
                <div style={{ fontSize: 11.5, color: t.muted, marginTop: 4 }}>
                  Asked by standing work, so it lapses if nobody answers.
                </div>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 7, marginTop: 11, flexWrap: 'wrap' }}>
            <button onClick={() => answer('approve', asking, false)} disabled={busy} style={btn(t.accent, '#fff')}>
              <Check size={14} /> Allow once
            </button>
            <button onClick={() => answer('approve', asking, true)} disabled={busy} style={btn(t.addBg, t.add)}>
              <InfinityIcon size={14} /> Always allow this
            </button>
            <button onClick={() => answer('deny', asking, false)} disabled={busy} style={btn(t.rmBg, t.rm)}>
              <X size={14} /> No
            </button>
          </div>
          <div style={{ fontSize: 11.5, color: t.muted, marginTop: 7 }}>
            “Always” covers {asking.app}{asking.host && asking.host !== '*' ? ` on ${asking.host}` : ''} only — nothing else.
          </div>
        </div>
      )}

      {err && (
        <div style={{ background: t.rmBg, color: t.rm, borderRadius: 9, padding: '8px 11px', fontSize: 12.5, marginBottom: 9 }}>{err}</div>
      )}

      {/* 3. The record */}
      {!!recent.length && (
        <div style={{
          background: t.card2, border: `1px solid ${t.line}`, borderRadius: 11, padding: '9px 12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 5 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: t.sub, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Monitor size={13} /> On {c.session.device_label || 'your computer'}
            </span>
            <Link to="/agents/arnie/computer" style={{ fontSize: 11.5, color: t.accent, fontWeight: 600, textDecoration: 'none' }}>
              All of it
            </Link>
          </div>
          {recent.map((a) => (
            <div key={a.id} style={{ display: 'flex', gap: 7, alignItems: 'baseline', fontSize: 12.5, color: t.sub, padding: '2px 0' }}>
              <span style={{
                width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                background: a.decision === 'allowed' ? t.add : a.decision === 'refused' ? t.rm : t.muted,
              }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                {describeAction(a)}
                {a.decision !== 'allowed' && <em style={{ color: t.muted }}> — {a.decision === 'expired' ? 'lapsed' : a.decision}</em>}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const btn = (bg, fg) => ({
  display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer',
  background: bg, color: fg, border: '1px solid transparent',
  borderRadius: 8, padding: '7px 11px', fontSize: 12.5, fontWeight: 600, minHeight: 36,
})
