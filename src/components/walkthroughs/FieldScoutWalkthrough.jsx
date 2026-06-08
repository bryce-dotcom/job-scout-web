// Field Scout walkthrough — rebuilt to Prospect Scout standard.
// Source: src/pages/FieldScout.jsx — mobile tech home base.
// DO NOT import ZachShell — mobile-first, centered at max-width 600px.

import { motion, AnimatePresence } from 'framer-motion'
import {
  Compass, Clock, MapPin, Play, Coffee, CheckCircle,
  Calendar, Briefcase, Timer, DollarSign, Camera,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/field-scout.js'

const T = {
  bg:            '#f7f5ef',
  bgCard:        '#ffffff',
  border:        '#d6cdb8',
  text:          '#2c3530',
  textSecondary: '#4d5a52',
  textMuted:     '#7d8a7f',
  accent:        '#5a6349',
  accentBg:      'rgba(90,99,73,0.12)',
  shadow:        '0 1px 4px rgba(44,53,48,0.08)',
}

const MOCK_JOBS = [
  { id: 1, job_id: 'JOB-041', job_title: 'LED Retrofit — Northbridge', customer: 'Marcus Okafor', address: '1440 S Temple, SLC, UT', allotted_time_hours: 6 },
  { id: 2, job_id: 'JOB-039', job_title: 'Parking Lot LED',            customer: 'David Kim',    address: '892 Lone Peak Pkwy, Draper', allotted_time_hours: 4 },
]

export default function FieldScoutWalkthrough() {
  const runner = useWalkthroughRunner(card)
  const { phase, sceneKey, sceneElapsed, setupIdx, setupShowingIntro,
    elapsed, totalMs, totalMarketingMs, voiceOn, setVoiceOn, replay } = runner

  return (
    <div style={{ position: 'relative', width: '100%', paddingBottom: '56.25%', background: T.bg, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        {phase === 'marketing' && <Stage scene={sceneKey} sceneElapsed={sceneElapsed} />}
        <AnimatePresence mode="wait">
          {phase === 'setup' && setupShowingIntro && <SetupIntro key="intro" />}
          {phase === 'setup' && !setupShowingIntro && (
            <CenteredOverlay key="checklist">
              <SetupChecklist title={`Set it up in ${card.setup.steps.length} steps`} steps={card.setup.steps} currentIdx={setupIdx} />
            </CenteredOverlay>
          )}
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Field Scout is ready for your team." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene, sceneElapsed }) {
  // Simulate elapsed timer for 'working' scene
  const fakeElapsed = scene === 'working' ? Math.min(3 * 3600 + Math.floor(sceneElapsed / 1000) * 60, 4 * 3600) : 3 * 3600

  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', justifyContent: 'center', alignItems: 'flex-start',
      backgroundColor: T.bg, overflow: 'hidden',
    }}>
      {/* Phone-width centered column */}
      <div style={{ width: '100%', maxWidth: '380px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto', height: '100%', boxSizing: 'border-box' }}>
        <PhoneHeader />
        <WeekCard />
        {(scene === 'working' || scene === 'lunch') && <ClockBanner scene={scene} elapsed={fakeElapsed} />}
        {scene !== 'working' && scene !== 'lunch' && <IdleState />}
        <JobList scene={scene} />
      </div>
    </div>
  )
}

// Header — lines 1527-1558
function PhoneHeader() {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginBottom: '2px' }}>
        <Compass size={18} style={{ color: T.accent }} />
        <h1 style={{ fontSize: '16px', fontWeight: '700', color: T.text, margin: 0 }}>Good morning, Doug</h1>
      </div>
      <div style={{ fontSize: '11px', color: T.textMuted, marginBottom: '4px' }}>Monday, June 9, 2026</div>
      <div style={{ fontSize: '28px', fontWeight: '700', fontFamily: 'monospace', color: T.accent, letterSpacing: '2px' }}>
        7:48:31 AM
      </div>
    </div>
  )
}

// Week card — lines 1559-1618
function WeekCard() {
  const days = [
    { label: 'S', hours: 0,    today: false },
    { label: 'M', hours: 8.0,  today: true  },
    { label: 'T', hours: 7.5,  today: false },
    { label: 'W', hours: 0,    today: false },
    { label: 'T', hours: 0,    today: false },
    { label: 'F', hours: 0,    today: false },
    { label: 'S', hours: 0,    today: false },
  ]
  return (
    <div style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '12px', padding: '12px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: T.textMuted, fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          <Calendar size={12} />This Week
        </div>
        <div style={{ fontSize: '10px', color: T.textMuted }}>Jun 2 – Jun 8</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '10px' }}>
        <div style={{ fontSize: '24px', fontWeight: 800, color: T.accent, lineHeight: 1 }}>15.50</div>
        <div style={{ fontSize: '11px', color: T.textMuted }}>hours</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '3px' }}>
        {days.map((d, i) => (
          <div key={i} style={{ textAlign: 'center', padding: '4px 2px', borderRadius: '6px', backgroundColor: d.today ? T.accentBg : 'transparent', border: `1px solid ${d.today ? T.accent + '40' : 'transparent'}` }}>
            <div style={{ fontSize: '9px', fontWeight: 600, color: d.today ? T.accent : T.textMuted, marginBottom: '1px' }}>{d.label}</div>
            <div style={{ fontSize: '10px', fontWeight: 600, color: d.hours > 0 ? T.text : T.textMuted }}>{d.hours > 0 ? d.hours.toFixed(1) : '—'}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Active clock banner — green gradient (lines 1619-1710)
function ClockBanner({ scene, elapsed }) {
  const isLunch = scene === 'lunch'
  const hrs = Math.floor(elapsed / 3600)
  const mins = Math.floor((elapsed % 3600) / 60)
  const secs = elapsed % 60
  const pad = n => String(n).padStart(2, '0')
  const elapsedStr = `${pad(hrs)}:${pad(mins)}:${pad(secs)}`

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      style={{
        background: isLunch
          ? 'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)'
          : 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
        borderRadius: '14px', padding: '16px',
        color: '#fff', position: 'relative', overflow: 'hidden',
      }}
    >
      {/* Pulsing dot */}
      <div style={{ position: 'absolute', top: '14px', right: '14px', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#fff', opacity: 0.9 }} />
      <div style={{ fontSize: '11px', opacity: 0.85, marginBottom: '2px' }}>
        {isLunch ? 'On Lunch Break' : 'Currently Working'}
      </div>
      <div style={{ fontSize: '32px', fontWeight: '900', fontFamily: 'monospace', lineHeight: 1, marginBottom: '2px' }}>
        {elapsedStr}
      </div>
      <div style={{ fontSize: '12px', fontWeight: '600', marginBottom: '10px' }}>
        LED Retrofit — Northbridge
      </div>
      {/* Progress bar */}
      <div style={{ fontSize: '9px', opacity: 0.8, marginBottom: '4px' }}>3.0 / 6.0 allotted hrs · 3.0 hrs left</div>
      <div style={{ height: '8px', backgroundColor: 'rgba(255,255,255,0.3)', borderRadius: '4px', overflow: 'hidden' }}>
        <div style={{ width: '50%', height: '100%', backgroundColor: '#fff', opacity: 0.85 }} />
      </div>
    </motion.div>
  )
}

// Idle state prompt
function IdleState() {
  return (
    <div style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '12px', padding: '14px', textAlign: 'center' }}>
      <Coffee size={22} style={{ color: T.textMuted, marginBottom: '6px' }} />
      <div style={{ fontSize: '12px', color: T.textSecondary }}>Not clocked in</div>
      <div style={{ fontSize: '10px', color: T.textMuted, marginTop: '2px' }}>Select a job below and clock in to it for accurate time tracking.</div>
    </div>
  )
}

// Job list — today's scheduled jobs
function JobList({ scene }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ fontSize: '11px', fontWeight: '600', color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Today's Jobs</div>
      {MOCK_JOBS.map((job, i) => (
        <motion.div
          key={job.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1, duration: 0.3 }}
          style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '12px', padding: '12px 14px' }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '6px' }}>
            <div>
              <div style={{ fontSize: '12px', fontWeight: '600', color: T.text }}>{job.job_title}</div>
              <div style={{ fontSize: '10px', color: T.textMuted }}>{job.customer}</div>
            </div>
            <span style={{ fontSize: '10px', color: T.accent, fontWeight: '600' }}>{job.job_id}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: T.textMuted, marginBottom: '10px' }}>
            <MapPin size={10} />{job.address}
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            {scene !== 'working' && (
              <button style={{ flex: 1, padding: '7px', backgroundColor: T.accent, color: '#fff', border: 'none', borderRadius: '7px', fontSize: '10px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                <Play size={10} />Clock In
              </button>
            )}
            {scene === 'working' && i === 0 && (
              <button style={{ flex: 1, padding: '7px', backgroundColor: '#ef4444', color: '#fff', border: 'none', borderRadius: '7px', fontSize: '10px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                <CheckCircle size={10} />Complete Job
              </button>
            )}
            <button style={{ padding: '7px 10px', border: `1px solid ${T.border}`, borderRadius: '7px', fontSize: '10px', backgroundColor: 'transparent', color: T.textSecondary, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '3px' }}>
              <Camera size={10} />Photo
            </button>
          </div>
        </motion.div>
      ))}
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    greeting: '1 · Field Scout — "Good morning, Doug" + clock + week-to-date hours card',
    clockin:  '2 · Select a job → Clock In → active session starts with live timer',
    working:  '3 · Green banner shows elapsed time, job name, and allotted-hours progress',
    lunch:    '4 · Lunch Break flips the banner yellow — timer pauses billing',
    complete: '5 · Complete Job marks done, time entry lands, ready to invoice',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Field Scout works'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
