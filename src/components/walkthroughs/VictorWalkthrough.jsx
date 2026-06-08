// Victor walkthrough — rebuilt to Prospect Scout standard.
// Source: src/pages/agents/victor/VictorVerify.jsx
// Victor is a photo QA agent — grade A–F, before/after completeness checks.
// DO NOT import ZachShell.

import { motion, AnimatePresence } from 'framer-motion'
import { ShieldCheck, Camera, Upload, Star, CheckCircle, AlertTriangle, X } from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/victor.js'

const T = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

// gradeColors from VictorVerify.jsx line 21
const GRADE_COLORS = { 'A': '#22c55e', 'B': '#3b82f6', 'C': '#f59e0b', 'D': '#f97316', 'F': '#ef4444' }

// Mock Victor report
const MOCK_REPORT = {
  grade: 'B',
  job: 'LED Retrofit — Northbridge · JOB-041',
  score: 82,
  checks: [
    { type: 'completion', label: 'Completed Work',   status: 'pass', photos: 3 },
    { type: 'before',     label: 'Before Photos',    status: 'pass', photos: 4 },
    { type: 'after',      label: 'After Photos',     status: 'pass', photos: 4 },
    { type: 'cleanliness',label: 'Cleanliness',      status: 'warn', photos: 1 },
    { type: 'workquality',label: 'Work Quality',     status: 'pass', photos: 2 },
    { type: 'general',    label: 'General — Missing',status: 'fail', photos: 0 },
  ],
  notes: "Good coverage on Before/After. Missing general site photos. Cleanliness documentation sparse — needs 2+ cleanup shots for full score.",
}

export default function VictorWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Quality verified before payroll." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene }) {
  const showGrade = scene !== 'upload'
  const gc = GRADE_COLORS[MOCK_REPORT.grade]

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', fontSize: '11px', fontFamily: 'system-ui, sans-serif', color: T.text, padding: '12px 14px', gap: '8px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <ShieldCheck size={16} style={{ color: '#8b5cf6' }} />
        <span style={{ fontSize: '15px', fontWeight: '700', color: T.text }}>Victor</span>
        <span style={{ fontSize: '10px', color: T.textMuted }}>Photo Verification Agent</span>
      </div>

      {/* Job context */}
      <div style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '8px', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
        <Camera size={13} style={{ color: T.accent, flexShrink: 0 }} />
        <span style={{ fontSize: '11px', fontWeight: '500', color: T.text }}>{MOCK_REPORT.job}</span>
        {scene === 'upload' && (
          <button style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', border: 'none', borderRadius: '5px', backgroundColor: '#8b5cf6', color: '#fff', fontSize: '10px', cursor: 'pointer' }}>
            <Upload size={10} />Upload Photos
          </button>
        )}
      </div>

      {/* Grade card */}
      {showGrade && (
        <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.35 }}
          style={{ backgroundColor: T.bgCard, border: `2px solid ${gc}`, borderRadius: '10px', padding: '14px', display: 'flex', alignItems: 'center', gap: '16px' }}
        >
          <div style={{ width: '52px', height: '52px', borderRadius: '12px', backgroundColor: gc + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '26px', fontWeight: '900', color: gc, flexShrink: 0 }}>
            {MOCK_REPORT.grade}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '12px', fontWeight: '700', color: T.text }}>Quality Score: {MOCK_REPORT.score}/100</div>
            <div style={{ fontSize: '10px', color: T.textSecondary, marginTop: '3px' }}>{MOCK_REPORT.notes}</div>
          </div>
        </motion.div>
      )}

      {/* Check grid */}
      {showGrade && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
          {MOCK_REPORT.checks.map((check, i) => {
            const color = check.status === 'pass' ? '#22c55e' : check.status === 'warn' ? '#f59e0b' : '#ef4444'
            const Icon = check.status === 'pass' ? CheckCircle : check.status === 'warn' ? AlertTriangle : X
            return (
              <motion.div key={check.type} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07, duration: 0.25 }}
                style={{ backgroundColor: color + '10', border: `1px solid ${color}30`, borderRadius: '7px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '3px' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Icon size={10} style={{ color, flexShrink: 0 }} />
                  <span style={{ fontSize: '9px', fontWeight: '600', color }}>{check.label}</span>
                </div>
                <span style={{ fontSize: '10px', color: T.textMuted }}>{check.photos} photo{check.photos !== 1 ? 's' : ''}</span>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    upload: '1 · Victor — photo QA agent, upload job photos for review',
    grade:  '2 · Victor grades the submission A–F with a score out of 100',
    check:  '3 · Six checks: Before, After, Completed Work, Cleanliness, Quality, General',
    notes:  '4 · AI notes exactly what\'s missing — "needs 2+ cleanup shots for full score"',
    block:  '5 · Failed Victor review can block efficiency bonuses until photos are complete',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Victor works'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
