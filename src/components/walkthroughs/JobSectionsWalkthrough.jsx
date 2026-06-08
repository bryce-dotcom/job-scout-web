// Job Sections walkthrough — rebuilt to Prospect Scout standard.
// Source: src/pages/JobDetail.jsx — job_sections table with percent/assigned/hours.
// DO NOT import ZachShell.

import { motion, AnimatePresence } from 'framer-motion'
import { Layers, Plus, User, Clock, Calendar, CheckCircle, X } from 'lucide-react'
import { useWalkthroughRunner } from './useWalkthroughRunner'
import VoiceToggle from './VoiceToggle'
import SetupChecklist from './SetupChecklist'
import {
  CenteredOverlay, SetupIntro, DonePanel,
  WalkthroughCaption, WalkthroughProgressBar,
} from './WalkthroughChrome'
import card from '../../lib/featureKnowledge/job-sections.js'

const T = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

// job_sections table shape from JobDetail.jsx
const MOCK_SECTIONS = [
  { id: 1, name: 'Bay 1 — North Wing',   percent: 30, assigned: 'Doug Anderson', est_hours: 1.8, status: 'Completed',   date: 'Jun 9'  },
  { id: 2, name: 'Bay 2 — South Wing',   percent: 30, assigned: 'Marcus Webb',   est_hours: 1.8, status: 'In Progress', date: 'Jun 9'  },
  { id: 3, name: 'Loading Dock Lights',  percent: 25, assigned: 'Doug Anderson', est_hours: 1.5, status: 'Not Started',  date: 'Jun 10' },
  { id: 4, name: 'Office + Break Room',  percent: 15, assigned: 'Marcus Webb',   est_hours: 0.9, status: 'Not Started',  date: 'Jun 10' },
]

const STATUS_COLORS = {
  'Completed':   { bg: 'rgba(74,124,89,0.12)',   text: '#4a7c59' },
  'In Progress': { bg: 'rgba(194,139,56,0.12)',  text: '#c28b38' },
  'Not Started': { bg: 'rgba(125,138,127,0.12)', text: '#7d8a7f' },
}

// Overall completion: sum of completed % sections
const completedPct = MOCK_SECTIONS
  .filter(s => s.status === 'Completed')
  .reduce((sum, s) => sum + s.percent, 0)

export default function JobSectionsWalkthrough() {
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
          {phase === 'done' && <DonePanel key="done" onReplay={replay} subtitle="Jobs broken into trackable sections." />}
        </AnimatePresence>
      </div>
      <VoiceToggle enabled={voiceOn} onToggle={() => setVoiceOn(v => !v)} theme={T} />
      <WalkthroughCaption text={caption(phase, sceneKey, setupIdx, setupShowingIntro)} />
      <WalkthroughProgressBar elapsed={elapsed} total={totalMs} phaseBoundary={totalMarketingMs} />
    </div>
  )
}

function Stage({ scene }) {
  const showModal = scene === 'add'

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', fontSize: '11px', fontFamily: 'system-ui, sans-serif', color: T.text, padding: '12px 14px', gap: '8px', overflow: 'hidden', position: 'relative' }}>
      {/* Header (within Job Detail page context) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <Layers size={15} style={{ color: T.accent }} />
          <span style={{ fontSize: '14px', fontWeight: '700', color: T.text }}>LED Retrofit — Northbridge</span>
          <span style={{ fontSize: '10px', color: T.textMuted }}>· JOB-041</span>
        </div>
        <button style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '5px 10px', border: 'none', borderRadius: '5px', backgroundColor: T.accent, color: '#fff', fontSize: '10px', cursor: 'pointer' }}>
          <Plus size={11} />Add Section
        </button>
      </div>

      {/* Overall progress bar */}
      <div style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', padding: '10px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
          <span style={{ fontSize: '11px', fontWeight: '600', color: T.text }}>Overall Progress</span>
          <span style={{ fontSize: '12px', fontWeight: '700', color: T.accent }}>{completedPct}%</span>
        </div>
        <div style={{ height: '8px', backgroundColor: T.bg, borderRadius: '4px', overflow: 'hidden' }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${completedPct}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            style={{ height: '100%', backgroundColor: T.accent, borderRadius: '4px' }}
          />
        </div>
      </div>

      {/* Section list */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', overflowY: 'auto' }}>
        {MOCK_SECTIONS.map((section, i) => {
          const sc = STATUS_COLORS[section.status] || STATUS_COLORS['Not Started']
          return (
            <motion.div key={section.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07, duration: 0.25 }}
              style={{ backgroundColor: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '9px', padding: '10px 12px' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '5px' }}>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{section.name}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, marginLeft: '8px' }}>
                  <span style={{ fontSize: '10px', fontWeight: '700', color: T.accent }}>{section.percent}%</span>
                  <span style={{ padding: '2px 7px', borderRadius: '8px', fontSize: '9px', fontWeight: '600', backgroundColor: sc.bg, color: sc.text }}>{section.status}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', fontSize: '10px', color: T.textMuted, flexWrap: 'wrap' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><User size={10} />{section.assigned}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><Clock size={10} />{section.est_hours}h est</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><Calendar size={10} />{section.date}</span>
              </div>
            </motion.div>
          )
        })}
      </div>

      {/* Add Section modal */}
      {showModal && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10, padding: '16px' }}>
          <motion.div initial={{ scale: 0.96 }} animate={{ scale: 1 }} style={{ backgroundColor: T.bgCard, borderRadius: '12px', border: `1px solid ${T.border}`, width: '280px', boxShadow: '0 8px 32px rgba(0,0,0,0.16)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', borderBottom: `1px solid ${T.border}` }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: T.text }}>Add Section</span>
              <X size={13} style={{ color: T.textMuted }} />
            </div>
            <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[['Section Name', 'Office + Break Room'], ['% of Job', '15'], ['Assigned To', 'Marcus Webb'], ['Est. Hours', '0.9'], ['Scheduled Date', 'Jun 10']].map(([l, v]) => (
                <div key={l}>
                  <label style={{ display: 'block', fontSize: '10px', fontWeight: '500', color: T.textSecondary, marginBottom: '3px' }}>{l}</label>
                  <div style={{ padding: '5px 8px', border: `1px solid ${T.border}`, borderRadius: '5px', backgroundColor: T.bg, fontSize: '11px', color: T.text }}>{v}</div>
                </div>
              ))}
              <div style={{ display: 'flex', gap: '7px' }}>
                <button style={{ flex: 1, padding: '7px', border: `1px solid ${T.border}`, borderRadius: '5px', backgroundColor: 'transparent', color: T.textSecondary, fontSize: '10px', cursor: 'pointer' }}>Cancel</button>
                <button style={{ flex: 1, padding: '7px', border: 'none', borderRadius: '5px', backgroundColor: T.accent, color: '#fff', fontSize: '10px', fontWeight: '500', cursor: 'pointer' }}>Save</button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  )
}

function caption(phase, sceneKey, setupIdx, setupShowingIntro) {
  const m = {
    overview: '1 · Job Sections — overall progress bar + section list within a Job Detail page',
    add:      '2 · Add Section modal — name, % of job, assigned tech, estimated hours, scheduled date',
    progress: '3 · Overall progress bar fills as completed section percentages sum up',
    assign:   '4 · Each section assigned to a specific crew member — shows on their Field Scout',
    complete: '5 · Tech marks section done → % rolls into job progress → PM sees it update',
  }
  if (phase === 'marketing') return m[sceneKey] || ''
  if (phase === 'setup' && setupShowingIntro) return 'How Job Sections work'
  if (phase === 'setup') return `Setup ${setupIdx + 1}/${card.setup.steps.length} — ${card.setup.steps[setupIdx]?.title || ''}`
  if (phase === 'done') return "That's the loop. Replay anytime."
  return ''
}
