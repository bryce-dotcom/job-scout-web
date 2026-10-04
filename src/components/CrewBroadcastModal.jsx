// Send one message to the crew.
//
// Bryce (d6a848b5): "Tried to send all 14 field crew a note about clocking in/out
// and leaving location on. There is no way to do it from the app."
//
// This composes; it does not invent a channel. employee_notifications rows are
// addressed to a person and wait until read, and MyNotifications already lists
// the unread ones at the top of Field Scout — the screen a tech actually opens.
// The rules (who, what stops a send, the rows) are in lib/crewBroadcast.

import { useMemo, useState } from 'react'
import { X, Send, Users, Megaphone } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { toast } from '../lib/toast'
import {
  rosterTitles, broadcastRecipients, broadcastProblem, broadcastRows, broadcastKey,
} from '../lib/crewBroadcast'

export default function CrewBroadcastModal({ theme, employees, onClose }) {
  const companyId = useStore((s) => s.companyId)
  const user = useStore((s) => s.user)
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [titles, setTitles] = useState([])      // empty = everyone
  const [sending, setSending] = useState(false)

  const available = useMemo(() => rosterTitles(employees), [employees])
  const recipients = useMemo(() => broadcastRecipients(employees, { titles }), [employees, titles])
  const problem = broadcastProblem({ title, message, recipients })

  const toggle = (t) =>
    setTitles((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]))

  const send = async () => {
    if (problem) { toast.error(problem); return }
    setSending(true)
    try {
      const rows = broadcastRows({
        companyId, recipients, title, message,
        key: broadcastKey(),
        senderName: user?.name || user?.email || null,
      })
      const { error } = await supabase.from('employee_notifications').insert(rows)
      // Say what actually happened. A send that reports success it did not have
      // is the thing that makes people stop trusting the tool.
      if (error) { toast.error('Could not send: ' + error.message); return }
      toast.success(`Sent to ${recipients.length} ${recipients.length === 1 ? 'person' : 'people'}`)
      onClose?.()
    } finally {
      setSending(false)
    }
  }

  const label = { display: 'block', fontSize: 13, fontWeight: 500, color: theme.textSecondary, marginBottom: 6 }
  const input = {
    width: '100%', padding: '10px 12px', border: `1px solid ${theme.border}`,
    borderRadius: 8, fontSize: 14, color: theme.text, backgroundColor: theme.bgCard,
    boxSizing: 'border-box',
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, backgroundColor: 'rgba(44,53,48,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ backgroundColor: theme.bgCard, borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,0.25)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 20px', borderBottom: `1px solid ${theme.border}` }}>
          <Megaphone size={20} color={theme.accent} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: theme.text }}>Message the crew</h2>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: theme.textMuted }}>
              Lands at the top of Field Scout and waits until they read it.
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, padding: 4, minHeight: 44, minWidth: 44 }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={label}>Subject</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80}
              placeholder="e.g. Clock in and out every day" style={input} />
          </div>

          <div>
            <label style={label}>Message</label>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} rows={5}
              placeholder="Leave your location on so the job board knows where you are."
              style={{ ...input, resize: 'vertical', fontFamily: 'inherit' }} />
            <div style={{ fontSize: 11, color: theme.textMuted, marginTop: 4, textAlign: 'right' }}>
              {message.length}/1000
            </div>
          </div>

          {available.length > 0 && (
            <div>
              <label style={label}>Who gets it</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <button type="button" onClick={() => setTitles([])}
                  style={chip(theme, titles.length === 0)}>Everyone</button>
                {available.map((t) => (
                  <button type="button" key={t} onClick={() => toggle(t)}
                    style={chip(theme, titles.includes(t))}>{t}</button>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', backgroundColor: theme.accentBg, borderRadius: 8, fontSize: 13, color: theme.textSecondary }}>
            <Users size={15} color={theme.accent} />
            {recipients.length === 0
              ? 'Nobody matches that selection.'
              : `Going to ${recipients.length} ${recipients.length === 1 ? 'person' : 'people'}.`}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '0 20px 20px' }}>
          <button onClick={onClose} style={{ padding: '10px 16px', minHeight: 44, backgroundColor: 'transparent', color: theme.textSecondary, border: `1px solid ${theme.border}`, borderRadius: 8, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={send} disabled={!!problem || sending}
            title={problem || undefined}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', minHeight: 44, backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: problem || sending ? 'not-allowed' : 'pointer', opacity: problem || sending ? 0.55 : 1 }}>
            <Send size={16} /> {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  )
}

function chip(theme, on) {
  return {
    padding: '6px 12px', minHeight: 36, borderRadius: 999, cursor: 'pointer',
    fontSize: 12, fontWeight: 600,
    border: `1px solid ${on ? theme.accent : theme.border}`,
    backgroundColor: on ? theme.accent : 'transparent',
    color: on ? '#fff' : theme.textSecondary,
  }
}
