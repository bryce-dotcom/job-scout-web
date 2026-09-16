import { useEffect, useState } from 'react'
import { Sun, Mail, MessageSquare, Check, AlertTriangle } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useStore } from '../../../lib/store'

// Have the morning brief sent instead of asked for. One row per person in
// arnie_brief_subscriptions; a person edits their own (a DB guard refuses
// anyone else's below admin). The hour is theirs, in their browser's zone,
// and the send is done by the arnie-brief-push cron every hour on the hour.
//
// This renders for EVERY role — a tech wants "what's my day" at 6am at least
// as much as an owner does — which is why it sits above the manager gate on
// the settings page rather than inside it.

const t = {
  ink: '#2c3530', sub: '#4d5a52', muted: '#7d8a7f', line: '#d6cdb8', card: '#ffffff',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.10)', amber: '#b45309', amberBg: 'rgba(234,179,8,0.10)', ok: '#2f7d4e',
}

export default function MorningBriefSettings() {
  const user = useStore((s) => s.user)
  const companyId = useStore((s) => s.companyId)
  const [sub, setSub] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [saved, setSaved] = useState(false)

  let browserTz = 'America/Denver'
  try { browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone || browserTz } catch { /* keep default */ }
  const hasPhone = !!String(user?.phone || '').replace(/\D/g, '').match(/\d{10}/)

  useEffect(() => {
    if (!user?.id || !companyId) return
    let live = true
    ;(async () => {
      const { data } = await supabase.from('arnie_brief_subscriptions').select('*').eq('employee_id', user.id).maybeSingle()
      if (live) setSub(data || { enabled: false, channel: 'email', hour_local: 6, timezone: browserTz, weekdays_only: true, nudges: true, _new: true })
    })()
    return () => { live = false }
  }, [user?.id, companyId])

  const save = async (patch) => {
    if (!sub || !user?.id || !companyId) return
    setBusy(true); setError(null); setSaved(false)
    const next = { ...sub, ...patch, timezone: browserTz }
    const row = { company_id: companyId, employee_id: user.id, enabled: next.enabled, channel: next.channel, hour_local: next.hour_local, timezone: next.timezone, weekdays_only: next.weekdays_only, nudges: next.nudges !== false, updated_at: new Date().toISOString() }
    const { data, error: e } = await supabase.from('arnie_brief_subscriptions').upsert(row, { onConflict: 'employee_id' }).select().maybeSingle()
    setBusy(false)
    if (e) { setError(e.message); return }
    setSub(data || next); setSaved(true); setTimeout(() => setSaved(false), 1800)
  }

  if (!sub) return null
  const hourLabel = (h) => `${((h + 11) % 12) + 1}:00 ${h < 12 ? 'AM' : 'PM'}`

  return (
    <div style={{ background: t.card, border: `1px solid ${t.line}`, borderRadius: 12, padding: 16, marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <Sun size={18} color={t.accent} />
        <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: t.ink }}>Morning brief</h2>
        <label style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: t.sub, cursor: 'pointer', minHeight: 44 }}>
          <input type="checkbox" checked={!!sub.enabled} disabled={busy} onChange={(e) => save({ enabled: e.target.checked })} style={{ width: 18, height: 18 }} />
          Send it to me
        </label>
      </div>
      <p style={{ color: t.sub, fontSize: 13.5, margin: '0 0 12px', lineHeight: 1.5 }}>
        What needs your attention today — your jobs, an open shift, what you're owed{user?.user_role && /admin|manager|owner/i.test(user.user_role) ? ', and the team’s day' : ''} — sent by Arnie before you open the app. Same brief as asking him "what does my day look like".
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, opacity: sub.enabled ? 1 : 0.55 }}>
        <div>
          <div style={{ fontSize: 12, color: t.muted, marginBottom: 4 }}>How</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {[['email', Mail, 'Email'], ['sms', MessageSquare, 'Text']].map(([ch, Icon, label]) => {
              const on = sub.channel === ch
              const off = ch === 'sms' && !hasPhone
              return (
                <button key={ch} type="button" disabled={busy || !sub.enabled || off} onClick={() => save({ channel: ch })}
                  title={off ? 'Add a mobile number to your employee record to get texts' : undefined}
                  style={{ flex: 1, minHeight: 44, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: off ? 'not-allowed' : 'pointer',
                    background: on ? t.accent : t.accentBg, color: on ? '#fff' : t.ink, border: `1px solid ${on ? t.accent : t.line}`, opacity: off ? 0.5 : 1 }}>
                  <Icon size={14} /> {label}
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: t.muted, marginBottom: 4 }}>When ({browserTz.replace(/_/g, ' ')})</div>
          <select value={sub.hour_local} disabled={busy || !sub.enabled} onChange={(e) => save({ hour_local: Number(e.target.value) })}
            style={{ width: '100%', minHeight: 44, padding: '8px 10px', borderRadius: 8, border: `1px solid ${t.line}`, background: '#fff', color: t.ink, fontSize: 14 }}>
            {[4, 5, 6, 7, 8, 9, 10].map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 12, color: t.muted, marginBottom: 4 }}>Days</div>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: t.ink, minHeight: 44, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!sub.weekdays_only} disabled={busy || !sub.enabled} onChange={(e) => save({ weekdays_only: e.target.checked })} style={{ width: 18, height: 18 }} />
            Weekdays only
          </label>
        </div>
      </div>

      {/* The nudge rides on the brief's channel and hours: same person, same
          phone or inbox, same zone. Off here means Arnie waits for the brief. */}
      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 12, fontSize: 13.5, color: t.ink, cursor: 'pointer' }}>
        <input type="checkbox" checked={sub.nudges !== false} disabled={busy || !sub.enabled} onChange={(e) => save({ nudges: e.target.checked })} style={{ width: 18, height: 18, marginTop: 2 }} />
        <span>
          <span style={{ fontWeight: 600 }}>Nudges between briefs</span>
          <span style={{ display: 'block', fontSize: 12.5, color: t.muted, marginTop: 2 }}>
            A quote that has gone quiet ten days, an invoice that just tipped overdue, your own shift still open at night — one message when it happens, 7am to 9pm your time, never the same thing twice.
          </span>
        </span>
      </label>

      <div style={{ marginTop: 10, fontSize: 12.5, color: t.muted, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minHeight: 20 }}>
        {saved && <span style={{ color: t.ok, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Check size={14} /> Saved</span>}
        {error && <span style={{ color: t.amber, display: 'inline-flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={14} /> {error}</span>}
        {!saved && !error && sub.last_sent_on && <span>Last sent {sub.last_sent_on}.</span>}
        {!saved && !error && sub.last_error && <span style={{ color: t.amber }}>Last attempt failed: {sub.last_error}</span>}
        {!saved && !error && sub.enabled && !sub.last_sent_on && !sub._new && <span>First one goes out at {hourLabel(sub.hour_local)}.</span>}
      </div>
    </div>
  )
}
