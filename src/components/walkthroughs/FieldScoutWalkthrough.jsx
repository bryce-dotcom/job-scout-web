// Field Scout walkthrough — rebuilt to EXACT Prospect Scout standard.
// Source: src/pages/FieldScout.jsx — the field tech's mobile daily workspace.
// This is the most important tech-facing page. Read every line carefully.
//
// Real structure from FieldScout.jsx:
//   Section 1:   Compass + "Good morning" + date + big monospace clock
//   Section 1.5: Week card — hours this week + 7-day grid
//   Section 2:   Active clock banner (green or yellow gradient) + Job Briefing
//                + line items with Before/After camera + action buttons
//   Section 3:   Quick stats strip (Jobs Today / Hours / Completed)
//   Bonus:       Purple efficiency bonus card (accumulates when < allotted hrs)
//   Victor:      Purple "Run Quick Check" block gates clock-out
//   Section 4:   Today's Jobs list — tap to expand, Clock In button
//
// DO NOT import ZachShell.

import { motion, AnimatePresence } from 'framer-motion'
import {
  Compass, Calendar, Briefcase, Timer, CheckCircle,
  MapPin, ChevronDown, ChevronUp, Square, Coffee, Shield, Camera,
  DollarSign, Play, Lock, AlertTriangle,
} from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/field-scout.js'

// ─── Theme ─────────────────────────────────────────────────────────────────
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

// Mock data
const MOCK_JOBS = [
  {
    id: 1,
    job_id: 'JOB-041',
    job_title: 'LED Retrofit — Northbridge',
    customer: { name: 'Northbridge Logistics' },
    status: 'In Progress',
    job_address: '1440 S Temple, Salt Lake City, UT 84115',
    allotted_time_hours: 6,
    time_tracked: 2.5,
    lines: [
      { id: 'l1', quantity: 24, item: { name: '48" LED Strip Fixture (Type A)' }, before: 2, after: 0 },
      { id: 'l2', quantity: 24, item: { name: 'LED Driver — 100W' },            before: 1, after: 0 },
      { id: 'l3', quantity: 1,  item: { name: 'Installation Labor' },           before: 0, after: 0 },
    ],
  },
  {
    id: 2,
    job_id: 'JOB-039',
    job_title: 'Parking Lot LED',
    customer: { name: 'David Kim · Solera Electric' },
    status: 'Scheduled',
    job_address: '892 Lone Peak Pkwy, Draper, UT 84020',
    allotted_time_hours: 4,
    time_tracked: 0,
    lines: [],
  },
]

// ─── Root ──────────────────────────────────────────────────────────────────
export default function FieldScoutWalkthrough() {
  const runner = useWalkthroughRunner(card)
  const { phase, sceneKey, sceneElapsed, setupIdx, setupShowingIntro,
    elapsed, totalMs, totalMarketingMs, voiceOn, setVoiceOn, replay } = runner

  return (
    <div style={{
      position: 'relative', width: '100%', paddingBottom: '56.25%',
      background: '#e8e4d8', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        {phase === 'marketing' && (
          <Stage scene={sceneKey} sceneElapsed={sceneElapsed} />
        )}
        <AnimatePresence mode="wait">
          {phase === 'setup' && setupShowingIntro && <SetupIntro key="intro" />}
          {phase === 'setup' && !setupShowingIntro && (
            <CenteredOverlay key="checklist">
              <SetupChecklist
                title={`Set it up in ${card.setup.steps.length} steps`}
                steps={card.setup.steps}
                currentIdx={setupIdx}
              />
            </CenteredOverlay>
          )}
          {phase === 'done' && (
            <DonePanel key="done" onReplay={replay} subtitle="Field Scout is your crew's daily home base." />
          )}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

// ─── Stage — phone-width centered column ──────────────────────────────────
function Stage({ scene, sceneElapsed }) {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      display: 'flex', justifyContent: 'center',
      backgroundColor: T.bg, overflowY: 'hidden',
    }}>
      {/* Phone-width centered column — mirrors FieldScout.jsx max-width 600px */}
      <div style={{
        width: '100%', maxWidth: '360px',
        padding: '14px 14px 8px',
        display: 'flex', flexDirection: 'column', gap: '10px',
        overflowY: 'auto',
        fontFamily: 'system-ui, sans-serif',
        color: T.text,
      }}>

        {/* ═══ SECTION 1: HEADER (lines 1527-1558) ══════════════════════ */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', marginBottom: '2px' }}>
            <Compass size={18} style={{ color: T.accent }} />
            <span style={{ fontSize: '17px', fontWeight: '700', color: T.text }}>
              Good morning, Doug
            </span>
          </div>
          {/* RankBadge placeholder */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '4px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', borderRadius: '12px', fontSize: '10px', fontWeight: '700', backgroundColor: '#fef9c3', color: '#a16207', border: '1px solid #fcd34d' }}>
              ⭐ Level 2 · Field Lead
            </span>
          </div>
          <div style={{ fontSize: '11px', color: T.textMuted, marginBottom: '4px' }}>
            Monday, June 9, 2026
          </div>
          {/* Big monospace clock — 36px accent */}
          <div style={{
            fontSize: '32px', fontWeight: '700',
            fontFamily: 'monospace', color: T.accent, letterSpacing: '2px',
          }}>
            7:48:31 AM
          </div>
        </div>

        {/* ═══ SECTION 1.5: WEEK CARD — only when not clocked in ════════ */}
        {(scene === 'morning' || scene === 'bonus') && <WeekCard scene={scene} />}

        {/* ═══ SECTION 2: ACTIVE CLOCK BANNER (working/lunch/victor) ══ */}
        {(scene === 'working' || scene === 'lunch' || scene === 'victor') && (
          <ActiveClockBanner scene={scene} sceneElapsed={sceneElapsed} showBriefing={scene !== 'victor'} />
        )}

        {/* ═══ SECTION 3: QUICK STATS — victor uses its gate instead ══ */}
        {scene !== 'victor' && <QuickStats scene={scene} />}

        {/* ═══ EFFICIENCY BONUS CARD — bonus scene only ═══════════════ */}
        {scene === 'bonus' && <BonusCard scene={scene} />}

        {/* ═══ VICTOR CHECK GATE ══════════════════════════════════════ */}
        {scene === 'victor' && <VictorGate />}

        {/* ═══ SECTION 4: TODAY'S JOBS — morning only ════════════════ */}
        {scene === 'morning' && <TodaysJobs scene={scene} />}

      </div>
    </div>
  )
}

// ─── Week card ─────────────────────────────────────────────────────────────
function WeekCard({ scene }) {
  const clocked = scene === 'working' || scene === 'lunch' || scene === 'victor'
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
    <div style={{
      backgroundColor: T.bgCard, border: `1px solid ${T.border}`,
      borderRadius: '12px', padding: '12px 14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: T.textMuted, fontSize: '10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          <Calendar size={12} />This Week
        </div>
        <span style={{ fontSize: '10px', color: T.textMuted }}>Jun 9 – Jun 15</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', marginBottom: '10px' }}>
        <span style={{ fontSize: '26px', fontWeight: 800, color: T.accent, lineHeight: 1 }}>15.50</span>
        <span style={{ fontSize: '11px', color: T.textMuted }}>hours</span>
        {clocked && (
          <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '2px 7px', borderRadius: '999px', backgroundColor: 'rgba(34,197,94,0.15)', color: '#16a34a', fontSize: '10px', fontWeight: 600 }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#16a34a', display: 'inline-block' }} />
            live
          </span>
        )}
      </div>
      {/* 7-day grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '3px' }}>
        {days.map((d, i) => (
          <div key={i} style={{
            textAlign: 'center', padding: '4px 2px', borderRadius: '6px',
            backgroundColor: d.today ? T.accentBg : 'transparent',
            border: `1px solid ${d.today ? T.accent + '40' : 'transparent'}`,
          }}>
            <div style={{ fontSize: '9px', fontWeight: 600, color: d.today ? T.accent : T.textMuted, marginBottom: '1px' }}>{d.label}</div>
            <div style={{ fontSize: '10px', fontWeight: 600, color: d.hours > 0 ? T.text : T.textMuted }}>
              {d.hours > 0 ? d.hours.toFixed(1) : '—'}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Active Clock Banner — the green (or yellow) heart of Field Scout ─────
// Mirrors FieldScout.jsx lines 1619-2083
function ActiveClockBanner({ scene, sceneElapsed, showBriefing = true }) {
  const isLunch = scene === 'lunch'
  const isVictor = scene === 'victor'

  // Fake elapsed timer ticking
  const baseSeconds = 3 * 3600 + 42 * 60 + 17
  const totalSecs = baseSeconds + Math.floor(sceneElapsed / 1000)
  const hrs = Math.floor(totalSecs / 3600)
  const mins = Math.floor((totalSecs % 3600) / 60)
  const secs = totalSecs % 60
  const pad = n => String(n).padStart(2, '0')
  const elapsed = `${pad(hrs)}:${pad(mins)}:${pad(secs)}`

  const bg = isLunch
    ? 'linear-gradient(135deg, #eab308 0%, #ca8a04 100%)'
    : 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)'

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35 }}
      style={{ background: bg, borderRadius: '16px', padding: '16px', color: '#fff', position: 'relative', overflow: 'hidden' }}
    >
      {/* Pulsing dot — top-right corner */}
      <motion.div
        animate={{ opacity: [0.8, 0.3, 0.8] }}
        transition={{ repeat: Infinity, duration: 2 }}
        style={{ position: 'absolute', top: '14px', right: '14px', width: '9px', height: '9px', borderRadius: '50%', backgroundColor: '#fff' }}
      />

      {/* Status + elapsed */}
      <div style={{ fontSize: '12px', opacity: 0.85, marginBottom: '2px' }}>
        {isLunch ? 'On Lunch Break' : 'Currently Working'}
      </div>
      <div style={{ fontSize: '36px', fontWeight: '900', fontFamily: 'monospace', lineHeight: 1, marginBottom: '3px' }}>
        {elapsed}
      </div>
      <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '10px' }}>
        LED Retrofit — Northbridge
      </div>

      {/* Allotted hours progress bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px', fontSize: '10px', opacity: 0.9 }}>
        <span>3.7 / 6.0 allotted hrs</span>
        <span style={{ padding: '1px 7px', borderRadius: '999px', backgroundColor: 'rgba(255,255,255,0.2)', fontWeight: '700' }}>
          2.3 hrs left
        </span>
      </div>
      <div style={{ height: '9px', backgroundColor: 'rgba(255,255,255,0.28)', borderRadius: '5px', overflow: 'hidden', marginBottom: '14px' }}>
        <div style={{ width: '62%', height: '100%', backgroundColor: '#fff', opacity: 0.88, borderRadius: '5px' }} />
      </div>

      {/* Job Briefing — hidden in victor scene (gate is more important) */}
      {showBriefing && <div style={{
        backgroundColor: 'rgba(255,255,255,0.13)',
        borderRadius: '12px', padding: '10px 12px', marginBottom: '12px',
        border: '1px solid rgba(255,255,255,0.2)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: '700' }}>
            <Briefcase size={14} />Job Briefing
          </div>
          <ChevronDown size={14} style={{ opacity: 0.75 }} />
        </div>
        {/* Address */}
        <div style={{ fontSize: '11px', marginBottom: '8px', opacity: 0.9, textDecoration: 'underline', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <MapPin size={11} />1440 S Temple, Salt Lake City, UT 84115
        </div>
        {/* Line items with Before/After camera buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {[
            { qty: 24, name: '48" LED Strip Fixture (Type A)', before: 2, after: 0 },
            { qty: 24, name: 'LED Driver — 100W',              before: 1, after: 0 },
          ].map((li, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
              backgroundColor: 'rgba(255,255,255,0.11)', borderRadius: '8px', padding: '7px 9px',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '1px' }}>
                  <div style={{ minWidth: '24px', height: '19px', borderRadius: '5px', backgroundColor: 'rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '800' }}>{li.qty}x</div>
                  <span style={{ fontSize: '11px', fontWeight: '600' }}>{li.name}</span>
                </div>
              </div>
              {/* Camera button */}
              <button style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '3px', padding: '5px 8px', minHeight: '30px', background: li.before > 0 ? 'rgba(255,255,255,0.28)' : 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.35)', borderRadius: '7px', color: '#fff', cursor: 'pointer' }}>
                <Camera size={12} />
                {li.before > 0 && <span style={{ fontSize: '10px', fontWeight: 700 }}>{li.before}</span>}
              </button>
            </div>
          ))}
        </div>
      </div>}

      {/* Action buttons: Take Lunch + Clock Out */}
      <div style={{ display: 'flex', gap: '8px' }}>
        <button style={{
          flex: 1, padding: '12px', backgroundColor: 'rgba(255,255,255,0.22)', border: 'none',
          borderRadius: '10px', color: '#fff', fontSize: '13px', fontWeight: '600',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', minHeight: '44px',
          cursor: 'pointer',
        }}>
          <Coffee size={16} />{isLunch ? 'End Lunch' : 'Take Lunch'}
        </button>
        <button style={{
          flex: 1, padding: '12px',
          backgroundColor: isVictor ? 'rgba(239,68,68,0.5)' : 'rgba(239,68,68,0.9)',
          border: 'none', borderRadius: '10px', color: '#fff', fontSize: '13px', fontWeight: '600',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', minHeight: '44px',
          cursor: 'pointer',
        }}>
          {isVictor ? <><Lock size={14} />Clock Out</> : <><Square size={14} />Clock Out</>}
        </button>
      </div>
    </motion.div>
  )
}

// ─── Quick stats strip (lines 2222-2257) ──────────────────────────────────
function QuickStats({ scene }) {
  const clocked = scene === 'working' || scene === 'lunch' || scene === 'victor' || scene === 'bonus'
  return (
    <div style={{ display: 'flex', gap: '7px' }}>
      {[
        { label: 'Jobs Today', value: '2',          icon: Briefcase },
        { label: 'Hours Used / Allotted', value: clocked ? '3.7 / 6h' : '—', icon: Timer, color: undefined },
        { label: 'Completed', value: '0',           icon: CheckCircle },
      ].map((s, i) => (
        <div key={i} style={{
          flex: 1, backgroundColor: T.bgCard, border: `1px solid ${T.border}`,
          borderRadius: '10px', padding: '9px 7px', textAlign: 'center',
        }}>
          <s.icon size={14} style={{ color: T.accent, marginBottom: '3px' }} />
          <div style={{ fontSize: '15px', fontWeight: '700', color: s.color || T.text, lineHeight: 1.2 }}>{s.value}</div>
          <div style={{ fontSize: '9px', color: T.textMuted, marginTop: '2px', lineHeight: 1.2 }}>{s.label}</div>
        </div>
      ))}
    </div>
  )
}

// ─── Efficiency Bonus Card (lines 2259-2343) ──────────────────────────────
// Purple gradient — the gamification heart of the bonus system
function BonusCard({ scene }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      style={{
        background: 'linear-gradient(135deg, rgba(168,85,247,0.10) 0%, rgba(124,58,237,0.06) 100%)',
        border: '1px solid rgba(168,85,247,0.35)',
        borderRadius: '14px', padding: '13px 14px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {/* Purple gradient icon */}
        <div style={{
          width: '40px', height: '40px', borderRadius: '11px', flexShrink: 0,
          background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <DollarSign size={20} color="#fff" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '11px', color: T.textMuted, fontWeight: '500' }}>
            Bonus Earned This Pay Period
          </div>
          <div style={{ fontSize: '20px', fontWeight: '700', color: '#8b5cf6', lineHeight: 1.2 }}>
            $84.50
          </div>
          <div style={{ fontSize: '10px', color: T.textMuted, marginTop: '1px' }}>
            From 2 jobs — tap to see breakdown
          </div>
        </div>
        <ChevronDown size={16} style={{ color: T.textMuted, flexShrink: 0 }} />
      </div>
      {/* Expandable breakdown — shown in bonus scene */}
      {scene === 'bonus' && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} transition={{ duration: 0.3 }}
          style={{ marginTop: '10px', paddingTop: '10px', borderTop: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', gap: '6px' }}
        >
          {[
            { title: 'LED Retrofit — Northbridge', allotted: 6,   actual: 4.5, saved: 1.5, bonus: 52.50 },
            { title: 'Parking Lot LED',            allotted: 4,   actual: 3.1, saved: 0.9, bonus: 32.00 },
          ].map((d, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 11px', backgroundColor: T.bgCard, borderRadius: '8px', border: `1px solid ${T.border}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '11px', fontWeight: '600', color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.title}</div>
                <div style={{ fontSize: '9px', color: T.textMuted, marginTop: '2px' }}>
                  Allotted {d.allotted}h · Actual {d.actual}h · Saved {d.saved}h
                </div>
              </div>
              <div style={{ fontSize: '12px', fontWeight: '700', color: '#8b5cf6', flexShrink: 0, marginLeft: '8px' }}>
                +${d.bonus.toFixed(2)}
              </div>
            </div>
          ))}
        </motion.div>
      )}
    </motion.div>
  )
}

// ─── Victor check gate (lines 2086-2146) ──────────────────────────────────
// "Quick check before you clock out" — purple gradient, 60-second check
function VictorGate() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.15 }}
      style={{
        padding: '14px', backgroundColor: 'rgba(168,85,247,0.07)',
        border: '1px solid rgba(168,85,247,0.35)', borderRadius: '12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '10px' }}>
        <div style={{
          width: '34px', height: '34px', flexShrink: 0, borderRadius: '9px',
          background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Shield size={17} color="#fff" />
        </div>
        <div>
          <div style={{ fontSize: '13px', fontWeight: '700', color: T.text, marginBottom: '3px' }}>
            Quick check before you clock out
          </div>
          <div style={{ fontSize: '11px', color: T.textSecondary, lineHeight: 1.5 }}>
            Run a 60-second Victor check — a few photos and a couple of questions. This confirms the job's done so you get paid your <strong>efficiency bonus</strong>.
          </div>
        </div>
      </div>
      <button style={{
        width: '100%', padding: '12px',
        background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
        border: 'none', borderRadius: '9px', color: '#fff', fontSize: '13px', fontWeight: '700',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px', cursor: 'pointer',
        minHeight: '44px', boxShadow: '0 2px 8px rgba(168,85,247,0.3)',
      }}>
        <Shield size={15} />
        Run Quick Check (60 sec)
      </button>
    </motion.div>
  )
}

// ─── Today's Jobs (lines 2535-end) ────────────────────────────────────────
function TodaysJobs({ scene }) {
  const showExpanded = scene === 'morning' // Show expanded job card with clock-in in the morning scene
  const activeJobId  = (scene === 'working' || scene === 'lunch' || scene === 'victor') ? MOCK_JOBS[0].id : null

  return (
    <div>
      <h2 style={{ fontSize: '14px', fontWeight: '600', color: T.text, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
        <Briefcase size={15} style={{ color: T.accent }} />
        Today's Jobs
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
        {MOCK_JOBS.map((job, jIdx) => {
          const isActive = job.id === activeJobId
          const isExpanded = showExpanded && jIdx === 0
          const sc = isActive
            ? { bg: 'rgba(34,197,94,0.12)', text: '#22c55e' }
            : job.status === 'Scheduled'
            ? { bg: 'rgba(90,99,73,0.12)', text: '#5a6349' }
            : { bg: 'rgba(194,139,56,0.12)', text: '#c28b38' }

          return (
            <motion.div
              key={job.id}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: jIdx * 0.1, duration: 0.3 }}
              style={{
                backgroundColor: T.bgCard,
                border: `1px solid ${isActive ? '#22c55e' : T.border}`,
                borderLeft: isActive ? '4px solid #22c55e' : `1px solid ${T.border}`,
                borderRadius: '12px', overflow: 'hidden',
                boxShadow: isActive ? '0 0 18px rgba(34,197,94,0.15)' : T.shadow,
              }}
            >
              {/* Card header */}
              <div style={{ padding: '13px 14px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: T.text, marginBottom: '1px' }}>{job.job_title}</div>
                    <div style={{ fontSize: '11px', color: T.textMuted }}>{job.customer.name}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    <span style={{ padding: '3px 9px', borderRadius: '18px', fontSize: '10px', fontWeight: '600', backgroundColor: sc.bg, color: sc.text }}>
                      {isActive ? 'Working' : job.status}
                    </span>
                    {isExpanded ? <ChevronUp size={14} style={{ color: T.textMuted }} /> : <ChevronDown size={14} style={{ color: T.textMuted }} />}
                  </div>
                </div>
                {/* Address — blue link (taps to Google Maps) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '11px', color: '#3b82f6', cursor: 'pointer' }}>
                  <MapPin size={11} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{job.job_address}</span>
                </div>
                {/* Hours used / allotted chip */}
                {job.allotted_time_hours > 0 && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '10px', padding: '2px 8px', borderRadius: '8px', backgroundColor: T.accentBg, color: T.accent, width: 'fit-content' }}>
                    <Timer size={10} />
                    {job.time_tracked > 0 ? `${job.time_tracked}h / ${job.allotted_time_hours}h allotted` : `${job.allotted_time_hours}h allotted`}
                  </div>
                )}
              </div>

              {/* Expanded body: Clock In button */}
              {isExpanded && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  transition={{ duration: 0.3 }}
                  style={{ borderTop: `1px solid ${T.border}`, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}
                >
                  {/* Notes from job briefing */}
                  <div style={{ fontSize: '11px', color: T.textSecondary, padding: '8px', backgroundColor: T.bg, borderRadius: '7px' }}>
                    <strong>Scope:</strong> 48 × Type A LED Strip Fixtures · Warehouse bay lighting replacement. All conduit pre-run. Start in Bay 1 (North).
                  </div>
                  {/* Clock In button — accent, full-width, 44px min */}
                  <button style={{
                    width: '100%', padding: '13px', border: 'none', borderRadius: '10px',
                    backgroundColor: T.accent, color: '#fff', fontSize: '14px', fontWeight: '700',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
                    cursor: 'pointer', minHeight: '44px',
                  }}>
                    <Play size={15} />Clock In to This Job
                  </button>
                </motion.div>
              )}
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Caption ───────────────────────────────────────────────────────────────
function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    morning: '1 · Field Scout opens to "Good morning" + live clock + week hours + today\'s jobs',
    working: '2 · Clocked in — green banner with 36px live timer, allotted-hour progress bar, Job Briefing with scope + Before/After camera per line item',
    lunch:   '3 · Take Lunch turns the banner yellow — timer pauses billing while you eat',
    victor:  '4 · Clock Out triggers Victor\'s 60-second photo check — purple gate protects the efficiency bonus',
    bonus:   '5 · Finish under allotted hours → efficiency bonus accumulates in purple, with per-job breakdown',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Field Scout works for your crew'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
