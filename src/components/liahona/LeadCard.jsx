// The card that opens when a rep taps a pin: who it is, how to reach them,
// the stage chips (one tap moves the lead, Won/Lost open the board's dialogs),
// and a one-tap knock log that writes a lead_follow_ups row like the board's
// follow-up strip does. Open lead / Neighbors / Directions along the bottom.

import { useState } from 'react'
import { X, Phone, Mail, MapPin, ExternalLink, Clover, Navigation, Loader2, DoorClosed, MessageCircle, StickyNote, CalendarClock, Building2, CalendarPlus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useStore } from '../../lib/store'
import { buildFollowUpRow, snoozeToIso, shortDate } from '../../lib/followUps'
import { bookAppointment } from '../../lib/bookAppointment'
import { fromZonedInput, toZonedInput, formatZonedDateTime, DEFAULT_TZ } from '../../lib/dateTz'
import { makeStyles, minutesAgo } from './util'

// Tomorrow 10:00 in the company's zone, as a datetime-local value.
const defaultStart = () => { const d = new Date(Date.now() + 86400e3); d.setHours(10, 0, 0, 0); return toZonedInput(d.toISOString(), DEFAULT_TZ) }

const ago = iso => { const m = minutesAgo(iso); return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago` }

const KNOCKS = [
  { id: 'not_home', label: 'Not home', icon: DoorClosed, note: 'Knocked: not home', days: 2 },
  { id: 'talked', label: 'Talked', icon: MessageCircle, note: 'Knocked: talked to them', days: null },
  { id: 'left_card', label: 'Left card', icon: StickyNote, note: 'Knocked: left a card', days: 3 },
  { id: 'callback', label: 'Callback', icon: CalendarClock, note: 'Knocked: asked for a callback', days: 1 }
]

export default function LeadCard({ t, lead, stages, stageById, followUps = [], employeeById, employees = [], companyId, employeeId, changingStage, onChangeStage, onOpen, onNeighbors, onPan, onClose, onLogged, onError, onBooked }) {
  const { btn, input, label } = makeStyles(t)
  const company = useStore(s => s.company)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(null)
  const [booking, setBooking] = useState(false)   // the appointment form is open
  const [apt, setApt] = useState(() => ({ start: defaultStart(), duration: 60, rep: String(lead.lead_owner_id || lead.salesperson_id || employeeId || ''), notes: '' }))
  const [saving, setSaving] = useState(false)

  const book = async () => {
    if (!apt.start || !apt.rep) { onError?.('Pick a time and a rep'); return }
    setSaving(true)
    const { error } = await bookAppointment({
      companyId, company, lead, setterId: employeeId || null,
      startTime: fromZonedInput(apt.start, DEFAULT_TZ), durationMinutes: Number(apt.duration) || 60,
      salespersonIds: [Number(apt.rep)], notes: apt.notes || null
    })
    setSaving(false)
    if (error) { onError?.('Could not book: ' + error.message); return }
    setBooking(false)
    onBooked?.(apt)
  }
  const stage = stageById[lead.status]
  const owner = employeeById[lead.lead_owner_id] || employeeById[lead.salesperson_id]
  const latest = followUps[0]
  const name = lead.customer_name || lead.business_name || 'Lead'

  const log = async k => {
    const row = buildFollowUpRow({ companyId, leadId: lead.id, employeeId, method: 'visit', note: [k.note, note.trim()].filter(Boolean).join(' · '), nextFollowUpAt: k.days ? snoozeToIso(k.days) : null })
    if (!row) return
    setBusy(k.id)
    const { error } = await supabase.from('lead_follow_ups').insert(row)
    setBusy(null)
    if (error) { onError?.('Could not log that: ' + error.message); return }
    setNote('')
    onLogged?.(k)
  }

  const directions = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(lead.latitude != null ? `${lead.latitude},${lead.longitude}` : lead.address || '')}`

  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: t.text, overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
          {lead.business_name && lead.customer_name && <div style={{ fontSize: 12, color: t.textSecondary, display: 'flex', alignItems: 'center', gap: 4 }}><Building2 size={11} /> {lead.business_name}</div>}
          <div style={{ marginTop: 3, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, color: '#fff', background: stage?.color || '#71717a', padding: '2px 8px', borderRadius: 10 }}>{stage?.name || lead.status}</div>
          {owner?.name && <span style={{ fontSize: 11, color: t.textMuted, marginLeft: 8 }}>{owner.name}</span>}
        </div>
        <button onClick={onClose} style={btn(false, { padding: 4 })} title="Close"><X size={13} /></button>
      </div>

      <div style={{ marginTop: 8, display: 'grid', gap: 4, fontSize: 13 }}>
        {lead.address && <a onClick={e => { e.preventDefault(); onPan?.() }} href="#" style={{ color: t.text, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}><MapPin size={13} color={t.textMuted} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.address}</span></a>}
        {lead.phone && <a href={`tel:${lead.phone}`} style={{ color: t.accent, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}><Phone size={13} /> {lead.phone}</a>}
        {lead.email && <a href={`mailto:${lead.email}`} style={{ color: t.accent, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}><Mail size={13} /> <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.email}</span></a>}
      </div>

      {latest && (
        <div style={{ marginTop: 8, fontSize: 12, color: t.textSecondary, padding: '6px 8px', borderRadius: 6, background: t.bg }}>
          Last touch {ago(latest.contacted_at)}{latest.note ? ` · ${latest.note}` : ''}{latest.next_follow_up_at ? ` · next ${shortDate(latest.next_follow_up_at)}` : ''}
          {followUps.length > 1 && <span style={{ color: t.textMuted }}> · {followUps.length} touches</span>}
        </div>
      )}

      <div style={{ fontSize: 11, fontWeight: 600, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '.05em', margin: '12px 0 4px' }}>Stage</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {stages.map(s => {
          const on = s.id === lead.status
          return (
            <button key={s.id} disabled={!!changingStage} onClick={() => !on && onChangeStage?.(lead, s.id)}
              style={btn(on, { padding: '5px 9px', minHeight: 44, ...(on ? { backgroundColor: s.color, borderColor: s.color } : { color: s.color, borderColor: s.color + '66' }) })}>
              {changingStage === s.id ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : null}{s.name}
            </button>
          )
        })}
      </div>

      {lead.appointment_time && !booking && (
        <div style={{ marginTop: 8, fontSize: 12, color: t.textSecondary, display: 'flex', alignItems: 'center', gap: 6 }}><CalendarClock size={12} /> Appointment {formatZonedDateTime(lead.appointment_time, DEFAULT_TZ)}{lead.salesperson_id && employeeById[lead.salesperson_id] ? ` · ${employeeById[lead.salesperson_id].name}` : ''}</div>
      )}
      {booking ? (
        <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, border: `1px solid ${t.border}`, background: t.bg }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <strong style={{ fontSize: 12, color: t.text }}>Set appointment</strong>
            <button onClick={() => setBooking(false)} style={btn(false, { padding: 3 })}><X size={12} /></button>
          </div>
          <label style={label}>When (Mountain time)</label>
          <input type="datetime-local" value={apt.start} onChange={e => setApt(a => ({ ...a, start: e.target.value }))} style={input} />
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ flex: 1 }}>
              <label style={label}>Rep</label>
              <select value={apt.rep} onChange={e => setApt(a => ({ ...a, rep: e.target.value }))} style={input}>
                <option value="">Pick a rep</option>
                {employees.map(e => <option key={e.id} value={e.id}>{e.name}{String(e.id) === String(employeeId) ? ' (Me)' : ''}</option>)}
              </select>
            </div>
            <div style={{ width: 96 }}>
              <label style={label}>Length</label>
              <select value={apt.duration} onChange={e => setApt(a => ({ ...a, duration: e.target.value }))} style={input}>
                {[30, 45, 60, 90, 120].map(m => <option key={m} value={m}>{m} min</option>)}
              </select>
            </div>
          </div>
          <label style={label}>Notes</label>
          <input value={apt.notes} onChange={e => setApt(a => ({ ...a, notes: e.target.value }))} placeholder="Gate code, who to ask for…" style={input} />
          <button onClick={book} disabled={saving} style={btn(true, { marginTop: 8, width: '100%', justifyContent: 'center', boxSizing: 'border-box', minHeight: 44 })}>
            {saving ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <CalendarPlus size={13} />} Book it
          </button>
        </div>
      ) : (
        <button onClick={() => setBooking(true)} style={btn(false, { marginTop: 10, width: '100%', justifyContent: 'center', boxSizing: 'border-box', minHeight: 44 })}><CalendarPlus size={13} /> Set appointment</button>
      )}

      <div style={{ fontSize: 11, fontWeight: 600, color: t.textMuted, textTransform: 'uppercase', letterSpacing: '.05em', margin: '12px 0 4px' }}>Log a knock</div>
      <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional): who answered, what they said…" style={{ ...input, marginBottom: 6 }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4 }}>
        {KNOCKS.map(k => (
          <button key={k.id} disabled={!!busy} onClick={() => log(k)} style={btn(false, { justifyContent: 'center', minHeight: 44 })} title={k.days ? `Logs the visit and asks you to come back in ${k.days} day${k.days > 1 ? 's' : ''}` : 'Logs the visit'}>
            {busy === k.id ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <k.icon size={13} />} {k.label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
        <button onClick={onOpen} style={btn(true, { flex: 1, justifyContent: 'center', minHeight: 44 })}><ExternalLink size={13} /> Open lead</button>
        <button onClick={onNeighbors} style={btn(false, { justifyContent: 'center', minHeight: 44, color: '#15803d', borderColor: '#15803d' })} title="The parcels around this pin"><Clover size={13} /> Neighbors</button>
        <a href={directions} target="_blank" rel="noreferrer" style={btn(false, { justifyContent: 'center', minHeight: 44, textDecoration: 'none' })} title="Directions in Google Maps"><Navigation size={13} /></a>
      </div>
    </div>
  )
}
