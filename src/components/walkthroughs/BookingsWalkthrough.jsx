// Bookings walkthrough — public booking page through auto-created lead.
// Source: src/lib/featureKnowledge/bookings.js

import { motion, AnimatePresence } from 'framer-motion'
import { CalendarDays, Clock, CheckCircle, User, Phone, Mail, ChevronRight, Star, MapPin } from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/bookings.js'

const T = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

const TIME_SLOTS = [
  { time: '9:00 AM',  available: true,  selected: false },
  { time: '10:30 AM', available: true,  selected: true  },
  { time: '2:00 PM',  available: true,  selected: false },
  { time: '3:30 PM',  available: true,  selected: false },
]

const CAL_DAYS = [
  { d: 'Mon', n: 9,  avail: true  },
  { d: 'Tue', n: 10, avail: true  },
  { d: 'Wed', n: 11, avail: false },
  { d: 'Thu', n: 12, avail: true  },
  { d: 'Fri', n: 13, avail: true  },
  { d: 'Sat', n: 14, avail: false },
]

const SALES_PEOPLE = [
  {
    name: 'Doug Anderson',
    initials: 'DA',
    slots: [
      { hour: '8', label: '8 AM',  free: true  },
      { hour: '9', label: '9 AM',  free: true  },
      { hour: '10', label: '10 AM', free: false },
      { hour: '11', label: '11 AM', free: false },
      { hour: '12', label: '12 PM', free: false },
      { hour: '13', label: '1 PM',  free: true  },
      { hour: '14', label: '2 PM',  free: true  },
      { hour: '15', label: '3 PM',  free: true  },
    ],
  },
  {
    name: 'Linda Park',
    initials: 'LP',
    slots: [
      { hour: '8', label: '8 AM',  free: false },
      { hour: '9', label: '9 AM',  free: true  },
      { hour: '10', label: '10 AM', free: true  },
      { hour: '11', label: '11 AM', free: true  },
      { hour: '12', label: '12 PM', free: false },
      { hour: '13', label: '1 PM',  free: false },
      { hour: '14', label: '2 PM',  free: true  },
      { hour: '15', label: '3 PM',  free: false },
    ],
  },
  {
    name: 'Tracy Benson',
    initials: 'TB',
    slots: [
      { hour: '8', label: '8 AM',  free: true  },
      { hour: '9', label: '9 AM',  free: false },
      { hour: '10', label: '10 AM', free: false },
      { hour: '11', label: '11 AM', free: true  },
      { hour: '12', label: '12 PM', free: true  },
      { hour: '13', label: '1 PM',  free: true  },
      { hour: '14', label: '2 PM',  free: false },
      { hour: '15', label: '3 PM',  free: true  },
    ],
  },
]

const MOCK_LEADS = [
  { id: 1, name: 'Jordan Reyes',  source: 'Booking', salesperson: 'Doug Anderson', appt: 'In 2 days', status: 'New',     isNew: true  },
  { id: 2, name: 'Sarah Chen',    source: 'Website',  salesperson: 'Linda Park',    appt: 'Jun 15',    status: 'Called',  isNew: false },
  { id: 3, name: 'Marcus Okafor', source: 'Referral', salesperson: 'Tracy Benson',  appt: 'Jun 17',    status: 'Quoted',  isNew: false },
  { id: 4, name: 'Amy Nguyen',    source: 'Google',   salesperson: 'Doug Anderson', appt: 'Jun 18',    status: 'Called',  isNew: false },
  { id: 5, name: 'Kevin Walsh',   source: 'Booking', salesperson: 'Linda Park',    appt: 'Jun 20',    status: 'New',     isNew: false },
]

const STATUS_COLORS = {
  'New':    { bg: 'rgba(59,130,246,0.12)', text: '#3b82f6' },
  'Called': { bg: 'rgba(234,179,8,0.12)',  text: '#c28b38' },
  'Quoted': { bg: 'rgba(34,197,94,0.12)',  text: '#22c55e' },
}

export default function BookingsWalkthrough() {
  const runner = useWalkthroughRunner(card)
  const { phase, sceneKey, sceneElapsed, setupIdx, setupShowingIntro,
    elapsed, totalMs, totalMarketingMs, voiceOn, setVoiceOn, replay } = runner

  return (
    <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', background: T.bg, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        {phase === 'marketing' && <Stage scene={sceneKey} />}
        <AnimatePresence mode="wait">
          {phase === 'setup' && setupShowingIntro && <SetupIntro key="intro" />}
          {phase === 'setup' && !setupShowingIntro && (
            <CenteredOverlay key="checklist">
              <SetupChecklist title={`Set it up in ${card.setup.steps.length} steps`} steps={card.setup.steps} currentIdx={setupIdx} />
            </CenteredOverlay>
          )}
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Booked automatically." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene }) {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', fontSize: '11px', fontFamily: 'system-ui, sans-serif', color: T.text, padding: '12px 14px', gap: '8px', overflow: 'hidden' }}>
      {scene === 'page'    && <ScenePage />}
      {scene === 'slots'   && <SceneSlots />}
      {scene === 'confirm' && <SceneConfirm />}
      {scene === 'lead'    && <SceneLead />}
    </div>
  )
}

function ScenePage() {
  return (
    <div style={{ flex: 1, display: 'flex', gap: '10px', overflow: 'hidden' }}>
      <div style={{ flex: 1, backgroundColor: T.bgCard, borderRadius: '12px', border: `1px solid ${T.border}`, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px', overflow: 'hidden' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', paddingBottom: '8px', borderBottom: `1px solid ${T.border}` }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', backgroundColor: T.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Star size={14} style={{ color: T.accent }} />
          </div>
          <div style={{ fontSize: '13px', fontWeight: '700', color: T.text }}>Horizon Home Services</div>
          <div style={{ fontSize: '9px', color: T.textMuted, display: 'flex', alignItems: 'center', gap: '3px' }}>
            <MapPin size={8} style={{ color: T.textMuted }} />Salt Lake City, UT
          </div>
        </div>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '14px', fontWeight: '700', color: T.text }}>Book a Sales Consultation</div>
          <div style={{ fontSize: '9px', color: T.textMuted, marginTop: '2px' }}>Choose a service, date, and time that works for you</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ fontSize: '9px', fontWeight: '600', color: T.textSecondary }}>Service Type</div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {['Sales Call', 'Site Visit'].map((s, i) => (
              <div key={s} style={{ flex: 1, padding: '7px 10px', borderRadius: '8px', border: `1.5px solid ${i === 0 ? T.accent : T.border}`, backgroundColor: i === 0 ? T.accentBg : 'transparent', fontSize: '10px', fontWeight: i === 0 ? '600' : '400', color: i === 0 ? T.accent : T.textSecondary, textAlign: 'center', cursor: 'pointer' }}>{s}</div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ fontSize: '9px', fontWeight: '600', color: T.textSecondary }}>Pick a Date — June 2026</div>
          <div style={{ display: 'flex', gap: '4px' }}>
            {CAL_DAYS.map(day => (
              <motion.div key={day.n} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: day.n * 0.03 }}
                style={{ flex: 1, padding: '5px 3px', borderRadius: '7px', border: `1px solid ${day.n === 10 ? T.accent : T.border}`, backgroundColor: day.n === 10 ? T.accentBg : day.avail ? T.bgCard : 'rgba(0,0,0,0.03)', textAlign: 'center', cursor: day.avail ? 'pointer' : 'default', opacity: day.avail ? 1 : 0.45 }}>
                <div style={{ fontSize: '8px', color: T.textMuted }}>{day.d}</div>
                <div style={{ fontSize: '11px', fontWeight: day.n === 10 ? '700' : '500', color: day.n === 10 ? T.accent : T.text }}>{day.n}</div>
              </motion.div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ fontSize: '9px', fontWeight: '600', color: T.textSecondary }}>Available Times — Tue Jun 10</div>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {TIME_SLOTS.map(slot => (
              <motion.div key={slot.time} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                style={{ padding: '6px 12px', borderRadius: '20px', border: `1.5px solid ${slot.selected ? T.accent : T.border}`, backgroundColor: slot.selected ? T.accent : T.bgCard, color: slot.selected ? '#fff' : T.text, fontSize: '10px', fontWeight: slot.selected ? '600' : '400', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Clock size={9} style={{ color: slot.selected ? '#fff' : T.textMuted }} />
                {slot.time}
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function SceneSlots() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <CalendarDays size={14} style={{ color: T.accent }} />
          <span style={{ fontSize: '14px', fontWeight: '700', color: T.text }}>Availability</span>
          <span style={{ fontSize: '9px', color: T.textMuted, padding: '2px 7px', borderRadius: '8px', backgroundColor: T.accentBg }}>Week of Jun 9–13</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '9px', color: T.textMuted }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: 'rgba(34,197,94,0.5)' }} />Available
          <div style={{ width: '8px', height: '8px', borderRadius: '2px', backgroundColor: 'rgba(107,114,128,0.18)' }} />Busy
        </div>
      </div>

      <div style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', borderBottom: `1px solid ${T.border}`, backgroundColor: T.accentBg }}>
          <div style={{ padding: '6px 10px', fontSize: '9px', fontWeight: '600', color: T.textMuted }}>Salesperson</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '2px', padding: '6px 8px' }}>
            {SALES_PEOPLE[0].slots.map(s => (
              <div key={s.label} style={{ fontSize: '8px', color: T.textMuted, textAlign: 'center' }}>{s.label}</div>
            ))}
          </div>
        </div>
        {SALES_PEOPLE.map((sp, si) => (
          <motion.div key={sp.name} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: si * 0.07 }}
            style={{ display: 'grid', gridTemplateColumns: '110px 1fr', borderBottom: `1px solid ${T.border}`, alignItems: 'center' }}>
            <div style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', gap: '7px' }}>
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: T.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: '700', color: T.accent, flexShrink: 0 }}>{sp.initials}</div>
              <div>
                <div style={{ fontSize: '9px', fontWeight: '600', color: T.text, whiteSpace: 'nowrap' }}>{sp.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '3px', marginTop: '1px' }}>
                  <div style={{ width: '20px', height: '4px', borderRadius: '2px', backgroundColor: `rgba(90,99,73,0.3)` }} />
                  <span style={{ fontSize: '7px', color: T.textMuted }}>accepting</span>
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: '2px', padding: '8px' }}>
              {sp.slots.map(slot => (
                <div key={slot.hour} style={{ height: '22px', borderRadius: '4px', backgroundColor: slot.free ? 'rgba(34,197,94,0.22)' : 'rgba(107,114,128,0.12)', border: `1px solid ${slot.free ? 'rgba(34,197,94,0.35)' : T.border}` }} />
              ))}
            </div>
          </motion.div>
        ))}
        <div style={{ padding: '8px 10px', fontSize: '9px', color: T.textMuted }}>
          Round-robin assignment routes new bookings to the next available rep.
        </div>
      </div>
    </div>
  )
}

function SceneConfirm() {
  const fields = [
    { label: 'Full Name',  value: 'Jordan Reyes',               icon: User  },
    { label: 'Phone',      value: '(801) 555-0194',             icon: Phone },
    { label: 'Email',      value: 'jordan.reyes@email.com',     icon: Mail  },
  ]
  const nextSteps = [
    "You'll get a confirmation email",
    "Your salesperson will receive a calendar invite",
    "We'll call 15 minutes before",
  ]
  return (
    <div style={{ flex: 1, display: 'flex', gap: '10px', overflow: 'hidden' }}>
      <div style={{ flex: 1, backgroundColor: T.bgCard, borderRadius: '12px', border: `1px solid ${T.border}`, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', paddingBottom: '8px', borderBottom: `1px solid ${T.border}` }}>
          <CheckCircle size={14} style={{ color: T.accent }} />
          <div>
            <div style={{ fontSize: '13px', fontWeight: '700', color: T.text }}>Confirm Your Booking</div>
            <div style={{ fontSize: '9px', color: T.textMuted }}>Sales Call · Tue Jun 10 at 10:30 AM · Horizon Home Services</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
          {fields.map((f, i) => (
            <motion.div key={f.label} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
              style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
              <div style={{ fontSize: '9px', fontWeight: '600', color: T.textSecondary }}>{f.label}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '7px 9px', borderRadius: '7px', border: `1px solid ${T.border}`, backgroundColor: T.bg, fontSize: '10px', color: T.text }}>
                <f.icon size={10} style={{ color: T.textMuted, flexShrink: 0 }} />
                {f.value}
              </div>
            </motion.div>
          ))}
          <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }}
            style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ fontSize: '9px', fontWeight: '600', color: T.textSecondary }}>Notes (optional)</div>
            <div style={{ padding: '7px 9px', borderRadius: '7px', border: `1px solid ${T.border}`, backgroundColor: T.bg, fontSize: '10px', color: T.textMuted, minHeight: '30px' }}>
              I have a 4,000 sq ft warehouse — interested in LED retrofit quote.
            </div>
          </motion.div>
        </div>

        <motion.button initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
          style={{ padding: '9px', borderRadius: '8px', border: 'none', backgroundColor: T.accent, color: '#fff', fontSize: '11px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
          <CheckCircle size={12} />Book Appointment
        </motion.button>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.38 }}
          style={{ borderRadius: '8px', backgroundColor: T.accentBg, border: `1px solid rgba(90,99,73,0.2)`, padding: '9px 11px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
          <div style={{ fontSize: '9px', fontWeight: '700', color: T.accent }}>What happens next</div>
          {nextSteps.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '9px', color: T.textSecondary }}>
              <div style={{ width: '14px', height: '14px', borderRadius: '50%', backgroundColor: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: '7px', color: '#fff', fontWeight: '700' }}>{i + 1}</span>
              </div>
              {s}
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  )
}

function SceneLead() {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <User size={14} style={{ color: T.accent }} />
          <span style={{ fontSize: '14px', fontWeight: '700', color: T.text }}>Leads</span>
          <span style={{ fontSize: '9px', padding: '2px 7px', borderRadius: '8px', backgroundColor: 'rgba(59,130,246,0.12)', color: '#3b82f6', fontWeight: '600' }}>1 new</span>
        </div>
        <span style={{ fontSize: '9px', color: T.textMuted }}>Auto-created from booking</span>
      </div>

      <div style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px' }}>
          <thead>
            <tr style={{ backgroundColor: T.accentBg }}>
              {['Customer', 'Source', 'Salesperson', 'Appointment', 'Status'].map(col => (
                <th key={col} style={{ padding: '6px 10px', textAlign: 'left', fontSize: '9px', fontWeight: '600', color: T.textMuted, borderBottom: `1px solid ${T.border}` }}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {MOCK_LEADS.map((lead, i) => {
              const sc = STATUS_COLORS[lead.status] || STATUS_COLORS['New']
              return (
                <motion.tr key={lead.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                  style={{ borderBottom: `1px solid ${T.border}`, backgroundColor: lead.isNew ? 'rgba(59,130,246,0.04)' : 'transparent', outline: lead.isNew ? `2px solid rgba(59,130,246,0.25)` : 'none', outlineOffset: '-1px', position: 'relative' }}>
                  <td style={{ padding: '7px 10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
                      <div style={{ width: '24px', height: '24px', borderRadius: '50%', backgroundColor: lead.isNew ? 'rgba(59,130,246,0.15)' : T.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '9px', fontWeight: '700', color: lead.isNew ? '#3b82f6' : T.accent, flexShrink: 0 }}>{lead.name.charAt(0)}</div>
                      <div>
                        <div style={{ fontWeight: lead.isNew ? '700' : '500', color: T.text }}>{lead.name}</div>
                        {lead.isNew && <div style={{ fontSize: '8px', color: '#3b82f6', fontWeight: '600' }}>Just booked</div>}
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '7px 10px' }}>
                    <span style={{ padding: '2px 6px', borderRadius: '4px', fontSize: '8px', fontWeight: '600', backgroundColor: lead.source === 'Booking' ? 'rgba(168,85,247,0.12)' : T.accentBg, color: lead.source === 'Booking' ? '#a855f7' : T.accent }}>{lead.source}</span>
                  </td>
                  <td style={{ padding: '7px 10px', color: T.textSecondary }}>{lead.salesperson}</td>
                  <td style={{ padding: '7px 10px' }}>
                    <span style={{ padding: '3px 7px', borderRadius: '8px', fontSize: '8px', fontWeight: '600', backgroundColor: lead.isNew ? 'rgba(59,130,246,0.12)' : 'rgba(107,114,128,0.1)', color: lead.isNew ? '#3b82f6' : T.textMuted, display: 'flex', alignItems: 'center', gap: '3px', width: 'fit-content' }}>
                      <CalendarDays size={8} />
                      {lead.appt}
                    </span>
                  </td>
                  <td style={{ padding: '7px 10px' }}>
                    <span style={{ padding: '2px 7px', borderRadius: '8px', fontSize: '8px', fontWeight: '600', backgroundColor: sc.bg, color: sc.text }}>{lead.status}</span>
                  </td>
                </motion.tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
        style={{ flexShrink: 0, padding: '8px 12px', borderRadius: '8px', backgroundColor: 'rgba(168,85,247,0.07)', border: '1px solid rgba(168,85,247,0.2)', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <CheckCircle size={12} style={{ color: '#a855f7', flexShrink: 0 }} />
        <div style={{ fontSize: '9px', color: T.textSecondary }}>
          <span style={{ fontWeight: '600', color: '#a855f7' }}>Auto-created: </span>
          Jordan Reyes booked via the public page — a lead was created, Doug Anderson was assigned, and a calendar invite was sent.
        </div>
        <ChevronRight size={10} style={{ color: T.textMuted, flexShrink: 0 }} />
      </motion.div>
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    page:    '1 · Public booking page — customers pick service type, date, and available time slot',
    slots:   '2 · Availability view — see each rep\'s free vs blocked hours, toggle accepting bookings',
    confirm: '3 · Booking confirmation — customer fills details, sees what happens next, clicks Book',
    lead:    '4 · Lead auto-created — booking fires a new lead row with source "Booking" and appointment badge',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Bookings work'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
