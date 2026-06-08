// Time Clock walkthrough — rebuilt to Prospect Scout standard.
// Source: src/pages/TimeClock.jsx
// DO NOT import ZachShell — reproduces real component structure with mock data.

import { motion, AnimatePresence } from 'framer-motion'
import { Clock, Play, Square, Calendar, Users } from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/time-clock.js'

const T = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

const MOCK_EMPLOYEES = [
  { id: 1, name: 'Doug Anderson',  role: 'Sales',      clockedIn: true,  elapsed: '3:42:17', job: 'LED Retrofit — Northbridge', weekHours: 32.5 },
  { id: 2, name: 'Tracy Benson',   role: 'Manager',    clockedIn: false, elapsed: null,      job: null,                         weekHours: 24.0 },
  { id: 3, name: 'Marcus Webb',    role: 'Field Tech', clockedIn: true,  elapsed: '5:10:44', job: 'Warehouse LED',               weekHours: 36.0 },
  { id: 4, name: 'Linda Park',     role: 'Setter',     clockedIn: false, elapsed: null,      job: null,                         weekHours: 18.5 },
]

export default function TimeClockWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Time tracked, payroll ready." />}
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
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', fontSize: '12px', fontFamily: 'system-ui, sans-serif', color: T.text, padding: '12px 16px', gap: '8px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Clock size={16} style={{ color: T.accent }} />
            <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Time Clock</span>
          </div>
          <div style={{ fontSize: '10px', color: T.textMuted }}>Monday, June 9, 2026</div>
        </div>
        <div style={{ fontSize: '22px', fontWeight: '700', fontFamily: 'monospace', color: T.accent }}>7:48:31 AM</div>
      </div>

      {/* Lookback range pills */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Calendar size={11} style={{ color: T.textMuted }} />
        <span style={{ fontSize: '10px', color: T.textMuted }}>Showing:</span>
        {[7, 14, 30].map(d => (
          <button key={d} style={{ padding: '2px 8px', fontSize: '10px', fontWeight: d === 7 ? '600' : '400', backgroundColor: d === 7 ? T.accentBg : 'transparent', color: d === 7 ? T.accent : T.textSecondary, border: `1px solid ${d === 7 ? T.accent : T.border}`, borderRadius: '12px', cursor: 'pointer' }}>{d}d</button>
        ))}
      </div>

      {/* Employee cards */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '10px', alignContent: 'start', overflowY: 'auto' }}>
        {MOCK_EMPLOYEES.map((emp, i) => (
          <motion.div key={emp.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07, duration: 0.3 }}
            style={{
              backgroundColor: T.bgCard, border: `1px solid ${T.border}`,
              borderRadius: '12px', padding: '14px',
              boxShadow: emp.clockedIn ? '0 0 20px rgba(34,197,94,0.15)' : T.shadow,
            }}
          >
            {/* Name + status */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: '600', color: T.text }}>{emp.name}</div>
                <div style={{ fontSize: '10px', color: T.textMuted }}>{emp.role}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <div style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: emp.clockedIn ? '#22c55e' : '#d1d5db' }} />
                <span style={{ fontSize: '9px', color: emp.clockedIn ? '#22c55e' : T.textMuted }}>{emp.clockedIn ? 'Clocked In' : 'Out'}</span>
              </div>
            </div>
            {/* Timer or week hours */}
            {emp.clockedIn ? (
              <div style={{ marginBottom: '8px' }}>
                <div style={{ fontSize: '20px', fontWeight: '700', fontFamily: 'monospace', color: '#22c55e' }}>{emp.elapsed}</div>
                <div style={{ fontSize: '9px', color: T.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{emp.job}</div>
              </div>
            ) : (
              <div style={{ fontSize: '14px', fontWeight: '600', color: T.textSecondary, marginBottom: '8px' }}>
                {emp.weekHours.toFixed(1)} hrs this week
              </div>
            )}
            {/* Action button */}
            <button style={{
              width: '100%', padding: '7px', border: 'none', borderRadius: '7px',
              backgroundColor: emp.clockedIn ? 'rgba(239,68,68,0.1)' : T.accent,
              color: emp.clockedIn ? '#ef4444' : '#fff',
              fontSize: '10px', fontWeight: '600', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
            }}>
              {emp.clockedIn ? <><Square size={10} />Clock Out</> : <><Play size={10} />Clock In</>}
            </button>
          </motion.div>
        ))}
      </div>
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    overview: '1 · Time Clock — all employees, green glow for clocked-in, monospace timer',
    clockin:  '2 · Clock In starts the timer — optionally linked to a specific job',
    timer:    '3 · Active entry shows elapsed time + job name in real time',
    lunch:    '4 · Lunch break button pauses billing without clocking out',
    history:  '5 · Each card shows week total + recent sessions below the action button',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Time Clock works'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
