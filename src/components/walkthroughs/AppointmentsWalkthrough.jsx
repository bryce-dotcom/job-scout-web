// Appointments walkthrough — marketing + setup scenes.
// Source: src/lib/featureKnowledge/appointments.js

import { motion, AnimatePresence } from 'framer-motion'
import { Calendar, CalendarDays, Clock, CheckCircle, XCircle, RefreshCw, User, MapPin, ChevronRight, TrendingUp, ExternalLink } from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/appointments.js'

const T = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

const STATUS_STYLES = {
  'Scheduled':  { bg: 'rgba(59,130,246,0.12)',  text: '#3b82f6' },
  'Completed':  { bg: 'rgba(34,197,94,0.12)',   text: '#22c55e' },
  'No-show':    { bg: 'rgba(239,68,68,0.12)',   text: '#ef4444' },
  'Cancelled':  { bg: 'rgba(107,114,128,0.12)', text: '#6b7280' },
}

const TYPE_COLORS = {
  'Sales Call':  '#a855f7',
  'Site Visit':  '#3b82f6',
  'Follow-up':   '#f59e0b',
  'Demo':        '#22c55e',
}

const MOCK_APPTS = [
  { id: 1, customer: 'Marcus Okafor',   address: '2814 W Elm St, Phoenix, AZ',    type: 'Sales Call',  salesperson: 'Linda P.',  avatar: 'LP', color: '#5a6349', date: 'Jun 12, 2026', time: '9:00 AM',  status: 'Completed', lead: 'LEAD-041' },
  { id: 2, customer: 'Sarah Chen',       address: '519 N Maple Ave, Tempe, AZ',   type: 'Site Visit',  salesperson: 'Doug A.',   avatar: 'DA', color: '#3b82f6', date: 'Jun 12, 2026', time: '11:30 AM', status: 'Scheduled', lead: 'LEAD-044' },
  { id: 3, customer: 'Ryan Torres',      address: '7741 E Broadway, Mesa, AZ',    type: 'Sales Call',  salesperson: 'Tracy B.',  avatar: 'TB', color: '#a855f7', date: 'Jun 12, 2026', time: '2:00 PM',  status: 'Scheduled', lead: 'LEAD-039' },
  { id: 4, customer: 'Heather Nguyen',   address: '1020 S Mill Ave, Chandler, AZ', type: 'Follow-up',  salesperson: 'Linda P.',  avatar: 'LP', color: '#5a6349', date: 'Jun 13, 2026', time: '10:00 AM', status: 'Scheduled', lead: 'LEAD-047' },
  { id: 5, customer: 'Brandon Walsh',    address: '3308 N 7th St, Phoenix, AZ',   type: 'Demo',        salesperson: 'Doug A.',   avatar: 'DA', color: '#3b82f6', date: 'Jun 13, 2026', time: '1:00 PM',  status: 'No-show',   lead: 'LEAD-038' },
  { id: 6, customer: 'Patricia Malone',  address: '884 W Camelback Rd, PHX, AZ', type: 'Site Visit',  salesperson: 'Tracy B.',  avatar: 'TB', color: '#a855f7', date: 'Jun 14, 2026', time: '3:30 PM',  status: 'Scheduled', lead: 'LEAD-050' },
]

const OUTCOME_OPTIONS = ['Interested', 'Not Interested', 'Needs Follow-up', 'Closed']

const OUTCOME_STATS = [
  { label: 'Interested',   pct: 42, color: '#3b82f6', count: 52 },
  { label: 'Closed',       pct: 28, color: '#22c55e', count: 35 },
  { label: 'Follow-up',    pct: 18, color: '#f59e0b', count: 22 },
  { label: 'No-show',      pct: 12, color: '#ef4444', count: 15 },
]

const FUNNEL_STEPS = [
  { label: 'Booked',      count: 124, color: '#5a6349' },
  { label: 'Completed',   count: 109, color: '#3b82f6' },
  { label: 'Interested',  count: 74,  color: '#f59e0b' },
  { label: 'Won',         count: 35,  color: '#22c55e' },
]

const CAL_DAYS = [
  { d: 1,  dots: [] },
  { d: 2,  dots: [] },
  { d: 3,  dots: ['#5a6349'] },
  { d: 4,  dots: [] },
  { d: 5,  dots: ['#3b82f6', '#a855f7'] },
  { d: 6,  dots: [] },
  { d: 7,  dots: ['#5a6349'] },
  { d: 8,  dots: ['#a855f7', '#3b82f6', '#5a6349'] },
  { d: 9,  dots: ['#3b82f6'] },
  { d: 10, dots: [] },
  { d: 11, dots: ['#5a6349', '#a855f7'] },
  { d: 12, dots: ['#5a6349', '#3b82f6', '#a855f7'], today: true },
  { d: 13, dots: ['#3b82f6', '#5a6349'] },
  { d: 14, dots: ['#a855f7'] },
  { d: 15, dots: [] },
  { d: 16, dots: ['#5a6349', '#3b82f6'] },
  { d: 17, dots: ['#a855f7'] },
  { d: 18, dots: ['#5a6349'] },
  { d: 19, dots: [] },
  { d: 20, dots: ['#3b82f6', '#a855f7', '#5a6349'] },
  { d: 21, dots: ['#5a6349'] },
  { d: 22, dots: [] },
  { d: 23, dots: ['#3b82f6'] },
  { d: 24, dots: ['#5a6349', '#a855f7'] },
  { d: 25, dots: [] },
  { d: 26, dots: ['#3b82f6'] },
  { d: 27, dots: ['#5a6349'] },
  { d: 28, dots: ['#a855f7', '#3b82f6'] },
  { d: 29, dots: [] },
  { d: 30, dots: ['#5a6349'] },
]

const GCAL_JOBSCOUT = [
  { time: '9:00 AM',  title: 'Sales Call — Marcus Okafor',  color: '#5a6349' },
  { time: '11:30 AM', title: 'Site Visit — Sarah Chen',       color: '#3b82f6' },
  { time: '2:00 PM',  title: 'Sales Call — Ryan Torres',      color: '#a855f7' },
]

const GCAL_GOOGLE = [
  { time: '9:00 AM',  title: 'JobScout: Sales Call — Marcus Okafor',  color: '#4285f4' },
  { time: '11:30 AM', title: 'JobScout: Site Visit — Sarah Chen',       color: '#4285f4' },
  { time: '2:00 PM',  title: 'JobScout: Sales Call — Ryan Torres',      color: '#4285f4' },
]

export default function AppointmentsWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Pipeline booked." />}
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
      {scene === 'list' && <SceneList />}
      {scene === 'detail' && <SceneDetail />}
      {scene === 'calendar' && <SceneCalendar />}
      {scene === 'gcal' && <SceneGcal />}
      {scene === 'outcome' && <SceneOutcome />}
    </div>
  )
}

function SceneList() {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Calendar size={15} style={{ color: T.accent }} />
          <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Appointments</span>
          <span style={{ padding: '2px 7px', borderRadius: '8px', fontSize: '10px', fontWeight: '600', backgroundColor: T.accentBg, color: T.accent }}>6</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ padding: '4px 9px', borderRadius: '5px', border: `1px solid ${T.border}`, backgroundColor: T.bgCard, fontSize: '9px', color: T.textSecondary }}>Jun 12–14, 2026</span>
          <button style={{ padding: '4px 9px', border: 'none', borderRadius: '5px', backgroundColor: T.accent, color: '#fff', fontSize: '9px', cursor: 'pointer' }}>+ Book</button>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'hidden', backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 80px 85px 80px', padding: '5px 10px', borderBottom: `1px solid ${T.border}`, backgroundColor: T.accentBg }}>
          {['Customer', 'Type', 'Salesperson', 'Date / Time', 'Status'].map(col => (
            <div key={col} style={{ fontSize: '9px', fontWeight: '600', color: T.textMuted }}>{col}</div>
          ))}
        </div>
        {MOCK_APPTS.map((appt, i) => {
          const ss = STATUS_STYLES[appt.status] || STATUS_STYLES['Scheduled']
          const tc = TYPE_COLORS[appt.type] || '#6b7280'
          return (
            <motion.div key={appt.id}
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
              style={{ display: 'grid', gridTemplateColumns: '1fr 90px 80px 85px 80px', padding: '7px 10px', borderBottom: `1px solid ${T.border}`, alignItems: 'center', cursor: 'pointer' }}
            >
              <div>
                <div style={{ fontSize: '10px', fontWeight: '600', color: T.text }}>{appt.customer}</div>
                <div style={{ fontSize: '8px', color: T.textMuted, display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <MapPin size={7} />{appt.address.split(',')[1]?.trim() || appt.address}
                </div>
              </div>
              <div>
                <span style={{ padding: '2px 5px', borderRadius: '4px', fontSize: '8px', fontWeight: '600', backgroundColor: tc + '18', color: tc }}>{appt.type}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <div style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: appt.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '7px', fontWeight: '700', color: appt.color, flexShrink: 0 }}>{appt.avatar}</div>
                <span style={{ fontSize: '9px', color: T.textSecondary }}>{appt.salesperson}</span>
              </div>
              <div>
                <div style={{ fontSize: '9px', color: T.text }}>{appt.date}</div>
                <div style={{ fontSize: '8px', color: T.textMuted }}>{appt.time}</div>
              </div>
              <div>
                <span style={{ padding: '2px 6px', borderRadius: '8px', fontSize: '8px', fontWeight: '600', backgroundColor: ss.bg, color: ss.text }}>{appt.status}</span>
              </div>
            </motion.div>
          )
        })}
      </div>
    </>
  )
}

function SceneDetail() {
  const appt = MOCK_APPTS[1]
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <div style={{ fontSize: '10px', color: T.textMuted, cursor: 'pointer' }}>← Appointments</div>
        <span style={{ color: T.border }}>/</span>
        <span style={{ fontSize: '13px', fontWeight: '700', color: T.text }}>{appt.customer}</span>
        <span style={{ padding: '2px 7px', borderRadius: '8px', fontSize: '9px', fontWeight: '600', backgroundColor: STATUS_STYLES['Scheduled'].bg, color: STATUS_STYLES['Scheduled'].text }}>Scheduled</span>
      </div>

      <div style={{ flex: 1, display: 'flex', gap: '8px', overflow: 'hidden' }}>
        <div style={{ width: '200px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '7px' }}>
          <div style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', padding: '11px' }}>
            <div style={{ fontSize: '9px', fontWeight: '700', color: T.textMuted, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Appointment</div>
            {[
              ['Type', appt.type, TYPE_COLORS[appt.type]],
              ['Date', appt.date, null],
              ['Time', appt.time, null],
            ].map(([l, v, c]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: `1px solid ${T.border}`, fontSize: '10px', alignItems: 'center' }}>
                <span style={{ color: T.textMuted }}>{l}</span>
                <span style={{ color: c || T.text, fontWeight: '500' }}>{v}</span>
              </div>
            ))}
          </div>

          <div style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', padding: '11px' }}>
            <div style={{ fontSize: '9px', fontWeight: '700', color: T.textMuted, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Customer</div>
            {[
              ['Name', appt.customer],
              ['Address', '519 N Maple Ave'],
              ['City', 'Tempe, AZ'],
            ].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: `1px solid ${T.border}`, fontSize: '10px' }}>
                <span style={{ color: T.textMuted }}>{l}</span>
                <span style={{ color: T.text, fontWeight: '500' }}>{v}</span>
              </div>
            ))}
          </div>

          <div style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', padding: '11px' }}>
            <div style={{ fontSize: '9px', fontWeight: '700', color: T.textMuted, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Salesperson</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '28px', height: '28px', borderRadius: '50%', backgroundColor: appt.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700', color: appt.color }}>{appt.avatar}</div>
              <div>
                <div style={{ fontSize: '10px', fontWeight: '600', color: T.text }}>Doug Anderson</div>
                <div style={{ fontSize: '8px', color: T.textMuted }}>Sales Rep</div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '7px', overflow: 'hidden' }}>
          <div style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', padding: '11px', flexShrink: 0 }}>
            <div style={{ fontSize: '9px', fontWeight: '700', color: T.textMuted, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Outcome</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
              {OUTCOME_OPTIONS.map(opt => (
                <motion.div key={opt} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                  style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '9px', fontWeight: '600', cursor: 'pointer', border: `1px solid ${opt === 'Interested' ? '#3b82f6' : T.border}`, backgroundColor: opt === 'Interested' ? 'rgba(59,130,246,0.1)' : T.bg, color: opt === 'Interested' ? '#3b82f6' : T.textSecondary }}>
                  {opt}
                </motion.div>
              ))}
            </div>
          </div>

          <div style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', padding: '11px', display: 'flex', flexDirection: 'column', gap: '6px', overflow: 'hidden' }}>
            <div style={{ fontSize: '9px', fontWeight: '700', color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Notes</div>
            <div style={{ flex: 1, border: `1px solid ${T.border}`, borderRadius: '6px', padding: '8px', backgroundColor: T.bg, fontSize: '9px', color: T.textSecondary, overflow: 'auto', lineHeight: '1.5' }}>
              Customer expressed strong interest in LED retrofit for 3,200 sqft warehouse. Wants to compare SRP rebate options before committing. Follow up with quote EST-044 by Friday.
            </div>
          </div>

          <div style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', padding: '9px 11px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '10px', color: T.textSecondary }}>Linked Lead</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', color: '#3b82f6', fontSize: '10px', fontWeight: '600' }}>
              {appt.lead} — Sarah Chen <ExternalLink size={9} />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

function SceneCalendar() {
  const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const SALESPEOPLE = [
    { name: 'Linda Park',    color: '#5a6349', initials: 'LP' },
    { name: 'Doug Anderson', color: '#3b82f6', initials: 'DA' },
    { name: 'Tracy Benson',  color: '#a855f7', initials: 'TB' },
  ]
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CalendarDays size={15} style={{ color: T.accent }} />
          <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Appointments</span>
          <span style={{ fontSize: '11px', color: T.textMuted }}>June 2026</span>
        </div>
        <div style={{ display: 'flex', gap: '5px' }}>
          {SALESPEOPLE.map(sp => (
            <div key={sp.name} style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '3px 7px', borderRadius: '6px', border: `1px solid ${sp.color}30`, backgroundColor: sp.color + '12' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: sp.color }} />
              <span style={{ fontSize: '8px', color: sp.color, fontWeight: '600' }}>{sp.initials}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: `1px solid ${T.border}`, backgroundColor: T.accentBg }}>
          {weekDays.map(d => (
            <div key={d} style={{ padding: '5px', textAlign: 'center', fontSize: '9px', fontWeight: '600', color: T.textMuted }}>{d}</div>
          ))}
        </div>
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridAutoRows: '1fr', gap: '0' }}>
          {[null, null, null].concat(CAL_DAYS).map((day, idx) => {
            if (!day) return <div key={`empty-${idx}`} style={{ borderRight: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}`, backgroundColor: '#faf9f6' }} />
            return (
              <motion.div key={day.d}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: (idx - 3) * 0.008 }}
                style={{ borderRight: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}`, padding: '4px 5px', display: 'flex', flexDirection: 'column', gap: '2px', cursor: day.dots.length > 0 ? 'pointer' : 'default', backgroundColor: day.today ? 'rgba(90,99,73,0.08)' : 'transparent' }}>
                <div style={{ fontSize: '9px', fontWeight: day.today ? '800' : '500', color: day.today ? T.accent : T.textSecondary, width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', backgroundColor: day.today ? T.accentBg : 'transparent' }}>{day.d}</div>
                {day.dots.length > 0 && (
                  <div style={{ display: 'flex', gap: '2px', flexWrap: 'wrap' }}>
                    {day.dots.map((color, di) => (
                      <div key={di} style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: color }} />
                    ))}
                  </div>
                )}
              </motion.div>
            )
          })}
        </div>
      </div>
    </>
  )
}

function SceneGcal() {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <RefreshCw size={14} style={{ color: '#22c55e' }} />
          <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Google Calendar Sync</span>
          <span style={{ padding: '2px 7px', borderRadius: '8px', fontSize: '9px', fontWeight: '600', backgroundColor: 'rgba(34,197,94,0.12)', color: '#22c55e' }}>Synced</span>
        </div>
        <span style={{ fontSize: '9px', color: T.textMuted }}>Last synced 2 min ago</span>
      </div>

      <div style={{ flexShrink: 0, padding: '8px 12px', backgroundColor: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <CheckCircle size={12} style={{ color: '#22c55e' }} />
        <span style={{ fontSize: '10px', color: T.text }}>Appointments are automatically pushed to your Google Calendar. Changes in either direction sync within 60 seconds.</span>
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', overflow: 'hidden' }}>
        <div style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '8px 12px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, backgroundColor: T.accentBg }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: T.accent }} />
            <span style={{ fontSize: '10px', fontWeight: '700', color: T.text }}>JobScout · Jun 12</span>
          </div>
          {GCAL_JOBSCOUT.map((ev, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
              style={{ display: 'flex', gap: '8px', padding: '8px 12px', borderBottom: `1px solid ${T.border}`, alignItems: 'flex-start' }}>
              <span style={{ fontSize: '9px', color: T.textMuted, flexShrink: 0, paddingTop: '1px' }}>{ev.time}</span>
              <div style={{ flex: 1, padding: '5px 8px', borderRadius: '5px', backgroundColor: ev.color + '15', borderLeft: `3px solid ${ev.color}` }}>
                <div style={{ fontSize: '9px', fontWeight: '600', color: T.text }}>{ev.title}</div>
              </div>
            </motion.div>
          ))}
        </div>

        <div style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '8px 12px', borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, backgroundColor: 'rgba(66,133,244,0.06)' }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: '#4285f4' }} />
            <span style={{ fontSize: '10px', fontWeight: '700', color: T.text }}>Google Calendar · Jun 12</span>
          </div>
          {GCAL_GOOGLE.map((ev, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 + 0.1 }}
              style={{ display: 'flex', gap: '8px', padding: '8px 12px', borderBottom: `1px solid ${T.border}`, alignItems: 'flex-start' }}>
              <span style={{ fontSize: '9px', color: T.textMuted, flexShrink: 0, paddingTop: '1px' }}>{ev.time}</span>
              <div style={{ flex: 1, padding: '5px 8px', borderRadius: '5px', backgroundColor: '#4285f418', borderLeft: '3px solid #4285f4' }}>
                <div style={{ fontSize: '9px', fontWeight: '600', color: T.text }}>{ev.title}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </>
  )
}

function SceneOutcome() {
  const total = OUTCOME_STATS.reduce((s, o) => s + o.count, 0)
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
        <TrendingUp size={15} style={{ color: T.accent }} />
        <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Outcome Tracking</span>
        <span style={{ fontSize: '10px', color: T.textMuted }}>{total} appointments · Last 30 days</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', flexShrink: 0 }}>
        {OUTCOME_STATS.map(o => (
          <motion.div key={o.label} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
            style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', padding: '9px', borderTop: `3px solid ${o.color}`, textAlign: 'center' }}>
            <div style={{ fontSize: '18px', fontWeight: '800', color: o.color }}>{o.pct}%</div>
            <div style={{ fontSize: '9px', color: T.text, fontWeight: '600' }}>{o.label}</div>
            <div style={{ fontSize: '8px', color: T.textMuted }}>{o.count} appts</div>
          </motion.div>
        ))}
      </div>

      <div style={{ flex: 1, display: 'flex', gap: '8px', overflow: 'hidden' }}>
        <div style={{ flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px', overflow: 'hidden' }}>
          <div style={{ fontSize: '10px', fontWeight: '700', color: T.text, marginBottom: '2px' }}>Outcome Breakdown</div>
          {OUTCOME_STATS.map((o, i) => (
            <div key={o.label} style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
              <div style={{ width: '60px', fontSize: '9px', color: T.textSecondary, flexShrink: 0 }}>{o.label}</div>
              <div style={{ flex: 1, height: '10px', backgroundColor: T.bg, borderRadius: '5px', overflow: 'hidden', border: `1px solid ${T.border}` }}>
                <motion.div initial={{ width: 0 }} animate={{ width: `${o.pct}%` }} transition={{ delay: i * 0.08, duration: 0.5 }}
                  style={{ height: '100%', backgroundColor: o.color, borderRadius: '5px' }} />
              </div>
              <div style={{ fontSize: '9px', fontWeight: '700', color: o.color, width: '28px', textAlign: 'right' }}>{o.pct}%</div>
            </div>
          ))}
        </div>

        <div style={{ width: '190px', flexShrink: 0, backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px', overflow: 'hidden' }}>
          <div style={{ fontSize: '10px', fontWeight: '700', color: T.text, marginBottom: '2px' }}>Conversion Funnel</div>
          {FUNNEL_STEPS.map((step, i) => {
            const widthPct = Math.round((step.count / FUNNEL_STEPS[0].count) * 100)
            return (
              <div key={step.label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                <motion.div initial={{ width: 0 }} animate={{ width: `${widthPct}%` }} transition={{ delay: i * 0.1, duration: 0.45 }}
                  style={{ height: '22px', backgroundColor: step.color + '22', border: `1px solid ${step.color}40`, borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 7px', width: `${widthPct}%`, minWidth: '60px', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: '8px', fontWeight: '700', color: step.color }}>{step.label}</span>
                  <span style={{ fontSize: '10px', fontWeight: '800', color: step.color }}>{step.count}</span>
                </motion.div>
              </div>
            )
          })}
          <div style={{ marginTop: '4px', padding: '5px 8px', backgroundColor: 'rgba(34,197,94,0.08)', borderRadius: '6px', border: '1px solid rgba(34,197,94,0.2)' }}>
            <div style={{ fontSize: '9px', color: T.textMuted }}>Booked → Won</div>
            <div style={{ fontSize: '13px', fontWeight: '800', color: '#22c55e' }}>28.2%</div>
          </div>
        </div>
      </div>
    </>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    list:     '1 · Appointment list — customer, type, salesperson avatar, date/time, status badge',
    detail:   '2 · Detail panel — outcome selection, notes, and link to the related lead',
    calendar: '3 · Calendar month view — color-coded dots per salesperson, today highlighted',
    gcal:     '4 · Google Calendar sync — two-way, live badge, same appointments on both sides',
    outcome:  '5 · Outcome tracking — pie stats + conversion funnel Booked → Completed → Won',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Appointments work'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
