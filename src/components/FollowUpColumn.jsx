import { useState } from 'react'
import { Phone, Mail, MessageSquare, PhoneMissed, MapPin, Plus, Check, Flame, CalendarClock, CircleDashed } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { toast } from '../lib/toast'
import { buildFollowUpRow, COLD, DUE, UNTOUCHED, AGING } from '../lib/followUps'

// An OVERLAY column: these deals are still sitting in their real stage. This
// is a worklist of who needs a touch, sorted worst-first.
//
// The one-tap chips are the point. The fields this replaces
// (leads.last_contact_at, callback_notes) were populated on 6 and 0 of 1,716
// leads because logging meant opening the lead and typing into a date field.
// If logging ever costs more than one tap, this column empties out too.

const ICONS = { call: Phone, email: Mail, text: MessageSquare, voicemail: PhoneMissed, visit: MapPin }
const QUICK = ['call', 'email', 'text']

export default function FollowUpColumn({ theme, cards = [], companyId, employeeId, onLogged, onOpen }) {
  const [busyId, setBusyId] = useState(null)
  const [noteFor, setNoteFor] = useState(null)
  const [noteText, setNoteText] = useState('')

  const stripe = (state) => (
    state === COLD ? theme.error
      : state === DUE ? theme.warning
        : state === UNTOUCHED ? theme.border
          : state === AGING ? theme.warning
            : theme.success
  )
  const tone = (state) => (
    state === COLD ? theme.error
      : state === DUE ? theme.warning
        : state === UNTOUCHED ? theme.textMuted
          : theme.success
  )
  const StateIcon = (state) => (state === COLD ? Flame : state === DUE ? CalendarClock : state === UNTOUCHED ? CircleDashed : Check)

  const log = async (card, method, note) => {
    const row = buildFollowUpRow({
      companyId,
      leadId: card._isJob ? null : card.id,
      jobId: card._isJob ? card._jobId : null,
      employeeId, method, note,
    })
    if (!row) { toast.error('Could not log that follow-up'); return }
    setBusyId(card.id)
    const { error } = await supabase.from('lead_follow_ups').insert(row)
    setBusyId(null)
    if (error) { toast.error('Could not save: ' + error.message); return }
    toast.success(`Logged — ${card.customer_name || 'deal'}`)
    setNoteFor(null); setNoteText('')
    onLogged?.()
  }

  const money = (n) => '$' + (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 })
  const total = cards.reduce((s, c) => s + (Number(c._amount) || 0), 0)

  const chip = {
    minHeight: '28px', padding: '3px 9px', borderRadius: '14px', cursor: 'pointer',
    background: theme.bgCard, border: `1px solid ${theme.border}`, color: theme.textSecondary,
    fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: theme.warning, flexShrink: 0 }} />
          <span style={{ fontSize: '13px', fontWeight: 600, color: theme.text }}>Follow-up</span>
          {cards.length > 0 && (
            <span style={{
              minWidth: '18px', height: '18px', borderRadius: '9px', background: theme.warning,
              color: '#fff', fontSize: '10px', fontWeight: 600, display: 'inline-flex',
              alignItems: 'center', justifyContent: 'center', padding: '0 5px',
            }}>{cards.length}</span>
          )}
        </div>
        {total > 0 && (
          <span style={{ fontSize: '11px', fontWeight: 600, color: theme.textSecondary, whiteSpace: 'nowrap' }}>
            {money(total)}
          </span>
        )}
      </div>
      <div style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '8px' }}>
        {cards.length ? 'Coldest first' : ''}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px', minHeight: 0 }}>
        {cards.length === 0 && (
          <div style={{
            padding: '14px 12px', border: `1px dashed ${theme.border}`, borderRadius: '8px',
            color: theme.textMuted, fontSize: '12px', lineHeight: 1.5,
          }}>
            Everyone&apos;s been touched recently. Deals show up here once they go quiet, or when a
            callback you set comes round.
          </div>
        )}

        {cards.map((card) => {
          const f = card._followUp || {}
          const Icon = StateIcon(f.state)
          const last = f.latest
          return (
            <div key={card.id} style={{
              background: theme.bgCard, border: `1px solid ${theme.border}`,
              borderLeft: `3px solid ${stripe(f.state)}`, padding: '9px 11px',
            }}>
              <div
                onClick={() => onOpen?.(card)}
                style={{ cursor: onOpen ? 'pointer' : 'default', display: 'flex', justifyContent: 'space-between', gap: '8px' }}
              >
                <span style={{
                  fontSize: '13px', fontWeight: 600, color: theme.text,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                  {card.customer_name || card.business_name || 'Untitled'}
                </span>
                {Number(card._amount) > 0 && (
                  <span style={{ fontSize: '12px', color: theme.textSecondary, whiteSpace: 'nowrap' }}>
                    {money(card._amount)}
                  </span>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '5px', flexWrap: 'wrap' }}>
                <Icon size={13} style={{ color: tone(f.state), flexShrink: 0 }} />
                <span style={{ fontSize: '11px', color: tone(f.state) }}>{f.label}</span>
                {/* Where it actually sits — this column never moves a deal. */}
                <span style={{ fontSize: '11px', color: theme.textMuted }}>· {card.status}</span>
              </div>

              {last?.note && (
                <p style={{
                  fontSize: '12px', color: theme.textSecondary, margin: '5px 0 0',
                  lineHeight: 1.4, wordBreak: 'break-word',
                }}>
                  &ldquo;{last.note}&rdquo;
                </p>
              )}

              {noteFor === card.id ? (
                <div style={{ marginTop: '7px', display: 'flex', gap: '5px' }}>
                  <input
                    autoFocus
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') log(card, noteFor._method || 'call', noteText) }}
                    placeholder="What happened? (optional)"
                    style={{
                      flex: 1, minWidth: 0, minHeight: '32px', padding: '0 8px', fontSize: '12px',
                      borderRadius: '6px', border: `1px solid ${theme.border}`,
                      background: theme.bg, color: theme.text,
                    }}
                  />
                  <button onClick={() => log(card, 'call', noteText)} style={{ ...chip, background: theme.accent, color: '#fff', borderColor: theme.accent }}>
                    Save
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: '4px', marginTop: '7px', flexWrap: 'wrap' }}>
                  {QUICK.map((m) => {
                    const MIcon = ICONS[m]
                    return (
                      <button
                        key={m}
                        disabled={busyId === card.id}
                        onClick={() => log(card, m, null)}
                        style={{ ...chip, opacity: busyId === card.id ? 0.5 : 1 }}
                        title={`Log a ${m}`}
                      >
                        <MIcon size={12} />
                        {m === 'call' ? 'Call' : m === 'email' ? 'Email' : 'Text'}
                      </button>
                    )
                  })}
                  <button
                    onClick={() => { setNoteFor(card.id); setNoteText('') }}
                    style={{ ...chip, background: theme.accentBg, borderColor: theme.accent, color: theme.accent }}
                    title="Log with a note"
                  >
                    <Plus size={12} /> Note
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
