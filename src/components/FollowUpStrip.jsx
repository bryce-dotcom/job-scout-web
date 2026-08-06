import { useState } from 'react'
import { Phone, Mail, MessageSquare, Calendar, StickyNote, ChevronDown, ChevronUp } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import {
  buildFollowUpRow, stripSummary, snoozeToIso, shortDate, resolveFollowUpTarget,
  attemptCount, historyFor, SNOOZE_PRESETS,
  followUpSchedule, FOLLOW_UP_COLORS, FU_OVERDUE, FU_TODAY, FU_UPCOMING, FU_NONE,
} from '../lib/followUps'

// Follow-up lives ON the deal card, in its real stage. An earlier build pulled
// these into a separate Follow-up column; that read as duplication and lost
// the deal's context. The card already tells you who and how much — this adds
// when you last chased it and lets you chase it again without leaving the
// board.
//
// Collapsed it is one line, so a column of twenty cards stays scannable.
// Expanded it dials, shows the last two touches, and sets the next date.
//
// The button DIALS. A "Call" button that only writes a database row is a lie,
// and that was the worst flaw in the first version.

export default function FollowUpStrip({
  theme, lead, rows = [], companyId, employeeId, defaultTwoWeeks = true, onLogged, compact = false,
}) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState('')

  // NEVER the card id. Cards carry synthetic ids (quote-4533, job-12785)
  // because one lead produces several of them, and passing one into lead_id
  // gave "invalid input syntax for type bigint". lib/followUps owns the rule.
  const { leadId, jobId } = resolveFollowUpTarget(lead)
  const history = historyFor(rows, leadId, 2)
  const latest = history[0] || null
  const attempts = attemptCount(rows, leadId)
  const summary = stripSummary(latest)

  const phone = lead?.phone || lead?.customer?.phone || null
  const email = lead?.email || lead?.customer?.email || null
  const contact = (lead?.customer_name || '').split(' ')[0] || 'them'

  // The mobile board passes a SLIMMER theme object than the desktop one —
  // it has no error / accentBg / textSecondary. Reading those straight
  // through would paint undefined colours on every phone, which the build
  // cannot catch. Fall back rather than requiring both themes to match.
  const t = {
    bg: theme.bg, bgCard: theme.bgCard, border: theme.border,
    text: theme.text, accent: theme.accent,
    textMuted: theme.textMuted || '#7d8a7f',
    textSecondary: theme.textSecondary || theme.textMuted || '#4d5a52',
    error: theme.error || '#ef4444',
    accentBg: theme.accentBg || 'rgba(90,99,73,0.12)',
  }

  const TONES = {
    danger: { bg: 'rgba(239,68,68,0.10)', fg: t.error, line: 'rgba(239,68,68,0.30)' },
    warning: { bg: 'rgba(234,179,8,0.10)', fg: '#854F0B', line: 'rgba(234,179,8,0.30)' },
    ok: { bg: t.bg, fg: t.textSecondary, line: t.border },
    idle: { bg: t.bg, fg: t.textMuted, line: t.border },
  }

  // Traffic light on the SCHEDULED date — red past due, green due today,
  // yellow coming up. This beats the cold/aging summary whenever a rep has
  // actually set a date, because that date is the commitment they made and
  // the thing they scan the board for. followUpSchedule is shared with the
  // appointments calendar so a deal cannot be one colour here and another
  // there.
  const sched = followUpSchedule(latest?.next_follow_up_at)
  const SCHED_TONES = {
    [FU_OVERDUE]: { bg: 'rgba(239,68,68,0.12)', fg: '#b91c1c', line: FOLLOW_UP_COLORS[FU_OVERDUE] },
    [FU_TODAY]: { bg: 'rgba(34,197,94,0.12)', fg: '#15803d', line: FOLLOW_UP_COLORS[FU_TODAY] },
    [FU_UPCOMING]: { bg: 'rgba(234,179,8,0.12)', fg: '#854F0B', line: FOLLOW_UP_COLORS[FU_UPCOMING] },
  }
  const scheduled = sched.state !== FU_NONE
  const tone = scheduled
    ? SCHED_TONES[sched.state]
    : (TONES[summary.tone] || TONES.idle)
  const headline = scheduled ? sched.label : summary.text
  const pulse = scheduled ? sched.state === FU_OVERDUE : summary.pulse

  // Logging and rescheduling are ONE action. The end of a call is the only
  // moment a rep will ever set the next one, so the default fires here.
  const log = async (method, { withNote = null, snoozeDays = null } = {}) => {
    const days = snoozeDays ?? (defaultTwoWeeks ? 14 : null)
    const row = buildFollowUpRow({
      companyId, leadId, jobId, employeeId, method,
      note: withNote,
      nextFollowUpAt: days ? snoozeToIso(days) : null,
    })
    if (!row) { toast.error('Could not log that'); return }
    setBusy(true)
    const { error } = await supabase.from('lead_follow_ups').insert(row)
    setBusy(false)
    if (error) { toast.error('Could not save: ' + error.message); return }
    toast.success(days ? `Logged — chase again in ${days}d` : 'Logged')
    setNote(''); setNoteOpen(false)
    onLogged?.()
  }

  const snooze = async (days) => {
    // Pushing the date is itself a touch: it records that someone decided to
    // wait, which is different from silence.
    await log('other', { withNote: `Snoozed ${days}d`, snoozeDays: days })
  }

  const stop = (e) => { e.stopPropagation() }

  const pill = {
    fontSize: '11px', padding: '4px 9px', borderRadius: '12px', cursor: 'pointer',
    border: `1px solid ${t.border}`, background: t.bgCard, color: t.textSecondary,
    minHeight: '28px', display: 'inline-flex', alignItems: 'center', gap: '3px',
  }

  return (
    <div onClick={stop} style={{ borderTop: `1px solid ${tone.line}` }}>
      <style>{`
        @keyframes fuPulse { 0%,100% { opacity: 1 } 50% { opacity: 0.35 } }
        .fu-live { animation: fuPulse 1.6s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) { .fu-live { animation: none } }
      `}</style>

      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          padding: compact ? '6px 10px' : '7px 11px',
          background: tone.bg, cursor: 'pointer', minHeight: '32px',
        }}
      >
        <span
          className={pulse ? 'fu-live' : undefined}
          style={{ width: '6px', height: '6px', borderRadius: '50%', background: tone.fg, flexShrink: 0 }}
        />
        <span style={{ fontSize: '11px', color: tone.fg, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {headline}
          {attempts > 1 && <span style={{ color: t.textMuted }}> · {attempts} attempts</span>}
        </span>
        {phone && !open && (
          <a
            href={`tel:${phone}`}
            onClick={(e) => { stop(e); log('call') }}
            style={{ color: tone.fg, display: 'inline-flex', minHeight: '28px', alignItems: 'center', padding: '0 2px' }}
            title={`Call ${contact}`}
          >
            <Phone size={14} />
          </a>
        )}
        {open ? <ChevronUp size={14} style={{ color: tone.fg }} /> : <ChevronDown size={14} style={{ color: tone.fg }} />}
      </div>

      {open && (
        <div style={{ padding: '9px 11px 11px', background: t.bgCard, borderTop: `1px solid ${t.border}` }}>
          <div style={{ display: 'flex', gap: '5px', marginBottom: '9px' }}>
            {/* All three actions are ALWAYS present, so the row never changes
                shape and a rep can't mistake missing data for a missing
                feature. Greyed = no number/address on the record. */}
            {phone ? (
              <a
                href={`tel:${phone}`}
                onClick={(e) => { stop(e); log('call') }}
                style={{
                  flex: 1, textAlign: 'center', fontSize: '12px', padding: '8px 0', borderRadius: '6px',
                  background: t.accent, color: '#fff', textDecoration: 'none',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px', minHeight: '34px',
                }}
              >
                <Phone size={13} /> Call {contact}
              </a>
            ) : (
              <span style={{
                flex: 1, textAlign: 'center', fontSize: '12px', padding: '8px 0', borderRadius: '6px',
                border: `1px solid ${t.border}`, color: t.textMuted, cursor: 'default',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px', minHeight: '34px',
              }} title="No phone number on this record">
                <Phone size={13} /> No number
              </span>
            )}
            {phone ? (
              <a href={`sms:${phone}`} onClick={(e) => { stop(e); log('text') }} style={{ ...pill, minHeight: '34px', padding: '0 10px', textDecoration: 'none' }} title={`Text ${phone}`}>
                <MessageSquare size={13} />
              </a>
            ) : (
              <span style={{ ...pill, minHeight: '34px', padding: '0 10px', opacity: 0.45, cursor: 'default' }} title="No phone number on this record">
                <MessageSquare size={13} />
              </span>
            )}
            {/* Email is always shown. Hiding it when the address is missing
                just reads as "there is no email button" — 298 of 1,720 leads
                have no address, and a rep cannot tell a missing feature from
                missing data. Present but disabled says which. */}
            {email ? (
              <a href={`mailto:${email}`} onClick={(e) => { stop(e); log('email') }} style={{ ...pill, minHeight: '34px', padding: '0 10px', textDecoration: 'none' }} title={`Email ${email}`}>
                <Mail size={13} />
              </a>
            ) : (
              <span style={{ ...pill, minHeight: '34px', padding: '0 10px', opacity: 0.45, cursor: 'default' }} title="No email address on this record">
                <Mail size={13} />
              </span>
            )}
          </div>

          {history.map((h) => (
            <div key={h.id} style={{ fontSize: '11px', color: t.textMuted, marginBottom: '3px', wordBreak: 'break-word' }}>
              {shortDate(h.contacted_at)} · {h.method}{h.note ? ` — ${h.note}` : ''}
            </div>
          ))}

          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '9px' }}>
            {SNOOZE_PRESETS.map(p => (
              <button
                key={p.id}
                disabled={busy}
                onClick={(e) => { stop(e); snooze(p.days) }}
                style={{
                  ...pill,
                  ...(p.isDefault ? { background: t.accentBg, borderColor: t.accent, color: t.accent } : {}),
                  opacity: busy ? 0.5 : 1,
                }}
                title={`Chase again in ${p.days} days`}
              >
                {p.label}
              </button>
            ))}
            <button onClick={(e) => { stop(e); setNoteOpen(v => !v) }} style={pill} title="Log with a note">
              <StickyNote size={12} /> Note
            </button>
            {latest?.next_follow_up_at && (
              <span style={{ ...pill, cursor: 'default', borderStyle: 'dashed' }}>
                <Calendar size={12} /> {shortDate(latest.next_follow_up_at)}
              </span>
            )}
          </div>

          {noteOpen && (
            <div style={{ display: 'flex', gap: '5px', marginTop: '8px' }}>
              <input
                autoFocus
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onClick={stop}
                onKeyDown={(e) => { if (e.key === 'Enter') { stop(e); log('call', { withNote: note }) } }}
                placeholder="What happened?"
                style={{
                  flex: 1, minWidth: 0, minHeight: '32px', padding: '0 8px', fontSize: '12px',
                  borderRadius: '6px', border: `1px solid ${t.border}`, background: t.bg, color: t.text,
                }}
              />
              <button
                onClick={(e) => { stop(e); log('call', { withNote: note }) }}
                disabled={busy}
                style={{ ...pill, background: t.accent, color: '#fff', borderColor: t.accent }}
              >
                Save
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
